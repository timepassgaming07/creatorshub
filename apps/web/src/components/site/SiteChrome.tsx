/**
 * Header and footer for the public pages: landing, pricing, legal.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Logo } from '@/components/ds'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export function SiteHeader({ overlay = false }: { readonly overlay?: boolean }) {
  return (
    <header className={overlay ? 'absolute inset-x-0 top-0 z-30' : 'border-b border-border-subtle'}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Logo href="/" />
        <nav
          aria-label="Main"
          className="hidden items-center gap-1 text-body text-content-secondary md:flex"
        >
          <Link href="/#features" className="rounded-lg px-3 py-2 hover:text-content-primary">
            Features
          </Link>
          <Link href="/#money" className="rounded-lg px-3 py-2 hover:text-content-primary">
            How you get paid
          </Link>
          <Link href="/pricing" className="rounded-lg px-3 py-2 hover:text-content-primary">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href="/sign-in"
            className="hidden rounded-lg px-3 py-2 text-body font-medium text-content-secondary hover:text-content-primary sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center rounded-lg bg-content-primary px-3.5 text-body font-medium text-surface-base transition-opacity hover:opacity-90"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter() {
  const columns: readonly { title: string; links: readonly [string, string][] }[] = [
    {
      title: 'Product',
      links: [
        ['Features', '/#features'],
        ['Pricing', '/pricing'],
        ['Start selling', '/sign-up'],
        ['Sign in', '/sign-in'],
      ],
    },
    {
      title: 'Company',
      links: [
        ['Contact', '/legal/contact'],
        ['Terms', '/legal/terms'],
        ['Privacy', '/legal/privacy'],
        ['Refunds', '/legal/refunds'],
      ],
    },
  ]
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo href="/" />
          <p className="mt-3 max-w-xs text-body text-content-secondary">
            The store behind your link in bio. Sell digital products, get paid in India, keep the
            relationship.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="text-caption font-semibold tracking-wide text-content-tertiary uppercase">
              {col.title}
            </p>
            <ul className="mt-3 space-y-2">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-body text-content-secondary hover:text-content-primary"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 text-caption text-content-tertiary">
        © {new Date().getFullYear()} CreatorHub. Made in India.
      </div>
    </footer>
  )
}

export function SitePage({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
