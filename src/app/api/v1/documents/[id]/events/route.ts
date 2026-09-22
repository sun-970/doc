import { authenticatePersonalAccessToken } from '@/lib/personal-access-token'
import { apiError, apiRequestId } from '@/lib/api-v1'
import { getApiDocument } from '@/lib/api-v1-documents'
import { subscribeDocumentChanges, type DocumentChangePayload } from '@/lib/document-change-hub'
import { resolveRouteParams, type RouteParams } from '@/lib/route-params'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const POLL_MS = 2_000
const HEARTBEAT_MS = 15_000

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

    let lastEtag = snapshot.etag
    let shutdown = () => {}
    const stream = new ReadableStream({
      start(controller) {
        let closed = false
        const unsubscribe = subscribeDocumentChanges(id, (payload) => {
          try {
            lastEtag = payload.etag
            controller.enqueue(encodeSse('document.updated', payload))
          } catch {
            shutdown()
          }
        })
        const poll = setInterval(() => {
          void (async () => {
            try {
              const latest = await getApiDocument(principal.userId, id)
              if (closed || latest.etag === lastEtag) return
              lastEtag = latest.etag
              controller.enqueue(
                encodeSse('document.updated', {
                  documentId: id,
                  etag: latest.etag,
                  updatedAt: latest.document.updatedAt,
                })
              )
            } catch {
              shutdown()
            }
          })()
        }, POLL_MS)
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: heartbeat\n\n`))
          } catch {
            shutdown()
          }
        }, HEARTBEAT_MS)
        shutdown = () => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          clearInterval(poll)
          unsubscribe()
          request.signal.removeEventListener('abort', shutdown)
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
        request.signal.addEventListener('abort', shutdown)
        controller.enqueue(encodeSse('document.snapshot', snapshot))
      },
      cancel() {
        shutdown()
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
