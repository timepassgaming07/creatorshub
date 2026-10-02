/**
 * The frame around every storefront page: the creator's palette, a compact
 * header, a preview banner for owners viewing a draft, and a quiet footer.
 */
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Eye } from 'lucide-react'

import { storeModeClass, storeStyle } from '@/lib/store-theme'
import type { PublicStore } from '@/lib/storefront-public'

export function StoreAvatar({
  store,
  className = 'size-9 text-sm',
}: {
  readonly store: PublicStore
  readonly className?: string
}) {
  if (store.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by our own media route with caching
      <img src={store.logoUrl} alt="" className={`${className} rounded-full object-cover`} />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} inline-flex items-center justify-center rounded-full bg-[var(--store-accent)] font-semibold text-[var(--store-accent-fg)]`}
    >
      {store.title.trim().charAt(0).toUpperCase() || 'S'}
    </span>
  )
}

export function StoreShell({
  store,
  basePath,
  children,
  compactHeader = false,
  appUrl = '/',
}: {
  readonly store: PublicStore
  readonly basePath: string
  readonly children: ReactNode
  readonly compactHeader?: boolean
  /** The platform origin, for the footer link back to CreatorHub. */
  readonly appUrl?: string
}) {
  const home = basePath || '/'
  return (
    <div className={`${storeModeClass(store.theme)} flex min-h-dvh flex-col`} style={storeStyle(store.theme)}>
      {store.isPreview && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-[var(--store-accent)] px-4 py-2 text-[13px] font-medium text-[var(--store-accent-fg)]">
          <Eye className="size-4" aria-hidden="true" />
          Preview. Only you can see this until you publish your store.
        </div>
      )}
      <header
        className={`mx-auto flex w-full max-w-5xl items-center justify-between px-5 ${compactHeader ? 'py-4' : 'py-5'}`}
      >
        <Link href={home} className="flex min-w-0 items-center gap-3 rounded-md">
          <StoreAvatar store={store} />
          <span className="truncate text-[15px] font-semibold tracking-tight store-heading">{store.title}</span>
        </Link>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-5xl px-5 py-10">
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[13px] text-content-tertiary sm:flex-row">
          <p>
            © {new Date().getFullYear()} {store.title}
          </p>
          <a
            href={appUrl}
            className="inline-flex items-center gap-1.5 hover:text-content-primary"
          >
            Sell with <span className="font-semibold text-content-secondary">CreatorHub</span>
          </a>
        </div>
      </footer>
    </div>
  )
}
