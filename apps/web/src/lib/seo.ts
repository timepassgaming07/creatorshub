/**
 * Storefront SEO metadata and JSON-LD structured data generator (Implementation Plan §4.6).
 *
 * Responsibilities:
 * 1. Build Open Graph & Twitter card metadata for storefront home and product detail pages.
 * 2. Generate Schema.org JSON-LD structured data (WebSite, Store, Product, Offer).
 * 3. Construct canonical URLs for subdomains and custom domains.
 */
import type { Metadata } from 'next'
import { minorUnitExponent, type CurrencyCode, type StorefrontRecord } from '@creatorhub/contracts'
import type { PublicProductDetailData, PublicStorefrontData } from './storefront-actions'

export type StorefrontSeoOptions = {
  readonly storefront: StorefrontRecord
  readonly canonicalUrl: string
}

export type ProductSeoOptions = {
  readonly storefront: StorefrontRecord
  readonly product: PublicProductDetailData['product']
  readonly canonicalUrl: string
}

/**
 * Builds Next.js Metadata for storefront homepage.
 */
export function buildStorefrontMetadata({
  storefront,
  canonicalUrl,
}: StorefrontSeoOptions): Metadata {
  const title = storefront.title
  const description =
    storefront.tagline ??
    storefront.description ??
    `Browse digital downloads, courses, and creations from ${storefront.title}.`

  return {
    title: `${title} | Creator Store`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: storefront.title,
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: storefront.status === 'published',
      follow: storefront.status === 'published',
    },
  }
}

/**
 * Builds Next.js Metadata for product detail page.
 */
export function buildProductMetadata({
  storefront,
  product,
  canonicalUrl,
}: ProductSeoOptions): Metadata {
  const title = `${product.title} | ${storefront.title}`
  const description =
    product.description?.slice(0, 160) ??
    `Download ${product.title} from ${storefront.title}. Instant digital access.`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: product.title,
      description,
      url: canonicalUrl,
      siteName: storefront.title,
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description,
    },
    robots: {
      index: storefront.status === 'published',
      follow: storefront.status === 'published',
    },
  }
}

/**
 * Generates Schema.org WebSite JSON-LD structured data.
 */
export function generateStorefrontJsonLd(data: PublicStorefrontData, canonicalUrl: string) {
  const { storefront } = data
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: storefront.title,
    description:
      storefront.tagline ?? storefront.description ?? `Official store for ${storefront.title}`,
    url: canonicalUrl,
  }
}

/**
 * Generates Schema.org Product and Offer JSON-LD structured data.
 */
export function generateProductJsonLd(data: PublicProductDetailData, canonicalUrl: string) {
  const { storefront, product } = data
  const exponent = minorUnitExponent(product.currency as CurrencyCode)
  const numericPrice = Number(product.basePrice) / 10 ** exponent

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? `Digital product from ${storefront.title}`,
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      price: numericPrice.toFixed(exponent),
      priceCurrency: product.currency,
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
      seller: {
        '@type': 'Organization',
        name: storefront.title,
      },
    },
  }
}
