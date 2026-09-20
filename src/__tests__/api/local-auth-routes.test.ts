import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as guidance } from '@/app/api/local-auth/guidance/route'
import { GET as magicLink } from '@/app/api/local-auth/magic-link/route'

describe('local auth convenience routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not expose Mailpit guidance in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DOC_MAILPIT_URL', 'http://localhost:8025')
    const response = await guidance()
    await expect(response.json()).resolves.toEqual({ enabled: false, mailpitUrl: null })
  })

  it('does not invent a magic link when Mailpit is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DOC_MAILPIT_URL', 'http://127.0.0.1:1')
    const response = await magicLink(new Request('http://doc.test/api/local-auth/magic-link?email=a@b.c'))
    await expect(response.json()).resolves.toEqual({ enabled: true, url: null })
  })
})
