import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '@/db/db'
import { computeDocEtag } from '@/lib/document-etag'
import { publishDocumentChange } from '@/lib/document-change-hub'

export const runtime = 'nodejs'

function hasValidInternalKey(provided: string): boolean {
  const expected = process.env.COLLABORATE_INTERNAL_API_KEY || process.env.INTERNAL_API_KEY || ''
  if (!expected || !provided) return false
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  return timingSafeEqual(expectedDigest, providedDigest)
}

export async function POST(request: Request) {
  if (!hasValidInternalKey(request.headers.get('x-doc-internal-key') || '')) {
    return Response.json({ success: false, error: { code: 'unauthorized' } }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const documentId =
    body && typeof body === 'object' && typeof (body as { documentId?: unknown }).documentId === 'string'
      ? (body as { documentId: string }).documentId.trim()
      : ''
  if (!documentId || documentId.length > 128) {
    return Response.json({ success: false, error: { code: 'validation_error' } }, { status: 400 })
  }

  const doc = await db.doc.findFirst({
    where: { id: documentId, isDeleted: false },
    select: { id: true, updatedAt: true },
  })
  if (!doc) {
    return Response.json({ success: false, error: { code: 'document_not_found' } }, { status: 404 })
  }

  const payload = {
    documentId: doc.id,
    etag: computeDocEtag(doc.id, doc.updatedAt),
    updatedAt: doc.updatedAt.toISOString(),
  }
  publishDocumentChange(doc.id, payload)
  return Response.json({ success: true, data: payload })
}
