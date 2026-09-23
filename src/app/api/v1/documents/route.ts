import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId, apiSuccess, readApiJson } from '@/lib/api-v1'
import { createApiDocument, listApiDocuments, parseCreateApiDocument } from '@/lib/api-v1-documents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:read')
    const result = await listApiDocuments(principal.userId, new URL(request.url).searchParams)
    return apiSuccess(result.documents, {
      requestId,
      meta: {
        nextCursor: result.nextCursor,
        hostMemory: result.hostMemory,
      },
    })
  } catch (error) {
    return apiError(error, requestId)
  }
}

export async function POST(request: Request) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:write')
    const input = parseCreateApiDocument(await readApiJson(request))
    const result = await createApiDocument(principal.userId, input)
    return apiSuccess(result.document, {
      status: 201,
      requestId,
      headers: {
        ETag: result.etag,
        Location: `/api/v1/documents/${result.document.id}`,
      },
    })
  } catch (error) {
    return apiError(error, requestId)
  }
}
