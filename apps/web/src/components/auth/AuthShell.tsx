/**
 * Split-screen frame for authentication: the brand on the left (desktop only),
 * the form on the right. The form side is plain and quiet on purpose.
 */
import type { ReactNode } from 'react'
import { BadgeCheck, IndianRupee, Zap } from 'lucide-react'

import { Logo } from '@/components/ds'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { Plasma } from '@/components/visual/Plasma'

const POINTS = [
  { icon: Zap, text: 'Storefront, checkout, and delivery live in minutes' },
  { icon: IndianRupee, text: 'UPI, cards, and netbanking through Razorpay' },
  { icon: BadgeCheck, text: 'Every rupee in a balanced double-entry ledger' },
] as const

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  readonly title: string
  readonly subtitle?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-surface-base lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(12%_0.01_280)] lg:block">
        <Plasma className="absolute inset-0 size-full" intensity={0.95} />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <Logo href="/" className="[&_span]:text-white" />
          <div>
            <p className="max-w-md text-[44px] leading-[1.05] tracking-tight text-balance">
              Your whole creator business,{' '}
              <span className="font-display italic text-[oklch(85%_0.12_60)]">one link.</span>
            </p>
            <ul className="mt-10 space-y-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[15px] text-white/80">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 backdrop-blur">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[12px] text-white/50">© {new Date().getFullYear()} CreatorHub</p>
        </div>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 lg:justify-end">
          <Logo href="/" className="lg:hidden" />
          <ThemeToggle />
        </div>
        <main id="main" className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-body-lg text-content-secondary">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && (
              <div className="mt-8 text-center text-body text-content-secondary">{footer}</div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

/** Only same-site relative paths are followed after sign-in; anything else goes home. */
export function safeRedirect(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
