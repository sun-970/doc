export type AuthEnvironment = Record<string, string | undefined>

export type LocalAuthGuidance = {
  enabled: boolean
  mailpitUrl: string | null
}

const DEFAULT_MAILPIT_URL = 'http://localhost:8025'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function isLoopbackUrl(value: string) {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

export function localAuthGuidance(env: AuthEnvironment = process.env): LocalAuthGuidance {
  const production = env.NODE_ENV === 'production'
  const disabled = env.DOC_LOCAL_AUTH_HINT === '0'
  const mailpit = env.DOC_MAILPIT_URL?.trim() || ''
  if (production || disabled) {
    return { enabled: false, mailpitUrl: null }
  }
  const mailpitUrl = mailpit || DEFAULT_MAILPIT_URL
  const enabled = isLoopbackUrl(mailpitUrl)
  return {
    enabled,
    mailpitUrl: enabled ? mailpitUrl : null,
  }
}

export function extractMagicLink(htmlOrText: string): string | null {
  const match = htmlOrText.match(/https?:\/\/[^\s"'<>]+\/api\/auth\/callback\/[^\s"'<>]+/i)
  return match ? match[0].replace(/&amp;/g, '&') : null
}
