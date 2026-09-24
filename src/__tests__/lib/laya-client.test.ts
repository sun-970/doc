import { describe, expect, it, vi } from 'vitest'
import { askLayaDocumentRanking, isLoopbackEndpoint, LAYA_ENDPOINT, layaRequestConfig } from '@/lib/laya-client'

describe('local Laya client', () => {
  it('is off unless DOC_LAYA_ENABLED is truthy', () => {
    expect(layaRequestConfig({})).toBeNull()
    expect(layaRequestConfig({ DOC_LAYA_ENABLED: '0' })).toBeNull()
    expect(layaRequestConfig({ DOC_LAYA_ENABLED: '1' })?.url).toBe(LAYA_ENDPOINT)
  })

  it('rejects non-loopback URLs', () => {
    expect(isLoopbackEndpoint('https://api.typesafe.ai/v1/systemone')).toBe(false)
    expect(isLoopbackEndpoint('http://127.0.0.1:18081/v1/systemone')).toBe(true)
    const config = layaRequestConfig({
      DOC_LAYA_ENABLED: '1',
      DOC_LAYA_URL: 'https://example.com/v1/systemone',
    })
    expect(config?.url).toBe(LAYA_ENDPOINT)
  })

  it('posts metadata ids only and never sends Authorization', async () => {
    const fetchImpl = vi.fn(async (url, init) => {
      expect(url).toBe(LAYA_ENDPOINT)
      expect(init.redirect).toBe('error')
      const headers = new Headers(init.headers)
      expect(headers.get('authorization')).toBeNull()
      const body = JSON.parse(String(init.body))
      expect(body.state).toEqual({ ids: ['doc-a', 'doc-b'] })
      expect(body.state).not.toHaveProperty('content')
      return new Response(
        JSON.stringify({
          answers: {
            rank: { type: 'choice', choice: 'doc-b', probabilities: { 'doc-a': 0.2, 'doc-b': 0.8 }, confidence: 0.8 },
          },
        })
      )
    }) as unknown as typeof fetch
    const order = await askLayaDocumentRanking(
      { ids: ['doc-a', 'doc-b'] },
      { env: { DOC_LAYA_ENABLED: '1' }, fetchImpl }
    )
    expect(order).toEqual(['doc-b', 'doc-a'])
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns null when extra payload keys or a failed request appear', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(
      await askLayaDocumentRanking({ ids: ['doc-a'], content: 'secret' }, { env: { DOC_LAYA_ENABLED: '1' }, fetchImpl })
    ).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await askLayaDocumentRanking({ ids: ['doc-a'] }, { env: { DOC_LAYA_ENABLED: '1' }, fetchImpl })).toBeNull()
  })
})
