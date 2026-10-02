'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw } from 'lucide-react'

import { Logo } from '@/components/ds'

export default function ErrorPage({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string }
  readonly reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center bg-surface-base px-5 text-center"
    >
      <Logo />
      <h1 className="mt-12 text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-tight">
        Something broke on our side
      </h1>
      <p className="mt-2 max-w-md text-body text-content-secondary">
        Nothing you did caused this, and no payment was taken twice. Try again; if it keeps
        happening, send us the reference below.
      </p>
      {error.digest && (
        <p className="mt-4 rounded-lg bg-surface-sunken px-3 py-1.5 font-mono text-caption text-content-tertiary">
          Reference {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-content-primary px-5 text-body font-medium text-surface-base"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-body font-medium"
        >
          Go to the home page
        </Link>
      </div>
    </main>
  )
}
