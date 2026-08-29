/**
 * Storefront product card component (Item 4.4).
 */
import Link from 'next/link'
import { money, type CurrencyCode } from '@creatorhub/contracts'
import { MoneyDisplay } from '@creatorhub/ui'

export type StorefrontProductItem = {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly description: string | null
  readonly basePrice: string
  readonly compareAtPrice: string | null
  readonly currency: string
}

type ProductCardProps = {
  readonly product: StorefrontProductItem
  readonly basePath: string
  readonly accentColor?: string | undefined
}

export function ProductCard({ product, basePath, accentColor = '#4f46e5' }: ProductCardProps) {
  const baseMoney = money(BigInt(product.basePrice), product.currency as CurrencyCode)
  const compareAtMoney = product.compareAtPrice
    ? money(BigInt(product.compareAtPrice), product.currency as CurrencyCode)
    : null

  const hasDiscount = compareAtMoney && compareAtMoney.amount > baseMoney.amount

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[var(--border-hover)] hover:shadow-md">
      <div className="flex h-36 w-full items-center justify-center rounded-lg bg-[var(--bg-subtle)] text-[var(--text-tertiary)] transition-colors group-hover:bg-[var(--bg-subtle)]/80">
        <svg
          className="h-10 w-10 text-[var(--text-tertiary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-primary)]">
              <Link href={`${basePath}/p/${product.slug}`} className="focus:outline-none">
                <span className="absolute inset-0" aria-hidden="true" />
                {product.title}
              </Link>
            </h3>
            {hasDiscount && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Sale
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
              {product.description}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-[var(--text-primary)]">
              <MoneyDisplay value={baseMoney} />
            </span>
            {hasDiscount && (
              <span className="text-xs text-[var(--text-tertiary)] line-through">
                <MoneyDisplay value={compareAtMoney} />
              </span>
            )}
          </div>
          <span
            className="text-xs font-semibold text-[var(--accent-primary)] transition-transform group-hover:translate-x-0.5"
            style={{ color: accentColor }}
          >
            View &rarr;
          </span>
        </div>
      </div>
    </div>
  )
}
