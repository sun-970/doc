import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock('@/db/db', () => ({
  db: {
    doc: {
      findFirst: mocks.findFirst,
    },
  },
}))

import { POST } from '@/app/api/internal/document-changes/route'
import { computeDocEtag } from '@/lib/document-etag'
import { subscribeDocumentChanges } from '@/lib/document-change-hub'

describe('POST /api/internal/document-changes', () => {
  const previousKey = process.env.COLLABORATE_INTERNAL_API_KEY
  const previousInternal = process.env.INTERNAL_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.COLLABORATE_INTERNAL_API_KEY = 'internal-test-key'
    delete process.env.INTERNAL_API_KEY
  })

  afterEach(() => {
    if (previousKey == null) delete process.env.COLLABORATE_INTERNAL_API_KEY
    else process.env.COLLABORATE_INTERNAL_API_KEY = previousKey
    if (previousInternal == null) delete process.env.INTERNAL_API_KEY
    else process.env.INTERNAL_API_KEY = previousInternal
  })

  it('accepts INTERNAL_API_KEY when COLLABORATE_INTERNAL_API_KEY is unset', async () => {
    delete process.env.COLLABORATE_INTERNAL_API_KEY
    process.env.INTERNAL_API_KEY = 'internal-test-key'
    mocks.findFirst.mockResolvedValue({ id: 'doc-1', updatedAt: new Date('2026-01-01T00:00:09Z') })
    const res = await POST(
      new Request('https://doc.example/api/internal/document-changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-doc-internal-key': 'internal-test-key' },
        body: JSON.stringify({ documentId: 'doc-1' }),
      })
    )
    expect(res.status).toBe(200)
  })

  it('rejects missing internal key', async () => {
    const res = await POST(
      new Request('https://doc.example/api/internal/document-changes', {
        method: 'POST',
        body: '{}',
      })
    )
    expect(res.status).toBe(401)
  })

  it('publishes hub payload matching updateDocBinaryAndJson fields (etag from updatedAt)', async () => {
    const updatedAt = new Date('2026-01-01T00:00:09Z')
    mocks.findFirst.mockResolvedValue({ id: 'doc-1', updatedAt })
    const onChange = vi.fn()
    const off = subscribeDocumentChanges('doc-1', onChange)

    const res = await POST(
      new Request('https://doc.example/api/internal/document-changes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-doc-internal-key': 'internal-test-key' },
        body: JSON.stringify({ documentId: 'doc-1' }),
      })
    )

    expect(res.status).toBe(200)
    expect(onChange).toHaveBeenCalledWith({
      documentId: 'doc-1',
      etag: computeDocEtag('doc-1', updatedAt),
      updatedAt: updatedAt.toISOString(),
    })
    off()
  })
})
