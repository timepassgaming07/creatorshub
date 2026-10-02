'use client'

import { type ReactNode } from 'react'
import { ToastProvider } from '@creatorhub/ui'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  )
}
