import { z } from 'zod'
import { getUserInfo } from '@/lib/session'
import { db } from '@/db/db'
import { genSuccessData, genErrorData, genUnAuthData } from '@/app/api/utils/gen-res-data'
import { sendEmail } from '@/lib/mailer'
import { DOCUMENT_ACCESS, resolveDocumentAccess } from '@/lib/document-access'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

const updateDocSchema = z
  .object({
    title: z.string().optional(),
    icon: z.string().nullable().optional(),
    isStar: z.boolean().optional(),
  })
  .strict()

// 获取单个 doc 内容
export async function GET(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  const { id } = await resolveRouteParams(params)

  try {
    const doc = await db.doc.findFirst({
      where: {
        id,
        isDeleted: false,
        OR: [
          { userId: user.id || '' },
          {
            shareRelations: {
              some: { userId: user.id || '' },
            },
          },
        ],
      },
      select: {
        userId: true,
        content: true,
        contentBinary: true,
        shareRelations: {
          where: { userId: user.id || '' },
          select: { access: true, authorId: true },
        },
      },
    })
    if (doc == null || resolveDocumentAccess(doc, user.id || '') === DOCUMENT_ACCESS.NONE) {
      return Response.json(genErrorData('Doc not found'))
    }
    return Response.json(
      genSuccessData({
        content: doc.content,
        contentBinary: doc.contentBinary,
      })
    )
  } catch (ex: any) {
    console.error('Get doc error', ex)
    sendEmail({ subject: 'Get doc error', text: ex.message || 'error' })
    return Response.json(genErrorData('Get doc error 获取文档错误'))
  }
}

// 更新单个 doc 内容
export async function PATCH(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  const { id } = await resolveRouteParams(params)
  const parsed = updateDocSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json(genErrorData('Update payload invalid'))
  try {
    await db.doc.update({
      where: { id, userId: user.id, isDeleted: false },
      data: parsed.data,
    })
    return Response.json(genSuccessData())
  } catch (ex: any) {
    console.error('Update doc error', ex)
    sendEmail({ subject: 'Update doc error', text: ex.message || 'error' })
    return Response.json(genErrorData('Update doc error 更新失败'))
  }
}
