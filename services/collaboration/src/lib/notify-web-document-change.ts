import { errorMessage } from './error.js'

/**
 * Tell the Web/API process that the backing row changed so in-process SSE
 * subscribers (host previews) can follow Web/Hocuspocus writes.
 */
export async function notifyWebDocumentChange(documentId: string): Promise<void> {
  const baseUrl = (process.env.DOC_WEB_INTERNAL_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '')
  const internalKey = process.env.INTERNAL_API_KEY || ''
  if (!baseUrl || !internalKey) return

  const res = await fetch(`${baseUrl}/api/internal/document-changes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-doc-internal-key': internalKey,
    },
    body: JSON.stringify({ documentId }),
  })
  if (!res.ok) {
    throw new Error(`document-change notify failed: ${res.status} ${errorMessage(await res.text().catch(() => ''), '')}`)
  }
}

export function notifyWebDocumentChangeBestEffort(documentId: string): void {
  void notifyWebDocumentChange(documentId).catch((error) => {
    console.error('notifyWebDocumentChange', errorMessage(error))
  })
}
