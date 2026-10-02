/**
 * A creator's storefront home: link-in-bio profile on top, products below.
 *
 * The layout preset chooses how products sit: `minimal` stacks them as rows
 * like a link list, `grid` packs three across, `showcase` and `editorial` give
 * each a large card. Everything collapses to one column on a phone, which is
 * where most link-in-bio traffic arrives.
 */
import { ArrowUpRight, PackageOpen } from 'lucide-react'

import { SocialIcon, PLATFORM_LABELS } from '@/components/storefront/SocialIcons'
import { storeLayout } from '@/lib/store-theme'
import type { PublicProductCard, PublicStore } from '@/lib/storefront-public'

import { ProductCard } from './ProductCard'
import { StoreAvatar } from './StoreShell'

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:'
      ? parsed.toString()
      : null
  } catch {
    return null
  }
}

export function StoreHome({
  store,
  products,
  basePath,
}: {
  readonly store: PublicStore
  readonly products: readonly PublicProductCard[]
  readonly basePath: string
}) {
  const layout = storeLayout(store.theme)
  const headline = store.theme.heroHeadline ?? store.tagline
  const bio = store.theme.bio ?? store.theme.heroSubheadline ?? store.description
  const socials = store.theme.socialLinks.filter((link) => safeHref(link.url))
  const links = store.theme.customLinks.filter((link) => safeHref(link.url))

  return (
    <div className="mx-auto w-full max-w-5xl px-5">
      {/* Profile */}
      <section aria-labelledby="store-name" className="relative pt-4 pb-10">
        {store.bannerUrl ? (
          <div className="overflow-hidden rounded-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- media route */}
            <img src={store.bannerUrl} alt="" className="h-40 w-full object-cover @xl:h-56" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="h-32 rounded-3xl @xl:h-44"
            style={{
              background:
                'radial-gradient(80% 140% at 15% 0%, color-mix(in oklch, var(--store-accent) 55%, transparent), transparent 70%), radial-gradient(90% 120% at 100% 100%, color-mix(in oklch, var(--store-accent) 30%, var(--surface-sunken)), var(--surface-sunken))',
            }}
          />
        )}
        <div className="-mt-12 flex flex-col items-center text-center @xl:-mt-14">
          <div className="rounded-full bg-surface-base p-1.5">
            <StoreAvatar store={store} className="size-24 text-3xl @xl:size-28" />
          </div>
          <h1
            id="store-name"
            className="mt-4 text-3xl font-semibold tracking-tight store-heading @xl:text-4xl"
          >
            {store.title}
          </h1>
          {headline && (
            <p className="mt-2 max-w-xl text-[17px] text-content-secondary text-balance">
              {headline}
            </p>
          )}
          {bio && bio !== headline && (
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-content-secondary text-pretty whitespace-pre-line">
              {bio}
            </p>
          )}

          {socials.length > 0 && (
            <ul className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Social profiles">
              {socials.map((link) => (
                <li key={`${link.platform}-${link.url}`}>
                  <a
                    href={safeHref(link.url) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={PLATFORM_LABELS[link.platform]}
                    className="flex size-10 items-center justify-center rounded-full border border-border-subtle bg-surface-raised text-content-secondary shadow-elevation-1 transition-all hover:-translate-y-0.5 hover:text-content-primary"
                  >
                    <SocialIcon platform={link.platform} className="size-[18px]" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {links.length > 0 && (
            <ul className="mt-7 flex w-full max-w-md flex-col gap-3" aria-label="Links">
              {links.map((link) => (
                <li key={`${link.label}-${link.url}`}>
                  <a
                    href={safeHref(link.url) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-raised px-5 py-4 text-left font-medium shadow-elevation-1 transition-all hover:-translate-y-0.5 hover:border-[var(--store-accent)] hover:shadow-elevation-2"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {link.emoji && <span aria-hidden="true">{link.emoji}</span>}
                      <span className="truncate">{link.label}</span>
                    </span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Products */}
      <section aria-labelledby="products-heading" className="pb-8">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="products-heading" className="text-xl font-semibold tracking-tight store-heading">
            Shop
          </h2>
          {products.length > 0 && (
            <p className="text-[13px] text-content-tertiary">
              {products.length} {products.length === 1 ? 'product' : 'products'}
            </p>
          )}
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border-default px-6 py-16 text-center">
            <PackageOpen className="mb-3 size-6 text-content-tertiary" aria-hidden="true" />
            <p className="font-medium">Nothing for sale just yet</p>
            <p className="mt-1 text-[14px] text-content-secondary">Check back soon.</p>
          </div>
        ) : layout === 'minimal' ? (
          <ul className="mx-auto flex max-w-xl flex-col gap-3">
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  href={`${basePath}/p/${product.slug}`}
                  variant="row"
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul
            className={
              layout === 'grid'
                ? 'grid grid-cols-1 gap-5 @xl:grid-cols-2 @5xl:grid-cols-3'
                : 'grid grid-cols-1 gap-6 @xl:grid-cols-2'
            }
          >
            {products.map((product) => (
              <li key={product.id} className="flex">
                <div className="flex w-full">
                  <ProductCard product={product} href={`${basePath}/p/${product.slug}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
