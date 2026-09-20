import { db } from '@/db/db'
import { genSuccessData, genErrorData } from '@/app/api/utils/gen-res-data'
import { resolveViewerId } from '@/lib/viewer-id'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002'
}

export async function GET(_request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const { publishId } = await resolveRouteParams(params)

  try {
    const { viewerId } = await resolveViewerId()
    const pubDoc = await db.pubDoc.findUnique({ where: { publishId }, select: { id: true, thumbUpCount: true } })
    if (!pubDoc) return Response.json(genErrorData('not found'))

    const like = await db.pubDocLike.findUnique({
      where: { viewerId_pubDocId: { viewerId, pubDocId: pubDoc.id } },
    })

    return Response.json(genSuccessData({ liked: !!like, count: pubDoc.thumbUpCount }))
  } catch (ex: any) {
    return Response.json(genErrorData(ex.message))
  }
}

export async function PATCH(_request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const { publishId } = await resolveRouteParams(params)

  try {
    const { viewerId } = await resolveViewerId()
    const pubDoc = await db.pubDoc.findUnique({ where: { publishId }, select: { id: true, thumbUpCount: true } })
    if (!pubDoc) return Response.json(genErrorData('not found'))

    try {
      const updated = await db.$transaction(async (tx) => {
        await tx.pubDocLike.create({
          data: { viewerId, pubDocId: pubDoc.id },
        })
        return tx.pubDoc.update({
          where: { publishId },
          data: { thumbUpCount: { increment: 1 } },
          select: { thumbUpCount: true },
        })
      })
      return Response.json(genSuccessData({ liked: true, count: updated.thumbUpCount }))
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const current = await db.pubDoc.findUnique({ where: { publishId }, select: { thumbUpCount: true } })
      return Response.json(genSuccessData({ liked: true, count: current?.thumbUpCount ?? pubDoc.thumbUpCount }))
    }
  } catch (ex: any) {
    return Response.json(genErrorData(ex.message))
  }
}
