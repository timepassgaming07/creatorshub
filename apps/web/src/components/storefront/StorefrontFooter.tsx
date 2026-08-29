/**
 * Storefront footer component (Item 4.4).
 */
import Link from 'next/link'
import type { StorefrontRecord } from '@creatorhub/contracts'

type StorefrontFooterProps = {
  readonly storefront: StorefrontRecord
}

export function StorefrontFooter({ storefront }: StorefrontFooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-[var(--border-default)] bg-[var(--bg-surface)] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-[var(--text-secondary)] sm:flex-row sm:px-6">
        <p>
          &copy; {currentYear} {storefront.title}. All rights reserved.
        </p>
        <p className="flex items-center gap-1.5">
          <span>Powered by</span>
          <Link
            href="/"
            className="font-semibold text-[var(--text-primary)] transition-colors hover:underline"
          >
            CreatorHub
          </Link>
        </p>
      </div>
    </footer>
  )
}
