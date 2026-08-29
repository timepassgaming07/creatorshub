/**
 * Storefront header component (Item 4.4).
 */
import Link from 'next/link'
import type { StorefrontRecord } from '@creatorhub/contracts'

type StorefrontHeaderProps = {
  readonly storefront: StorefrontRecord
  readonly basePath: string
}

export function StorefrontHeader({ storefront, basePath }: StorefrontHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href={basePath}
          className="group flex items-center gap-3 transition-opacity hover:opacity-90"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg font-bold text-white shadow-sm"
            style={{ backgroundColor: storefront.themeConfig.accentColor }}
          >
            {storefront.title.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <span className="font-semibold tracking-tight text-[var(--text-primary)]">
              {storefront.title}
            </span>
            {storefront.tagline && (
              <p className="text-xs text-[var(--text-secondary)]">{storefront.tagline}</p>
            )}
          </div>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href={`${basePath}#products`}
            className="text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            Products
          </Link>
        </nav>
      </div>
    </header>
  )
}
