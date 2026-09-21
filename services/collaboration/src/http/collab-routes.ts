import Router from '@koa/router'
import type Koa from 'koa'
import { createHash, timingSafeEqual } from 'node:crypto'

import { applyContentBinary } from '../hocuspocus/restore.js'
import { errorMessage } from '../lib/error.js'
import { notifyWebDocumentChangeBestEffort } from '../lib/notify-web-document-change.js'

export const MAX_ACCESS_REQUEST_BYTES = 4 * 1024

interface RestoreBody {
  contentBinaryBase64: string
}

export interface CollabRouterDeps {
  revokeActiveAccess: (docId: string, userId: string) => number | Promise<number>
}

interface AccessRequestContext {
  get: (field: string) => string
  request: {
    body?: unknown
    rawBody?: unknown
  }
}

function parseRestoreBody(body: unknown): RestoreBody | null {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null
  const contentBinaryBase64 = (body as Record<string, unknown>).contentBinaryBase64
  return typeof contentBinaryBase64 === 'string' && contentBinaryBase64.length > 0 ? { contentBinaryBase64 } : null
}

export function isBoundedAccessRequest(ctx: AccessRequestContext): boolean {
  const declaredLength = Number(ctx.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ACCESS_REQUEST_BYTES) return false

  const rawBody: unknown = ctx.request.rawBody
  if (typeof rawBody === 'string') {
    return Buffer.byteLength(rawBody, 'utf8') <= MAX_ACCESS_REQUEST_BYTES
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.byteLength <= MAX_ACCESS_REQUEST_BYTES
  }
  return true
}

export function parseAccessRevocation(ctx: AccessRequestContext): { userId: string } | null {
  if (!isBoundedAccessRequest(ctx)) return null

  const body: unknown = ctx.request.body
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record.userId !== 'string') return null

  const userId = record.userId.trim()
  if (!userId || userId.length > 128) return null
  return { userId }
}

export function hasValidInternalKey(ctx: Pick<Koa.Context, 'get'>): boolean {
  const internalKey = process.env.INTERNAL_API_KEY || ''
  const providedKey = ctx.get('x-doc-internal-key')
  if (!internalKey || !providedKey) return false
  const expectedDigest = createHash('sha256').update(internalKey, 'utf8').digest()
  const providedDigest = createHash('sha256').update(providedKey, 'utf8').digest()
  return timingSafeEqual(expectedDigest, providedDigest)
}

// 创建协同文档恢复和活动权限失效路由。
export function createCollabRouter(deps: CollabRouterDeps): Router {
  const router = new Router()

  router.post('/collab/documents/:docId/access/revoke', async (ctx) => {
    if (!hasValidInternalKey(ctx)) {
      ctx.status = 401
      ctx.body = { success: false, msg: 'unauthorized' }
      return
    }

    const docId = ctx.params.docId
    const parsed = parseAccessRevocation(ctx)
    if (!docId || docId.length > 128 || parsed == null) {
      ctx.status = 400
      ctx.body = { success: false, msg: 'invalid access revocation request' }
      return
    }

    const closedConnections = await deps.revokeActiveAccess(docId, parsed.userId)
    ctx.body = { success: true, data: { closedConnections } }
  })

  router.post('/collab/documents/:docId/restore', async (ctx) => {
    const { docId } = ctx.params

    try {
      if (!hasValidInternalKey(ctx)) {
        ctx.status = 401
        ctx.body = { success: false, msg: 'unauthorized' }
        return
      }

      const body = parseRestoreBody(ctx.request.body)
      if (!docId) throw new Error('docId is required')
      if (body == null) throw new Error('contentBinaryBase64 is required')

      const applied = await applyContentBinary(docId, body.contentBinaryBase64)
      notifyWebDocumentChangeBestEffort(docId)
      ctx.body = { success: true, data: { docId, appliedToRoom: applied.appliedToRoom } }
    } catch (error) {
      ctx.status = 400
      ctx.body = { success: false, msg: errorMessage(error, 'restore failed') }
    }
  })

  return router
}
