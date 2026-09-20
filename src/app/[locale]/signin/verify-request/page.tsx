'use client'

import { useEffect, useState } from 'react'
import HomeNav from '@/components/home-nav'
import LocalSignInHint from '@/components/local-sign-in-hint'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslations } from 'next-intl'

export default function VerifyRequestPage() {
  const t = useTranslations('verifyRequest')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('email')
    if (value) setEmail(value)
  }, [])

  return (
    <main className="doc-grid flex min-h-screen items-center justify-center bg-canvas px-4 py-16">
      <HomeNav />
      <Card className="w-full max-w-md bg-surface-raised shadow-md">
        <CardHeader className="items-center py-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">doc workspace</p>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('subTitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocalSignInHint email={email} />
        </CardContent>
      </Card>
    </main>
  )
}
