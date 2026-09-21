import { createHash } from 'node:crypto'

export function computeDocEtag(docId: string, updatedAt: Date): string {
  const revision = createHash('sha256').update(`${docId}:${updatedAt.toISOString()}`).digest('base64url').slice(0, 24)
  return `"doc:${docId}:${revision}"`
}
