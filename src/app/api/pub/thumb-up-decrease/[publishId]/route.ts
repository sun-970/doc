import { db } from '@/db/db'
import { genSuccessData, genErrorData } from '@/app/api/utils/gen-res-data'
import { resolveViewerId } from '@/lib/viewer-id'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export async function PATCH(_request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const { publishId } = await resolveRouteParams(params)

  try {
    const { viewerId } = await resolveViewerId()
    const pubDoc = await db.pubDoc.findUnique({ where: { publishId }, select: { id: true, thumbUpCount: true } })
    if (!pubDoc) return Response.json(genErrorData('not found'))

    const result = await db.$transaction(async (tx) => {
      const deleted = await tx.pubDocLike.deleteMany({
        where: { viewerId, pubDocId: pubDoc.id },
      })
      if (deleted.count === 0) {
        const current = await tx.pubDoc.findUnique({ where: { publishId }, select: { thumbUpCount: true } })
        return { liked: false as const, count: current?.thumbUpCount ?? pubDoc.thumbUpCount }
      }
      await tx.pubDoc.updateMany({
        where: { publishId, thumbUpCount: { gt: 0 } },
        data: { thumbUpCount: { decrement: 1 } },
      })
      const current = await tx.pubDoc.findUnique({ where: { publishId }, select: { thumbUpCount: true } })
      return { liked: false as const, count: current?.thumbUpCount ?? 0 }
    })

    return Response.json(genSuccessData(result))
  } catch (ex: any) {
    return Response.json(genErrorData(ex.message))
  }
}
