import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId, apiSuccess, readApiJson } from '@/lib/api-v1'
import { reviewProposalSchema } from '@/lib/api-v1-proposals'
import { getProposalService } from '@/lib/api-v1-proposals-instance'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:write')
    const { id } = await resolveRouteParams(params)
    const body = await readApiJson(request)
    const input = reviewProposalSchema.parse(body)
    const service = getProposalService()
    const result = await service.reviewProposal(principal.userId, id, input)
    return apiSuccess(result, { requestId })
  } catch (error) {
    return apiError(error, requestId)
  }
}
