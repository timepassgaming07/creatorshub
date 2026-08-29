'use client'

import { type ReactNode } from 'react'
import { ToastProvider } from '@creatorhub/ui'

export function Providers({ children }: { readonly children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
