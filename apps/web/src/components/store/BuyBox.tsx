'use client'

/**
 * Price, option picker, and the buy button. A sticky bar repeats the button on
 * phones once the main one scrolls out of view.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Lock } from 'lucide-react'

import { formatAmount } from '@/lib/format'
import type { PublicProductDetail } from '@/lib/storefront-public'

import { PriceTag } from './ProductCard'

export function BuyBox({
  product,
  checkoutHref,
}: {
  readonly product: PublicProductDetail
  readonly checkoutHref: string
}) {
  const [variantId, setVariantId] = useState<string | null>(product.variants[0]?.id ?? null)
  const [showSticky, setShowSticky] = useState(false)
  const buttonRef = useRef<HTMLAnchorElement>(null)

  const variant = product.variants.find((v) => v.id === variantId)
  const price = variant?.price ?? product.price
  const isFree = BigInt(price) === 0n
  const href = `${checkoutHref}?product=${encodeURIComponent(product.slug)}${variant ? `&variant=${variant.id}` : ''}`
  const label = isFree
    ? 'Get it free'
    : `Buy for ${formatAmount(price, product.currency, { compact: true })}`

  useEffect(() => {
    const el = buttonRef.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      setShowSticky(entry ? !entry.isIntersecting : false)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div>
      <PriceTag
        price={price}
        compareAtPrice={variant ? null : product.compareAtPrice}
        currency={product.currency}
        size="large"
      />

      {product.variants.length > 1 && (
        <fieldset className="mt-6">
          <legend className="mb-2.5 text-[13px] font-medium text-content-secondary">
            Choose an option
          </legend>
          <div className="grid gap-2">
            {product.variants.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                  option.id === variantId
                    ? 'border-[var(--store-accent)] bg-surface-raised shadow-elevation-1'
                    : 'border-border-subtle hover:border-border-default'
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="variant"
                    value={option.id}
                    checked={option.id === variantId}
                    onChange={() => {
                      setVariantId(option.id)
                    }}
                    className="size-4 accent-[var(--store-accent)]"
                  />
                  <span className="font-medium">{option.title}</span>
                </span>
                <span className="tabular-nums text-content-secondary">
                  {BigInt(option.price) === 0n
                    ? 'Free'
                    : formatAmount(option.price, product.currency, { compact: true })}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <Link
        ref={buttonRef}
        href={href}
        className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--store-accent)] px-6 text-[16px] font-semibold text-[var(--store-accent-fg)] shadow-elevation-2 transition-all hover:brightness-110 active:scale-[0.99]"
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-content-tertiary">
        <Lock className="size-3" aria-hidden="true" />
        {isFree ? 'Instant access by email' : 'Secure checkout. UPI, cards, and netbanking.'}
      </p>

      {showSticky && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-raised/95 p-3 backdrop-blur md:hidden">
          <Link
            href={href}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--store-accent)] font-semibold text-[var(--store-accent-fg)]"
          >
            {label}
          </Link>
        </div>
      )}
    </div>
  )
}
