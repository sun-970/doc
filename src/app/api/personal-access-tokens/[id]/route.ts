import { z } from 'zod'
import { revokePersonalAccessToken } from '@/lib/personal-access-token'
import { errorResponse, PersonalAccessTokenApiError, requireSameOrigin, requireSessionUserId } from '../_shared'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'

const tokenIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)

export async function DELETE(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  try {
    const userId = await requireSessionUserId()
    requireSameOrigin(request)

    const { id } = await resolveRouteParams(params)
    const parsedId = tokenIdSchema.safeParse(id)
    if (!parsedId.success) {
      throw new PersonalAccessTokenApiError(404, 'not_found', 'Personal access token not found')
    }

    const revoked = await revokePersonalAccessToken(userId, parsedId.data)
    if (!revoked) {
      throw new PersonalAccessTokenApiError(404, 'not_found', 'Personal access token not found')
    }

    return new Response(null, {
      status: 204,
      headers: {
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
