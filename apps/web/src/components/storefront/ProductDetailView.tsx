/**
 * Product detail view component (Item 4.4).
 */
import Link from 'next/link'
import { money, type CurrencyCode } from '@creatorhub/contracts'
import { MoneyDisplay } from '@creatorhub/ui'
import type { PublicProductDetailData } from '@/lib/storefront-actions'

type ProductDetailViewProps = {
  readonly data: PublicProductDetailData
  readonly basePath: string
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toString()} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ProductDetailView({ data, basePath }: ProductDetailViewProps) {
  const { storefront, product } = data
  const baseMoney = money(BigInt(product.basePrice), product.currency as CurrencyCode)
  const compareAtMoney = product.compareAtPrice
    ? money(BigInt(product.compareAtPrice), product.currency as CurrencyCode)
    : null

  const isFree = baseMoney.amount === 0n
  const hasDiscount = !isFree && compareAtMoney && compareAtMoney.amount > baseMoney.amount
  const discountPercent = hasDiscount
    ? Math.round(
        (Number(compareAtMoney.amount - baseMoney.amount) / Number(compareAtMoney.amount)) * 100,
      )
    : 0

  const deliverableAssets = product.assets.filter((a) => a.role === 'deliverable')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <span>&larr;</span> Back to {storefront.title}
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-12">
        {/* Left Column: Media / Preview */}
        <div className="lg:col-span-7">
          <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--bg-subtle)] shadow-inner">
            <svg
              className="h-16 w-16 text-[var(--text-tertiary)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>

          {/* Deliverables / Digital Assets Summary */}
          {deliverableAssets.length > 0 && (
            <div className="mt-8 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Included with this download ({deliverableAssets.length})
              </h3>
              <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
                {deliverableAssets.map((asset) => (
                  <li key={asset.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2.5">
                      <svg
                        className="h-4 w-4 text-[var(--text-tertiary)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="font-medium text-[var(--text-primary)]">
                        {asset.originalFilename}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatByteSize(asset.byteSize)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Column: Title, Pricing & Checkout CTA */}
        <div className="flex flex-col justify-between lg:col-span-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {product.title}
            </h1>

            <div className="mt-4 flex items-baseline gap-3">
              {isFree ? (
                <>
                  <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    Free
                  </span>
                  <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Lead Magnet / Instant Access
                  </span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-extrabold text-[var(--text-primary)]">
                    <MoneyDisplay value={baseMoney} />
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-lg text-[var(--text-tertiary)] line-through">
                        <MoneyDisplay value={compareAtMoney} />
                      </span>
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Save {discountPercent}%
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            {product.description && (
              <div className="mt-6 border-t border-[var(--border-default)] pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Description
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                  {product.description}
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-[var(--border-default)] pt-6">
            <Link
              href={`${basePath}/checkout?productId=${product.id}`}
              className="flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-md transition-all hover:opacity-95 active:scale-98"
              style={{ backgroundColor: storefront.themeConfig.accentColor }}
            >
              {isFree ? 'Get Free Download' : 'Buy Now'}
            </Link>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
              <svg
                className="h-4 w-4 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span>
                {isFree
                  ? 'Instant download link sent to your email'
                  : 'Instant digital download upon purchase'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
