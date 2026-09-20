'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type Guidance = { enabled: boolean; mailpitUrl: string | null }

export default function LocalSignInHint(props: { email?: string }) {
  const t = useTranslations('signin')
  const [guidance, setGuidance] = useState<Guidance>({ enabled: false, mailpitUrl: null })
  const [magicLink, setMagicLink] = useState<string | null>(null)

  useEffect(() => {
    if (typeof fetch !== 'function') return
    let active = true
    fetch('/api/local-auth/guidance')
      .then((response) => response.json())
      .then((payload: Guidance) => {
        if (active) setGuidance(payload)
      })
      .catch(() => {
        if (active) setGuidance({ enabled: false, mailpitUrl: null })
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!guidance.enabled || !props.email || typeof fetch !== 'function') {
      setMagicLink(null)
      return
    }
    let active = true
    const timer = window.setInterval(() => {
      fetch(`/api/local-auth/magic-link?email=${encodeURIComponent(props.email || '')}`)
        .then((response) => response.json())
        .then((payload: { url?: string | null }) => {
          if (active && payload.url) {
            setMagicLink(payload.url)
            window.clearInterval(timer)
          }
        })
        .catch(() => {})
    }, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [guidance.enabled, props.email])

  if (!guidance.enabled) return null

  return (
    <div className="rounded-md bg-accent p-3 text-left text-sm text-foreground" role="note">
      <p>{t('localHint', { url: guidance.mailpitUrl || 'http://localhost:8025' })}</p>
      {guidance.mailpitUrl ? (
        <p className="mt-2">
          <a className="underline" href={guidance.mailpitUrl} target="_blank" rel="noreferrer">
            {t('openMailpit')}
          </a>
        </p>
      ) : null}
      {magicLink ? (
        <p className="mt-2">
          <a className="underline" href={magicLink}>
            {t('openMagicLink')}
          </a>
        </p>
      ) : null}
    </div>
  )
}
