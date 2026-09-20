import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId, apiSuccess, readApiJson } from '@/lib/api-v1'
import { getApiDocument, parseUpdateApiDocument, updateApiDocument } from '@/lib/api-v1-documents'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:read')
    const { id } = await resolveRouteParams(params)
    const result = await getApiDocument(principal.userId, id)
    return apiSuccess(result.document, {
      requestId,
      headers: {
        ETag: result.etag,
      },
    })
  } catch (error) {
    return apiError(error, requestId)
  }
}

export async function PATCH(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:write')
    const { id } = await resolveRouteParams(params)
    const input = parseUpdateApiDocument(await readApiJson(request))
    const result = await updateApiDocument(principal.userId, id, input, request.headers.get('if-match'))
    return apiSuccess(result.document, {
      requestId,
      headers: {
        ETag: result.etag,
      },
    })
  } catch (error) {
    return apiError(error, requestId)
  }
}
