import { afterEach, describe, expect, it, vi } from 'vitest'

import { notifyWebDocumentChange } from '../src/lib/notify-web-document-change.js'

describe('notifyWebDocumentChange', () => {
  const previous = {
    url: process.env.DOC_WEB_INTERNAL_URL,
    collab: process.env.COLLABORATE_INTERNAL_API_KEY,
    internal: process.env.INTERNAL_API_KEY,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries({
      DOC_WEB_INTERNAL_URL: previous.url,
      COLLABORATE_INTERNAL_API_KEY: previous.collab,
      INTERNAL_API_KEY: previous.internal,
    })) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
    vi.unstubAllGlobals()
  })

  it('fails closed when DOC_WEB_INTERNAL_URL is unset', async () => {
    delete process.env.DOC_WEB_INTERNAL_URL
    process.env.COLLABORATE_INTERNAL_API_KEY = 'k'
    await expect(notifyWebDocumentChange('doc-1')).rejects.toThrow('DOC_WEB_INTERNAL_URL')
  })

  it('sends COLLABORATE_INTERNAL_API_KEY when both secrets exist', async () => {
    process.env.DOC_WEB_INTERNAL_URL = 'http://web.test'
    process.env.COLLABORATE_INTERNAL_API_KEY = 'web-key'
    process.env.INTERNAL_API_KEY = 'collab-only-key'
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)
    await notifyWebDocumentChange('doc-1')
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://web.test/api/internal/document-changes',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-doc-internal-key': 'web-key' }),
      })
    )
  })
})
