import 'server-only'

import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { MAX_DOC_COUNT } from '@/constants'
import { db } from '@/db/db'
import { ApiV1Error } from '@/lib/api-v1'
import { getNextSortOrderForParent } from '@/lib/doc-sort-order'
import { EMPTY_TIPTAP_DOCUMENT, encodeTiptapDocument } from '@/lib/tiptap-codec'
import { parseOptionalDate, parseSort, buildSearchWhere, buildDateWhere, getOrderBy, SortValue } from '@/lib/doc-query'
import { extractPlainText } from '@/lib/tiptap-text-extractor'
import { fullTextSearch, computeMatchField, type MatchField } from '@/lib/doc-search'
import { DOCUMENT_ACCESS, resolveDocumentAccess } from '@/lib/document-access'
import { requestHostMemoryAdvice, type HostMemoryAccess } from '@/lib/host-memory-overlay'
import { askLaya, type LayaAnswer, type LayaQuestion } from '@/lib/laya/client'

export type ListApiDocumentsDeps = {
  env?: NodeJS.Dict<string>
  fetchImpl?: typeof fetch
}

const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed')
const iconSchema = z
  .string()
  .max(32)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed')
  .nullable()

export const createApiDocumentSchema = z
  .object({
    title: titleSchema,
    icon: iconSchema.optional(),
    parentId: z.string().min(1).nullable().optional(),
    content: z.record(z.unknown()).optional(),
  })
  .strict()

export const updateApiDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    icon: iconSchema.optional(),
    isStar: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one document field is required',
  })

const documentMetadataSelect = {
  id: true,
  title: true,
  icon: true,
  parentId: true,
  isStar: true,
  isDeleted: true,
  createdAt: true,
  updatedAt: true,
  contentSearch: true,
} satisfies Prisma.DocSelect

type DocumentMetadata = Prisma.DocGetPayload<{ select: typeof documentMetadataSelect }>
type DocumentAccess = 'owner' | 'write' | 'read'

interface ListCursor {
  updatedAt: string
  id: string
}

function validationError(error: z.ZodError) {
  const message = error.issues[0]?.message || 'Document payload is invalid'
  return new ApiV1Error(422, 'validation_error', message)
}

export function parseCreateApiDocument(value: unknown) {
  const parsed = createApiDocumentSchema.safeParse(value)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

export function parseUpdateApiDocument(value: unknown) {
  const parsed = updateApiDocumentSchema.safeParse(value)
  if (!parsed.success) throw validationError(parsed.error)
  return parsed.data
}

function encodeCursor(cursor: ListCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(value: string): ListCursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
    if (
      typeof decoded.updatedAt !== 'string' ||
      Number.isNaN(new Date(decoded.updatedAt).getTime()) ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0
    ) {
      throw new Error('invalid cursor')
    }
    return {
      updatedAt: new Date(decoded.updatedAt).toISOString(),
      id: decoded.id,
    }
  } catch {
    throw new ApiV1Error(400, 'invalid_cursor', 'Cursor is invalid')
  }
}

function parseBooleanQuery(value: string | null, name: string) {
  if (value == null) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ApiV1Error(400, 'invalid_query', `${name} must be true or false`)
}

function parseListLimit(value: string | null) {
  if (value == null) return DEFAULT_LIST_LIMIT
  if (!/^\d+$/.test(value)) throw new ApiV1Error(400, 'invalid_query', 'limit must be an integer')
  const limit = Number(value)
  if (limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new ApiV1Error(400, 'invalid_query', `limit must be between 1 and ${MAX_LIST_LIMIT}`)
  }
  return limit
}

export function apiDocumentEtag(document: Pick<DocumentMetadata, 'id' | 'updatedAt'>) {
  const revision = createHash('sha256')
    .update(`${document.id}:${document.updatedAt.toISOString()}`)
    .digest('base64url')
    .slice(0, 24)
  return `"doc:${document.id}:${revision}"`
}

function toMetadataDto(document: DocumentMetadata, access: DocumentAccess = 'owner', matchField?: MatchField) {
  return {
    id: document.id,
    title: document.title,
    icon: document.icon,
    parentId: document.parentId,
    starred: document.isStar,
    deleted: document.isDeleted,
    access,
    ...(matchField ? { matchField } : {}),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  }
}

function parseStoredContent(content: string) {
  if (!content.trim()) return EMPTY_TIPTAP_DOCUMENT
  try {
    const parsed = JSON.parse(content)
    if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object' || parsed.type !== 'doc') {
      throw new Error('invalid TipTap root')
    }
    return parsed
  } catch {
    throw new ApiV1Error(500, 'invalid_stored_content', 'Stored document content is not valid JSON')
  }
}

export async function listApiDocuments(userId: string, searchParams: URLSearchParams, deps: ListApiDocumentsDeps = {}) {
  const limit = parseListLimit(searchParams.get('limit'))
  const starred = parseBooleanQuery(searchParams.get('starred'), 'starred')
  const trash = parseBooleanQuery(searchParams.get('trash'), 'trash') || false
  const query = searchParams.get('query')?.trim() || ''
  if (query.length > 200) throw new ApiV1Error(400, 'invalid_query', 'query must not exceed 200 characters')

  const after = parseOptionalDate(searchParams.get('after'), 'after')
  const before = parseOptionalDate(searchParams.get('before'), 'before')
  const sort = parseSort(searchParams.get('sort'))

  const where: Prisma.DocWhereInput = {
    userId,
    isDeleted: trash,
    ...(starred === undefined ? {} : { isStar: starred }),
    ...buildSearchWhere(query),
    ...buildDateWhere(after, before),
  }

  let searchHits: Map<string, MatchField> | null = null
  if (query) {
    const hits = await fullTextSearch(userId, query, {
      isDeleted: trash,
      ...(starred === undefined ? {} : { isStar: starred }),
    })
    // Empty array: tsquery produced zero hits. Keep the contains OR from
    // buildSearchWhere — otherwise `id: { in: [] }` returns nothing and the
    // #69 fallback never runs (zh-cn queries against english config).
    if (hits && hits.length > 0) {
      searchHits = new Map(hits.map((h) => [h.id, h.matchField]))
      where.id = { in: hits.map((h) => h.id) }
      delete where.OR
    }
  }

  const cursorValue = searchParams.get('cursor')
  if (cursorValue) {
    if (sort === 'created_desc' || sort === 'created_asc') {
      throw new ApiV1Error(400, 'invalid_cursor', 'Cursor pagination is not supported for created_* sort orders')
    }
    const cursor = decodeCursor(cursorValue)
    const cursorDate = new Date(cursor.updatedAt)
    where.AND = [
      {
        OR: [{ updatedAt: { lt: cursorDate } }, { updatedAt: cursorDate, id: { lt: cursor.id } }],
      },
    ]
  }

  const orderBy = getOrderBy(sort)

  const rows = await db.doc.findMany({
    where,
    select: {
      ...documentMetadataSelect,
      userId: true,
      shareRelations: {
        where: { userId },
        select: { access: true, authorId: true },
      },
    },
    orderBy,
    take: limit + 1,
  })
  const hasMore = rows.length > limit
  const documents = rows.slice(0, limit)
  const last = documents.at(-1)

  const overlayCandidates = documents.map((document) => {
    const access = resolveDocumentAccess(
      { userId: document.userId ?? userId, shareRelations: document.shareRelations ?? [] },
      userId
    )
    return { id: document.id, access: access as HostMemoryAccess }
  })
  const env = deps.env ?? process.env
  let layaAnswers: Record<string, LayaAnswer> | null = null
  const { ranking: hostMemory } = await requestHostMemoryAdvice(searchParams.get('taskSummary'), overlayCandidates, {
    env,
    ask: async (payload) => {
      const ids = Array.isArray(payload.ids) ? payload.ids.filter((id): id is string => typeof id === 'string') : []
      const questions: Record<string, LayaQuestion> = {}
      for (const id of ids) {
        questions[id] = {
          type: 'score',
          instructions: 'Relevance of this document id to the confirmed task intent. Metadata only.',
          criteria: ['relevance'],
        }
      }
      layaAnswers = await askLaya({ state: payload, questions }, { env, fetchImpl: deps.fetchImpl })
    },
  })

  const orderedDocuments = [...documents]
  if (layaAnswers) {
    const scoreOf = (id: string): number | null => {
      const answer = layaAnswers?.[id]
      return answer?.type === 'score' && Number.isFinite(answer.score) ? answer.score : null
    }
    orderedDocuments.sort((left, right) => {
      const leftScore = scoreOf(left.id)
      const rightScore = scoreOf(right.id)
      if (leftScore === null && rightScore === null) return 0
      if (leftScore === null) return 1
      if (rightScore === null) return -1
      return rightScore - leftScore
    })
  }

  return {
    documents: orderedDocuments.map((document) => {
      const matchField = query
        ? searchHits
          ? searchHits.get(document.id) ?? 'content'
          : computeMatchField(document.title, document.contentSearch, query.toLowerCase())
        : undefined
      const access = overlayCandidates.find((candidate) => candidate.id === document.id)?.access
      const dtoAccess = access === DOCUMENT_ACCESS.WRITE ? 'write' : access === DOCUMENT_ACCESS.READ ? 'read' : 'owner'
      return toMetadataDto(document, dtoAccess, matchField)
    }),
    hostMemory,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          })
        : null,
  }
}

export async function getApiDocument(userId: string, id: string) {
  const document = await db.doc.findFirst({
    where: {
      id,
      isDeleted: false,
    },
    select: {
      ...documentMetadataSelect,
      userId: true,
      content: true,
      shareRelations: {
        where: { userId },
        select: { access: true, authorId: true },
      },
    },
  })

  if (!document) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  const relation = document.shareRelations.find((candidate) => candidate.authorId === document.userId)
  const access: DocumentAccess | null =
    document.userId === userId
      ? 'owner'
      : relation?.access === 'WRITE'
        ? 'write'
        : relation?.access === 'READ'
          ? 'read'
          : null
  if (!access) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  return {
    document: {
      ...toMetadataDto(document, access),
      content: parseStoredContent(document.content),
    },
    etag: apiDocumentEtag(document),
  }
}

export async function createApiDocument(userId: string, input: ReturnType<typeof parseCreateApiDocument>) {
  const docCount = await db.doc.count({
    where: {
      userId,
      isDeleted: false,
    },
  })
  if (docCount >= MAX_DOC_COUNT) {
    throw new ApiV1Error(429, 'document_limit_reached', `A user can have at most ${MAX_DOC_COUNT} active documents`)
  }

  const parentId = input.parentId || null
  if (parentId) {
    const parent = await db.doc.findFirst({
      where: {
        id: parentId,
        userId,
        isDeleted: false,
      },
      select: { id: true },
    })
    if (!parent) throw new ApiV1Error(404, 'parent_not_found', 'Parent document not found')
  }

  const encoded = encodeTiptapDocument(input.content || EMPTY_TIPTAP_DOCUMENT)
  const sortOrder = await getNextSortOrderForParent(userId, parentId)
  const contentSearch = extractPlainText(encoded.content)
  const document = await db.doc.create({
    data: {
      title: input.title,
      icon: input.icon,
      parentId,
      sortOrder,
      content: encoded.contentJson,
      contentBinary: encoded.contentBinary,
      contentSearch: contentSearch || null,
      userId,
    },
    select: {
      ...documentMetadataSelect,
      content: true,
    },
  })

  return {
    document: {
      ...toMetadataDto(document),
      content: encoded.content,
    },
    etag: apiDocumentEtag(document),
  }
}

export async function updateApiDocument(
  userId: string,
  id: string,
  input: ReturnType<typeof parseUpdateApiDocument>,
  ifMatch: string | null
) {
  if (!ifMatch) {
    throw new ApiV1Error(428, 'precondition_required', 'If-Match is required for document updates')
  }

  const current = await db.doc.findFirst({
    where: {
      id,
      userId,
      isDeleted: false,
    },
    select: documentMetadataSelect,
  })
  if (!current) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  const currentEtag = apiDocumentEtag(current)
  if (ifMatch !== '*' && ifMatch !== currentEtag) {
    throw new ApiV1Error(412, 'document_conflict', 'Document changed since it was read')
  }

  const result = await db.doc.updateMany({
    where: {
      id,
      userId,
      isDeleted: false,
      updatedAt: current.updatedAt,
    },
    data: {
      updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      ...(input.isStar === undefined ? {} : { isStar: input.isStar }),
    },
  })
  if (result.count !== 1) {
    throw new ApiV1Error(412, 'document_conflict', 'Document changed since it was read')
  }

  const updated = await db.doc.findFirst({
    where: {
      id,
      userId,
      isDeleted: false,
    },
    select: documentMetadataSelect,
  })
  if (!updated) throw new ApiV1Error(404, 'document_not_found', 'Document not found')

  return {
    document: toMetadataDto(updated),
    etag: apiDocumentEtag(updated),
  }
}
