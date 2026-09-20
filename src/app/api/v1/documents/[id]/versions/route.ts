import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId, apiSuccess } from '@/lib/api-v1'
import { listDocumentVersions } from '@/lib/api-v1-mutations'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:read')
    const { id } = await resolveRouteParams(params)
    const searchParams = new URL(request.url).searchParams
    const result = await listDocumentVersions(principal.userId, id, searchParams)

    return apiSuccess(result.versions, { requestId })
  } catch (error) {
    return apiError(error, requestId)
  }
}
