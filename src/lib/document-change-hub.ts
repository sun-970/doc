export interface DocumentChangePayload {
  documentId: string
  etag: string
  updatedAt: string
}

type DocumentChangeListener = (payload: DocumentChangePayload) => void

const listeners = new Map<string, Set<DocumentChangeListener>>()

export function documentChangeSubscriberCount(documentId: string): number {
  return listeners.get(documentId)?.size ?? 0
}

export function subscribeDocumentChanges(documentId: string, listener: DocumentChangeListener): () => void {
  const bucket = listeners.get(documentId) ?? new Set<DocumentChangeListener>()
  bucket.add(listener)
  listeners.set(documentId, bucket)
  return () => {
    const current = listeners.get(documentId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(documentId)
  }
}

export function publishDocumentChange(documentId: string, payload: DocumentChangePayload): void {
  const bucket = listeners.get(documentId)
  if (!bucket) return
  for (const listener of bucket) {
    listener(payload)
  }
}
