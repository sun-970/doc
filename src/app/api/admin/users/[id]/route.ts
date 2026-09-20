import { updateAdminUserRole } from '@/lib/admin-data'
import { requireAdminUser } from '@/lib/admin'
import { genErrorData, genSuccessData, genUnAuthData } from '@/app/api/utils/gen-res-data'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export async function PATCH(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const user = await requireAdminUser()
  if (user == null) {
    return Response.json(genUnAuthData())
  }

  try {
    const body = await request.json()
    const { isAdmin } = body

    if (typeof isAdmin !== 'boolean') {
      return Response.json(genErrorData('参数错误'))
    }

    const { id } = await resolveRouteParams(params)
    const data = await updateAdminUserRole(id, isAdmin)
    return Response.json(genSuccessData(data))
  } catch (error) {
    return Response.json(genErrorData(error instanceof Error ? error.message : '操作失败'))
  }
}
