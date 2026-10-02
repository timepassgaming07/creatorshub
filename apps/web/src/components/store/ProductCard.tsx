import Link from 'next/link'
import { ArrowUpRight, FileDown } from 'lucide-react'

import { formatAmount } from '@/lib/format'
import type { PublicProductCard } from '@/lib/storefront-public'

/** A deterministic gradient for products without a cover, so no card is blank. */
function placeholderHue(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

export function ProductCover({
  product,
  className = 'aspect-[4/3]',
  showTitle = false,
}: {
  readonly product: Pick<PublicProductCard, 'title' | 'coverUrl' | 'id'>
  readonly className?: string
  /** Print the title on a placeholder cover. Off where the title sits right below it. */
  readonly showTitle?: boolean
}) {
  if (product.coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- streamed and cached by our media route
      <img
        src={product.coverUrl}
        alt=""
        loading="lazy"
        className={`${className} w-full object-cover`}
      />
    )
  }
  const hue = placeholderHue(product.id)
  return (
    <div
      aria-hidden="true"
      className={`${className} relative flex w-full items-end overflow-hidden p-5`}
      style={{
        background: `radial-gradient(120% 90% at 0% 0%, oklch(78% 0.12 ${String(hue)}) 0%, transparent 60%), radial-gradient(120% 120% at 100% 100%, var(--store-accent) 0%, oklch(30% 0.05 ${String(hue)}) 70%)`,
      }}
    >
      {showTitle && (
        <span className="line-clamp-2 max-w-[85%] text-2xl leading-tight font-semibold text-white/95 store-heading drop-shadow-sm">
          {product.title}
        </span>
      )}
    </div>
  )
}

export function PriceTag({
  price,
  compareAtPrice,
  currency,
  size = 'medium',
}: {
  readonly price: string
  readonly compareAtPrice: string | null
  readonly currency: string
  readonly size?: 'medium' | 'large'
}) {
  const isFree = BigInt(price) === 0n
  const hasCompare = compareAtPrice !== null && BigInt(compareAtPrice) > BigInt(price)
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={`font-semibold tabular-nums ${size === 'large' ? 'text-3xl tracking-tight' : 'text-[15px]'}`}
      >
        {isFree ? 'Free' : formatAmount(price, currency, { compact: true })}
      </span>
      {hasCompare && (
        <span
          className={`text-content-tertiary line-through tabular-nums ${size === 'large' ? 'text-lg' : 'text-[13px]'}`}
        >
          {formatAmount(compareAtPrice, currency, { compact: true })}
        </span>
      )}
    </span>
  )
}

export function ProductCard({
  product,
  href,
  variant = 'card',
}: {
  readonly product: PublicProductCard
  readonly href: string
  readonly variant?: 'card' | 'row'
}) {
  if (variant === 'row') {
    return (
      <Link
        href={href}
        className="group flex items-center gap-4 rounded-2xl border border-border-subtle bg-surface-raised p-3 pr-5 shadow-elevation-1 transition-all hover:-translate-y-0.5 hover:shadow-elevation-2"
      >
        <div className="size-16 shrink-0 overflow-hidden rounded-xl">
          <ProductCover product={product} className="aspect-square h-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold store-heading">{product.title}</p>
          {product.excerpt && (
            <p className="mt-0.5 truncate text-[13px] text-content-secondary">{product.excerpt}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-[var(--store-accent)] px-3 py-1.5 text-[13px] font-semibold text-[var(--store-accent-fg)]">
          {BigInt(product.price) === 0n
            ? 'Free'
            : formatAmount(product.price, product.currency, { compact: true })}
        </span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised shadow-elevation-1 transition-all duration-300 hover:-translate-y-1 hover:shadow-elevation-3"
    >
      <div className="overflow-hidden">
        <div className="transition-transform duration-500 group-hover:scale-[1.03]">
          <ProductCover product={product} />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[17px] leading-snug font-semibold tracking-tight store-heading">
          {product.title}
        </h3>
        {product.excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-content-secondary">
            {product.excerpt}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-5">
          <PriceTag
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            currency={product.currency}
          />
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-content-secondary transition-colors group-hover:text-content-primary">
            {product.fileCount > 0 && <FileDown className="size-3.5" aria-hidden="true" />}
            View
            <ArrowUpRight
              className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>
    </Link>
  )
}
