import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId } from '@/lib/api-v1'
import { getApiDocument } from '@/lib/api-v1-documents'
import { subscribeDocumentChanges, type DocumentChangePayload } from '@/lib/document-change-hub'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function encodeSse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export async function GET(request: Request, { params }: { params: RouteParams<{ id: string }> }) {
  const requestId = apiRequestId(request)
  try {
    const principal = await authenticatePersonalAccessToken(request, 'documents:read')
    const { id } = await resolveRouteParams(params)
    const current = await getApiDocument(principal.userId, id)
    const snapshot: DocumentChangePayload = {
      documentId: id,
      etag: current.etag,
      updatedAt: current.document.updatedAt,
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encodeSse('document.snapshot', snapshot))
        const unsubscribe = subscribeDocumentChanges(id, (payload) => {
          try {
            controller.enqueue(encodeSse('document.updated', payload))
          } catch {
            unsubscribe()
          }
        })
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`))
          } catch {
            clearInterval(heartbeat)
            unsubscribe()
          }
        }, 15_000)
        const shutdown = () => {
          clearInterval(heartbeat)
          unsubscribe()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
        request.signal.addEventListener('abort', shutdown)
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store',
        Connection: 'keep-alive',
        'X-Request-Id': requestId,
      },
    })
  } catch (error) {
    return apiError(error, requestId)
  }
}
