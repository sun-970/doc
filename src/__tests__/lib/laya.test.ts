import { describe, expect, it, vi } from 'vitest'
import { askLaya } from '@/lib/laya/client'
import { isLoopbackEndpoint, layaEnabled, layaRequestConfig } from '@/lib/laya/config'

describe('laya config', () => {
  it('is off by default', () => {
    expect(layaEnabled({})).toBe(false)
    expect(layaRequestConfig({})).toBeNull()
  })

  it('accepts DOC_LAYA_ENABLED and ignores DOC_JEV_ENABLED', () => {
    expect(layaEnabled({ DOC_LAYA_ENABLED: '1' })).toBe(true)
    expect(layaEnabled({ DOC_JEV_ENABLED: 'true' })).toBe(false)
    expect(layaEnabled({ DOC_LAYA_ENABLED: '0', DOC_JEV_ENABLED: '1' })).toBe(false)
  })

  it('rejects non-loopback URLs and never keeps userinfo', () => {
    expect(isLoopbackEndpoint('http://127.0.0.1:18081/v1/systemone')).toBe(true)
    expect(isLoopbackEndpoint('https://127.0.0.1:18081/v1/systemone')).toBe(false)
    expect(isLoopbackEndpoint('http://example.com/v1/systemone')).toBe(false)
    expect(isLoopbackEndpoint('http://user:pass@127.0.0.1:18081/v1/systemone')).toBe(false)
    const config = layaRequestConfig({ DOC_LAYA_ENABLED: '1', DOC_LAYA_URL: 'https://evil.example/v1/systemone' })
    expect(config?.url).toBe('http://127.0.0.1:18081/v1/systemone')
  })

  it('clamps timeout between 100ms and 5000ms', () => {
    expect(layaRequestConfig({ DOC_LAYA_ENABLED: '1', DOC_LAYA_TIMEOUT_MS: '1' })?.timeoutMs).toBe(100)
    expect(layaRequestConfig({ DOC_LAYA_ENABLED: '1', DOC_LAYA_TIMEOUT_MS: '99999' })?.timeoutMs).toBe(5000)
  })
})

describe('askLaya', () => {
  it('does not fetch when disabled', async () => {
    const fetchImpl = vi.fn()
    await expect(askLaya({ state: { ids: ['doc-a'] }, questions: {} }, { env: {}, fetchImpl })).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('POSTs loopback /v1/systemone without Authorization', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ answers: { rank: { type: 'noul', probability: 0.2 } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const answers = await askLaya(
      {
        state: { ids: ['doc-a'] },
        questions: { rank: { type: 'noul', instructions: 'rank' } },
      },
      { env: { DOC_LAYA_ENABLED: '1' }, fetchImpl }
    )

    expect(answers).toEqual({ rank: { type: 'noul', probability: 0.2 } })
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:18081/v1/systemone')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')).toBe(false)
  })
})
