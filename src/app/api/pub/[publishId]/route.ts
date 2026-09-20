import { z } from 'zod'
import { db } from '@/db/db'
import { getUserInfo } from '@/lib/session'
import { genSuccessData, genUnAuthData, genErrorData } from '@/app/api/utils/gen-res-data'
import { PUB_DOC_STATUS } from '@/lib/pub-doc-status'
import { DOCUMENT_ACCESS, getDocumentAccess } from '@/lib/document-access'
import { MAX_PUBLISHED_HTML_BYTES, sanitizePublishedHtml } from '@/lib/sanitize-published-html'
import { readJsonBody } from '@/lib/read-json-body'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

const updatePublicationSchema = z
  .object({
    docId: z.string().min(1).max(128),
    title: z.string().max(500),
    htmlContent: z.string(),
  })
  .strict()

const MAX_PUBLICATION_REQUEST_BYTES = MAX_PUBLISHED_HTML_BYTES * 2 + 64 * 1024

export async function GET(request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  const { publishId } = await resolveRouteParams(params) // `publishId` is publish url suffix
  const p = await db.pubDoc.findUnique({
    where: {
      publishId,
    },
    select: {
      publishId: true,
      docId: true,
      userId: true,
      status: true,
    },
  })

  if (p == null) {
    return Response.json(genSuccessData(null))
  }

  const isOwner = p.userId === user.id

  return Response.json(
    genSuccessData({
      publishId: p.publishId,
      exists: true,
      docId: isOwner ? p.docId : null,
      status: isOwner ? p.status : null,
      ownedByCurrentUser: isOwner,
    })
  )
}

// 更新发布内容
export async function PATCH(request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  const { publishId } = await resolveRouteParams(params) // `publishId` is publish url suffix
  const parsed = updatePublicationSchema.safeParse(
    await readJsonBody(request, MAX_PUBLICATION_REQUEST_BYTES).catch(() => null)
  )
  if (!parsed.success) {
    return Response.json(genErrorData('Publish payload invalid'))
  }
  const { docId, title, htmlContent } = parsed.data
  try {
    const current = await db.pubDoc.findUnique({
      where: {
        publishId,
      },
      select: {
        publishId: true,
        userId: true,
        status: true,
      },
    })

    if (current == null) {
      return Response.json(genErrorData('发布记录不存在'))
    }

    if (current.userId !== user.id) {
      return Response.json(genErrorData('无权操作该发布内容'))
    }

    if (current.status === PUB_DOC_STATUS.FROZEN) {
      return Response.json(genErrorData('该发布内容已被冻结，请联系管理员处理'))
    }

    const documentAccess = await getDocumentAccess(docId, user.id || '')
    if (documentAccess !== DOCUMENT_ACCESS.OWNER) {
      return Response.json(genErrorData('Doc not found'))
    }
    const safeHtmlContent = sanitizePublishedHtml(htmlContent)

    const p = await db.pubDoc.update({
      where: {
        publishId,
      },
      data: {
        title,
        htmlContent: safeHtmlContent,
        docId,
        status: PUB_DOC_STATUS.PUBLISHED,
        statusReason: null,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: user.id || '',
      },
    })
    return Response.json(genSuccessData(p))
  } catch (error) {
    console.error('Update publication error', error)
    return Response.json(genErrorData('Unable to update publication'))
  }
}

// 删除发布内容
export async function DELETE(request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  const { publishId } = await resolveRouteParams(params)
  try {
    const current = await db.pubDoc.findUnique({
      where: {
        publishId,
      },
      select: {
        publishId: true,
        userId: true,
      },
    })

    if (current == null) {
      return Response.json(genErrorData('发布记录不存在'))
    }

    if (current.userId !== user.id) {
      return Response.json(genErrorData('无权操作该发布内容'))
    }

    const p = await db.pubDoc.update({
      where: {
        publishId,
      },
      data: {
        status: PUB_DOC_STATUS.UNPUBLISHED,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: user.id || '',
      },
    })
    return Response.json(genSuccessData(p))
  } catch (error) {
    console.error('Unpublish document error', error)
    return Response.json(genErrorData('Unable to unpublish document'))
  }
}
