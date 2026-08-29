/**
 * Storefront hero component (Item 4.4).
 */
import Link from 'next/link'
import type { StorefrontRecord } from '@creatorhub/contracts'

type StorefrontHeroProps = {
  readonly storefront: StorefrontRecord
  readonly basePath: string
}

export function StorefrontHero({ storefront, basePath }: StorefrontHeroProps) {
  const headline = storefront.themeConfig.heroHeadline ?? storefront.title
  const subheadline =
    storefront.themeConfig.heroSubheadline ??
    storefront.tagline ??
    storefront.description ??
    'Explore exclusive digital products, assets, and tools created for you.'

  return (
    <section className="relative overflow-hidden border-b border-[var(--border-default)] bg-gradient-to-b from-[var(--bg-subtle)] to-[var(--bg-surface)] py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
          {headline}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
          {subheadline}
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href={`${basePath}#products`}
            className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-95 active:scale-98"
            style={{ backgroundColor: storefront.themeConfig.accentColor }}
          >
            Browse Products
          </Link>
        </div>
      </div>
    </section>
  )
}
