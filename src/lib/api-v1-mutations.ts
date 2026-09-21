import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { db } from '@/db/db'
import { ApiV1Error } from '@/lib/api-v1'
import { publishDocumentChange } from '@/lib/document-change-hub'
import { encodeTiptapDocument } from '@/lib/tiptap-codec'
import { extractPlainText } from '@/lib/tiptap-text-extractor'
import { z } from 'zod'

// --- Schemas ---

export const mutateContentSchema = z
  .object({
    content: z.record(z.unknown()),
    baseVersion: z.string().min(1).max(200),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .strict()

export const restoreVersionSchema = z
  .object({
    versionId: z.string().min(1),
    idempotencyKey: z.string().min(1).max(128).optional(),
  })
  .strict()

// --- Types ---

export interface MutationResult {
  documentId: string
  versionId: string
  etag: string
  operationId: string
}

export interface RestoreResult {
  documentId: string
  restoredVersionId: string
  recoverySnapshotId: string
  operationId: string
  title: string
}

export interface MutationDeps {
  callCollabMutate?: (docId: string, contentBinaryBase64: string) => Promise<void>
  callCollabRestore?: (docId: string, contentBinaryBase64: string) => Promise<void>
}

// --- Helpers ---

function computeDocEtag(docId: string, updatedAt: Date): string {
  const revision = createHash('sha256').update(`${docId}:${updatedAt.toISOString()}`).digest('base64url').slice(0, 24)
  return `"doc:${docId}:${revision}"`
}

async function callCollabMutateDefault(docId: string, contentBinaryBase64: string): Promise<void> {
  const baseUrl = process.env.COLLABORATE_EDIT_HTTP_URL || ''
  const internalKey = process.env.COLLABORATE_INTERNAL_API_KEY || ''
  if (!baseUrl) throw new Error('COLLABORATE_EDIT_HTTP_URL required')
  if (!internalKey) throw new Error('COLLABORATE_INTERNAL_API_KEY required')

  const res = await fetch(`${baseUrl}/collab/documents/${docId}/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-doc-internal-key': internalKey,
    },
    body: JSON.stringify({ contentBinaryBase64 }),
  })

  const data = await res.json()
  if (!res.ok || data.success === false) {
    throw new Error(data.msg || 'collaboration mutation failed')
  }
}

function isInactiveCollabRoom(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /active document not found/i.test(message)
}

async function persistIdleDocument(
  docId: string,
  encoded: { content: unknown; contentJson: string; contentBinary: Buffer }
) {
  const contentSearch = extractPlainText(encoded.content)
  await db.doc.update({
    where: { id: docId },
    data: {
      content: encoded.contentJson,
      contentBinary: encoded.contentBinary,
      contentSearch: contentSearch || null,
    },
  })
}

// --- Idempotency ---

const recentOperations = new Map<string, { result: MutationResult | RestoreResult; expiresAt: number }>()
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000

function getIdempotentResult(key: string): MutationResult | RestoreResult | null {
  const entry = recentOperations.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    recentOperations.delete(key)
    return null
  }
  return entry.result
}

function setIdempotentResult(key: string, result: MutationResult | RestoreResult): void {
  recentOperations.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS })
}

// Cleanup expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of recentOperations) {
      if (now > entry.expiresAt) recentOperations.delete(key)
    }
  }, 60_000).unref?.()
}

// --- Parse ---

export function parseMutateContent(value: unknown) {
  const parsed = mutateContentSchema.safeParse(value)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Invalid mutation payload'
    throw new ApiV1Error(422, 'validation_error', message)
  }
  return parsed.data
}

export function parseRestoreVersion(value: unknown) {
  const parsed = restoreVersionSchema.safeParse(value)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || 'Invalid restore payload'
    throw new ApiV1Error(422, 'validation_error', message)
  }
  return parsed.data
}

// --- Content mutation ---

export async function mutateDocumentContent(
  userId: string,
  docId: string,
  input: { content: Record<string, unknown>; baseVersion: string; idempotencyKey?: string },
  deps: MutationDeps = {}
): Promise<MutationResult> {
  const idempotencyKey = input.idempotencyKey ? `mutate:${userId}:${docId}:${input.idempotencyKey}` : null

  if (idempotencyKey) {
    const existing = getIdempotentResult(idempotencyKey)
    if (existing && 'etag' in existing) return existing
  }

  // Verify ownership and base version
  const doc = await db.doc.findFirst({
    where: { id: docId, userId, isDeleted: false },
    select: { id: true, title: true, content: true, contentBinary: true, updatedAt: true },
  })
  if (!doc) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  const currentEtag = computeDocEtag(docId, doc.updatedAt)
  if (input.baseVersion !== '*' && input.baseVersion !== currentEtag) {
    throw new ApiV1Error(409, 'version_conflict', 'Document has been modified since the specified base version')
  }

  // Encode the new content through Tiptap validation
  const encoded = encodeTiptapDocument(input.content)

  // Create a version snapshot of current state before mutation
  const snapshot = await db.docVersion.create({
    data: {
      docId,
      userId,
      title: doc.title,
      content: doc.content,
      contentBinary: doc.contentBinary || Buffer.from(''),
    },
    select: { id: true },
  })

  // Prefer the live Yjs room. If nobody is connected, persist JSON + binary
  // through the same document row the collab service writes on idle.
  const collabMutate = deps.callCollabMutate || callCollabMutateDefault
  const contentBinaryBase64 = encoded.contentBinary.toString('base64')
  try {
    await collabMutate(docId, contentBinaryBase64)
  } catch (error) {
    if (isInactiveCollabRoom(error)) {
      await persistIdleDocument(docId, encoded)
    } else {
      await db.docVersion.delete({ where: { id: snapshot.id } }).catch(() => undefined)
      throw new ApiV1Error(
        503,
        'collaboration_unavailable',
        'The collaboration service could not apply the content replacement'
      )
    }
  }

  // Fetch updated document for etag
  const updated = await db.doc.findFirst({
    where: { id: docId },
    select: { updatedAt: true },
  })
  const newEtag = updated ? computeDocEtag(docId, updated.updatedAt) : currentEtag

  const operationId = `mutate:${docId}:${snapshot.id}`
  const result: MutationResult = {
    documentId: docId,
    versionId: snapshot.id,
    etag: newEtag,
    operationId,
  }

  publishDocumentChange(docId, {
    documentId: docId,
    etag: newEtag,
    updatedAt: (updated?.updatedAt ?? new Date()).toISOString(),
  })

  if (idempotencyKey) setIdempotentResult(idempotencyKey, result)
  return result
}

// --- Version listing ---

export async function listDocumentVersions(userId: string, docId: string, params: URLSearchParams) {
  // Verify access
  const doc = await db.doc.findFirst({
    where: { id: docId, userId, isDeleted: false },
    select: { id: true },
  })
  if (!doc) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  const limit = Math.min(Math.max(Number(params.get('limit')) || 20, 1), 100)

  const versions = await db.docVersion.findMany({
    where: { docId, userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return {
    versions: versions.map((v) => ({
      id: v.id,
      title: v.title,
      createdAt: v.createdAt.toISOString(),
    })),
  }
}

// --- Restore ---

export async function restoreDocumentVersion(
  userId: string,
  docId: string,
  input: { versionId: string; idempotencyKey?: string },
  deps: MutationDeps = {}
): Promise<RestoreResult> {
  const idempotencyKey = input.idempotencyKey ? `restore:${userId}:${docId}:${input.idempotencyKey}` : null

  if (idempotencyKey) {
    const existing = getIdempotentResult(idempotencyKey)
    if (existing && 'recoverySnapshotId' in existing) return existing
  }

  // Verify ownership
  const doc = await db.doc.findFirst({
    where: { id: docId, userId, isDeleted: false },
    select: { id: true, title: true, content: true, contentBinary: true, updatedAt: true },
  })
  if (!doc) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  // Fetch target version
  const targetVersion = await db.docVersion.findFirst({
    where: { id: input.versionId, docId, userId },
    select: { id: true, title: true, content: true, contentBinary: true },
  })
  if (!targetVersion) throw new ApiV1Error(404, 'version_not_found', 'Version not found')

  // Preserve current state
  const recoverySnapshot = await db.docVersion.create({
    data: {
      docId,
      userId,
      title: doc.title,
      content: doc.content,
      contentBinary: doc.contentBinary || Buffer.from(''),
    },
    select: { id: true },
  })

  // Restore through collaboration authority
  const collabRestore = deps.callCollabRestore || callCollabMutateDefault
  const targetBinaryBase64 = Buffer.from(targetVersion.contentBinary).toString('base64')
  await collabRestore(docId, targetBinaryBase64)

  // Update title
  await db.doc.update({
    where: { id: docId },
    data: { title: targetVersion.title },
  })

  const operationId = `restore:${docId}:${targetVersion.id}`
  const result: RestoreResult = {
    documentId: docId,
    restoredVersionId: targetVersion.id,
    recoverySnapshotId: recoverySnapshot.id,
    operationId,
    title: targetVersion.title,
  }

  if (idempotencyKey) setIdempotentResult(idempotencyKey, result)
  return result
}
