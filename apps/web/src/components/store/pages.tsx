/**
 * Storefront route bodies, shared by the subdomain routes (/s/[subdomain]/…)
 * and the custom-domain routes (/c/[domain]/…), which differ only in how the
 * store is named.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { INDIAN_STATES } from '@creatorhub/contracts'

import { StorefrontTelemetry } from '@/components/storefront/StorefrontTelemetry'
import { getBuyerOrder, quoteCheckout } from '@/lib/checkout'
import { appUrl } from '@/lib/env'
import { isTestPaymentMode } from '@/lib/payments'
import { storeBasePath } from '@/lib/store-routing'
import { storeAccent } from '@/lib/store-theme'
import { loadProduct, loadStore } from '@/lib/storefront-public'

import { CheckoutClient } from './CheckoutClient'
import { OrderStatus } from './OrderStatus'
import { ProductPage } from './ProductPage'
import { StoreHome } from './StoreHome'
import { StoreShell } from './StoreShell'

type Prefix = 's' | 'c'

function absolute(path: string | null): string | undefined {
  if (!path) return undefined
  return path.startsWith('http') ? path : `${appUrl()}${path}`
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export async function storeHomeMetadata(host: string): Promise<Metadata> {
  const data = await loadStore(host)
  if (!data) return { title: 'Store not found', robots: { index: false } }
  const { store } = data
  const description =
    store.tagline ?? store.theme.bio ?? store.description ?? `Digital products from ${store.title}.`
  return {
    title: { absolute: store.title },
    description,
    alternates: { canonical: store.url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title: store.title,
      description,
      url: store.url,
      images: store.bannerUrl ? [absolute(store.bannerUrl) ?? ''] : undefined,
    },
  }
}

export async function StoreHomeRoute({
  prefix,
  host,
  preview,
}: {
  readonly prefix: Prefix
  readonly host: string
  readonly preview?: string | undefined
}) {
  const data = await loadStore(host, { preview })
  if (!data) notFound()
  const basePath = await storeBasePath(prefix, host)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: data.store.title,
    url: data.store.url,
    description: data.store.tagline ?? undefined,
  }

  return (
    <StoreShell store={data.store} basePath={basePath} appUrl={appUrl()}>
      {!data.store.isPreview && <StorefrontTelemetry storefrontId={data.store.id} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StoreHome store={data.store} products={data.products} basePath={basePath} />
    </StoreShell>
  )
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export async function productMetadata(host: string, slug: string): Promise<Metadata> {
  const data = await loadProduct(host, slug)
  if (!data) return { title: 'Product not found', robots: { index: false } }
  const { store, product } = data
  const url = `${store.url}/p/${product.slug}`
  return {
    title: { absolute: `${product.title} · ${store.title}` },
    description: product.excerpt ?? `${product.title} by ${store.title}`,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: product.title,
      description: product.excerpt ?? undefined,
      url,
      images: product.coverUrl ? [absolute(product.coverUrl) ?? ''] : undefined,
    },
  }
}

export async function ProductRoute({
  prefix,
  host,
  slug,
  preview,
}: {
  readonly prefix: Prefix
  readonly host: string
  readonly slug: string
  readonly preview?: string | undefined
}) {
  const data = await loadProduct(host, slug, { preview })
  if (!data) notFound()
  const basePath = await storeBasePath(prefix, host)
  const { store, product } = data

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.excerpt ?? undefined,
    image: absolute(product.coverUrl),
    brand: { '@type': 'Brand', name: store.title },
    offers: {
      '@type': 'Offer',
      price: (Number(BigInt(product.price)) / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: 'https://schema.org/InStock',
      url: `${store.url}/p/${product.slug}`,
    },
  }

  return (
    <StoreShell store={store} basePath={basePath} compactHeader appUrl={appUrl()}>
      {!store.isPreview && <StorefrontTelemetry storefrontId={store.id} productId={product.id} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductPage store={store} product={product} basePath={basePath} />
    </StoreShell>
  )
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const checkoutMetadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export async function CheckoutRoute({
  prefix,
  host,
  productSlug,
  variantId,
  discount,
}: {
  readonly prefix: Prefix
  readonly host: string
  readonly productSlug: string | undefined
  readonly variantId: string | undefined
  readonly discount: string | undefined
}) {
  if (!productSlug) notFound()
  const data = await loadProduct(host, productSlug)
  if (!data) notFound()
  const { store, product } = data
  const variant = variantId ? (product.variants.find((v) => v.id === variantId) ?? null) : null

  const initial = await quoteCheckout({
    store: { host },
    line: { productId: product.id, variantId: variant?.id ?? null },
    discountCode: discount ?? null,
    buyer: { country: 'IN' },
  })
  if (!initial.ok) notFound()

  const basePath = await storeBasePath(prefix, host)

  return (
    <StoreShell store={store} basePath={basePath} compactHeader appUrl={appUrl()}>
      <StorefrontTelemetry storefrontId={store.id} productId={product.id} eventType="checkout_started" />
      <CheckoutClient
        host={host}
        basePath={basePath}
        storeTitle={store.title}
        accent={storeAccent(store.theme)}
        product={{
          id: product.id,
          slug: product.slug,
          title: product.title,
          coverUrl: product.coverUrl,
          currency: product.currency,
        }}
        variant={variant ? { id: variant.id, title: variant.title } : null}
        initialQuote={initial.quote}
        states={INDIAN_STATES}
        testMode={isTestPaymentMode()}
        appUrl={appUrl()}
        {...(discount ? { initialDiscount: discount } : {})}
      />
    </StoreShell>
  )
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export const orderMetadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
}

export async function OrderRoute({
  prefix,
  host,
  orderId,
}: {
  readonly prefix: Prefix
  readonly host: string
  readonly orderId: string
}) {
  const data = await loadStore(host)
  if (!data) notFound()
  const order = await getBuyerOrder({ store: { host }, orderId })
  if (!order) notFound()
  const basePath = await storeBasePath(prefix, host)

  return (
    <StoreShell store={data.store} basePath={basePath} compactHeader appUrl={appUrl()}>
      <OrderStatus order={order} host={host} />
    </StoreShell>
  )
}
