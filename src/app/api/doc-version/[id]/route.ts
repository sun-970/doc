import { genErrorData, genSuccessData, genUnAuthData } from '@/app/api/utils/gen-res-data'
import { getUserInfo } from '@/lib/session'
import { getDocVersionDetail } from '@/lib/doc-version/server'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

// 获取单个版本详情，供版本预览区加载差异数据。
export async function GET(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const user = await getUserInfo()
  if (user == null) return Response.json(genUnAuthData())

  try {
    const { id } = await resolveRouteParams(params)
    const version = await getDocVersionDetail(id, user.id || '')
    if (version == null) {
      return Response.json(genErrorData('Doc version not found'))
    }
    return Response.json(genSuccessData(version))
  } catch (ex) {
    console.error('Get doc version detail error', ex)
    return Response.json(genErrorData('Get doc version detail error'))
  }
}
