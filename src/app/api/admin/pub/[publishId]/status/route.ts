import { db } from '@/db/db'
import { requireAdminUser } from '@/lib/admin'
import { canTransitionPubDocStatus, PUB_DOC_STATUS, PubDocStatusValue } from '@/lib/pub-doc-status'
import { genErrorData, genSuccessData, genUnAuthData } from '@/app/api/utils/gen-res-data'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export async function PATCH(request: Request, { params }: { params: RouteParams<{ publishId: string }> }) {
  const user = await requireAdminUser()
  if (user == null) {
    return Response.json(genUnAuthData())
  }

  try {
    const { publishId } = await resolveRouteParams(params)
    const body = await request.json()
    const { status, reason } = body

    if (!Object.values(PUB_DOC_STATUS).includes(status)) {
      return Response.json(genErrorData('发布状态不合法'))
    }

    const current = await db.pubDoc.findUnique({
      where: {
        publishId,
      },
      select: {
        publishId: true,
        status: true,
      },
    })

    if (current == null) {
      return Response.json(genErrorData('发布记录不存在'))
    }

    if (!canTransitionPubDocStatus(current.status, status)) {
      return Response.json(genErrorData('状态流转不合法'))
    }

    if (status === PUB_DOC_STATUS.FROZEN && (!reason || String(reason).trim() === '')) {
      return Response.json(genErrorData('冻结时请填写原因'))
    }

    const data = await db.pubDoc.update({
      where: {
        publishId,
      },
      data: {
        status: status as PubDocStatusValue,
        statusReason: status === PUB_DOC_STATUS.FROZEN ? String(reason).trim() : null,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: user.id,
      },
    })

    return Response.json(genSuccessData(data))
  } catch (error) {
    return Response.json(genErrorData(error instanceof Error ? error.message : '操作失败'))
  }
}
