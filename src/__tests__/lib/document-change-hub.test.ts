// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { publishDocumentChange, subscribeDocumentChanges } from '@/lib/document-change-hub'

describe('document-change-hub', () => {
  it('delivers published updates only to subscribers of that document', () => {
    const onDoc1 = vi.fn()
    const onDoc2 = vi.fn()
    const off1 = subscribeDocumentChanges('doc-1', onDoc1)
    const off2 = subscribeDocumentChanges('doc-2', onDoc2)

    publishDocumentChange('doc-1', {
      documentId: 'doc-1',
      etag: '"doc:doc-1:abc"',
      updatedAt: '2026-01-01T00:00:02.000Z',
    })

    expect(onDoc1).toHaveBeenCalledWith({
      documentId: 'doc-1',
      etag: '"doc:doc-1:abc"',
      updatedAt: '2026-01-01T00:00:02.000Z',
    })
    expect(onDoc2).not.toHaveBeenCalled()
    off1()
    off2()
  })

  it('stops delivering after unsubscribe', () => {
    const onDoc = vi.fn()
    const off = subscribeDocumentChanges('doc-9', onDoc)
    off()
    publishDocumentChange('doc-9', {
      documentId: 'doc-9',
      etag: '"doc:doc-9:zzz"',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(onDoc).not.toHaveBeenCalled()
  })
})
