'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme, type ThemeProviderProps } from 'next-themes'
import { DSProvider } from '@fullstack-ai-infra/ui'

function SharedTheme({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()

  React.useEffect(() => {
    if (resolvedTheme === 'light' || resolvedTheme === 'dark') {
      document.documentElement.dataset.theme = resolvedTheme
    }
  }, [resolvedTheme])

  return <DSProvider mode={resolvedTheme === 'dark' ? 'dark' : 'light'}>{children}</DSProvider>
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <SharedTheme>{children}</SharedTheme>
    </NextThemesProvider>
  )
}
