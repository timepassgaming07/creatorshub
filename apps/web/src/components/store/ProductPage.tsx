/**
 * Product detail: cover and gallery on the left, the buy box on the right,
 * then what the buyer actually receives.
 */
import Link from 'next/link'
import { ArrowLeft, BadgeCheck, FileText, Infinity as InfinityIcon, Mail, Zap } from 'lucide-react'

import { formatBytes } from '@/lib/format'
import type { PublicProductDetail, PublicStore } from '@/lib/storefront-public'

import { BuyBox } from './BuyBox'
import { ProductCover } from './ProductCard'

function fileKind(name: string, type: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() : null
  return ext ?? type.split('/').pop()?.toUpperCase() ?? 'FILE'
}

export function ProductPage({
  store,
  product,
  basePath,
}: {
  readonly store: PublicStore
  readonly product: PublicProductDetail
  readonly basePath: string
}) {
  const isFree = BigInt(product.price) === 0n && product.variants.every((v) => BigInt(v.price) === 0n)

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-16">
      <Link
        href={basePath || '/'}
        className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {store.title}
      </Link>

      <div className="grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-border-subtle shadow-elevation-2">
            <ProductCover product={product} className="aspect-[4/3]" showTitle />
          </div>
          {product.gallery.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {product.gallery.slice(0, 6).map((src) => (
                <div key={src} className="overflow-hidden rounded-xl border border-border-subtle">
                  {/* eslint-disable-next-line @next/next/no-img-element -- media route */}
                  <img src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="md:sticky md:top-8 md:self-start">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight store-heading text-balance sm:text-4xl">
            {product.title}
          </h1>
          <p className="mt-2 text-[14px] text-content-secondary">by {store.title}</p>
          <div className="mt-6">
            <BuyBox product={product} checkoutHref={`${basePath}/checkout`} />
          </div>

          <ul className="mt-8 grid gap-3 border-t border-border-subtle pt-6 text-[14px] text-content-secondary">
            <li className="flex items-center gap-3">
              <Zap className="size-4 text-[var(--store-accent)]" aria-hidden="true" />
              Delivered instantly after {isFree ? 'you sign up' : 'payment'}
            </li>
            <li className="flex items-center gap-3">
              <Mail className="size-4 text-[var(--store-accent)]" aria-hidden="true" />
              Download links sent to your email
            </li>
            <li className="flex items-center gap-3">
              <BadgeCheck className="size-4 text-[var(--store-accent)]" aria-hidden="true" />
              {isFree ? 'No card needed' : 'Paid securely through Razorpay'}
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-14 grid gap-10 md:grid-cols-[1.15fr_1fr] md:gap-14">
        <section aria-labelledby="about-heading">
          <h2 id="about-heading" className="text-xl font-semibold tracking-tight store-heading">
            About this product
          </h2>
          {product.description ? (
            <div className="mt-4 text-[16px] leading-[1.75] text-content-secondary whitespace-pre-line text-pretty">
              {product.description}
            </div>
          ) : (
            <p className="mt-4 text-content-tertiary">The creator has not added a description yet.</p>
          )}
        </section>

        <section aria-labelledby="included-heading">
          <h2 id="included-heading" className="text-xl font-semibold tracking-tight store-heading">
            What&apos;s included
          </h2>
          {product.files.length > 0 ? (
            <ul className="mt-4 divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised">
              {product.files.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[10px] font-bold tracking-wide text-content-secondary">
                    {fileKind(file.name, file.type).slice(0, 4)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{file.name}</span>
                  <span className="shrink-0 text-[13px] text-content-tertiary tabular-nums">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-content-tertiary">
              <FileText className="size-4" aria-hidden="true" />
              Files are delivered by email after purchase.
            </p>
          )}
          <p className="mt-4 flex items-center gap-2 text-[13px] text-content-tertiary">
            <InfinityIcon className="size-4" aria-hidden="true" />
            Lost your link? You can get fresh links from your order page any time.
          </p>
        </section>
      </div>
    </div>
  )
}
