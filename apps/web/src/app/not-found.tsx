import type { Metadata } from 'next'
import Link from 'next/link'

import { Logo } from '@/components/ds'

export const metadata: Metadata = { title: 'Not found', robots: { index: false } }

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center bg-surface-base px-5 text-center"
    >
      <Logo />
      <p className="mt-12 font-display text-[clamp(5rem,16vw,9rem)] leading-none text-content-tertiary/50">
        404
      </p>
      <h1 className="mt-4 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">
        This page is not here
      </h1>
      <p className="mt-2 max-w-md text-body text-content-secondary">
        The link may be old, or the store may have moved or gone offline. Check the address, or
        start from the home page.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl bg-content-primary px-5 text-body font-medium text-surface-base"
        >
          Go to the home page
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-body font-medium"
        >
          Open your dashboard
        </Link>
      </div>
    </main>
  )
}
