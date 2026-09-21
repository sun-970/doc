import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticatePersonalAccessToken: vi.fn(),
  getApiDocument: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/personal-access-token', () => ({
  authenticatePersonalAccessToken: mocks.authenticatePersonalAccessToken,
}))
vi.mock('@/lib/api-v1-documents', () => ({
  getApiDocument: mocks.getApiDocument,
}))

import { GET as watchDocument } from '@/app/api/v1/documents/[id]/events/route'
import { publishDocumentChange } from '@/lib/document-change-hub'

const principal = {
  userId: 'user-1',
  tokenId: 'token-1',
  scopes: ['documents:read'],
}

function apiRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://doc.example${path}`, {
    ...init,
    headers: {
      authorization: `Bearer doc_pat_${'a'.repeat(43)}`,
      'x-request-id': 'route-test',
      ...init.headers,
    },
  })
}

describe('GET /api/v1/documents/{id}/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticatePersonalAccessToken.mockResolvedValue(principal)
    mocks.getApiDocument.mockResolvedValue({
      document: {
        id: 'doc-1',
        title: 'Runbook',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      etag: '"doc:doc-1:start"',
    })
  })

  it('requires documents:read and streams an initial snapshot as SSE', async () => {
    const response = await watchDocument(apiRequest('/api/v1/documents/doc-1/events'), {
      params: { id: 'doc-1' },
    })

    expect(mocks.authenticatePersonalAccessToken).toHaveBeenCalledWith(expect.any(Request), 'documents:read')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const { value } = await reader.read()
    const chunk = new TextDecoder().decode(value)
    expect(chunk).toContain('event: document.snapshot')
    expect(chunk).toContain('"etag":"\\"doc:doc-1:start\\""')
    await reader.cancel()
  })

  it('forwards a published change as document.updated', async () => {
    const response = await watchDocument(apiRequest('/api/v1/documents/doc-1/events'), {
      params: { id: 'doc-1' },
    })
    const reader = response.body!.getReader()
    await reader.read()

    publishDocumentChange('doc-1', {
      documentId: 'doc-1',
      etag: '"doc:doc-1:next"',
      updatedAt: '2026-01-01T00:00:05.000Z',
    })

    const { value } = await reader.read()
    const chunk = new TextDecoder().decode(value)
    expect(chunk).toContain('event: document.updated')
    expect(chunk).toContain('\\"doc:doc-1:next\\"')
    await reader.cancel()
  })
})
