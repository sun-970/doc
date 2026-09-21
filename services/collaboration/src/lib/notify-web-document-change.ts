import { errorMessage } from './error.js'

function notifyBaseUrl(): string {
  return (process.env.DOC_WEB_INTERNAL_URL || '').replace(/\/$/, '')
}

/** Same secret the Web process checks (COLLABORATE_INTERNAL_API_KEY || INTERNAL_API_KEY). */
function notifyInternalKey(): string {
  return process.env.COLLABORATE_INTERNAL_API_KEY || process.env.INTERNAL_API_KEY || ''
}

/**
 * Tell the Web/API process that the backing row changed so in-process SSE
 * subscribers (host previews) can follow Web/Hocuspocus writes.
 * Fail closed: missing URL/key or a non-2xx response throws.
 */
export async function notifyWebDocumentChange(documentId: string): Promise<void> {
  const baseUrl = notifyBaseUrl()
  const internalKey = notifyInternalKey()
  if (!baseUrl) {
    throw new Error('DOC_WEB_INTERNAL_URL is required to notify document-change SSE')
  }
  if (!internalKey) {
    throw new Error('COLLABORATE_INTERNAL_API_KEY or INTERNAL_API_KEY is required')
  }

  const res = await fetch(`${baseUrl}/api/internal/document-changes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-doc-internal-key': internalKey,
    },
    body: JSON.stringify({ documentId }),
  })
  if (!res.ok) {
    const detail = errorMessage(await res.text().catch(() => ''), '')
    throw new Error(`document-change notify failed: ${res.status} ${detail}`)
  }
}
