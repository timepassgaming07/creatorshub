/**
 * Custom domain product detail page (Item 4.4, 4.5, 4.6).
 * Route: /c/[domain]
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicProductDetailByCustomDomain } from '@/lib/storefront-actions'
import { buildProductMetadata, generateProductJsonLd } from '@/lib/seo'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { ProductDetailView } from '@/components/storefront/ProductDetailView'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type CustomDomainProductDetailPageProps = {
  readonly params: Promise<{ readonly domain: string; readonly slug: string }>
}

export async function generateMetadata({
  params,
}: CustomDomainProductDetailPageProps): Promise<Metadata> {
  const { domain, slug } = await params
  const data = await getPublicProductDetailByCustomDomain(domain, slug)
  if (!data) return { title: 'Product Not Found' }

  const canonicalUrl = `https://${domain}/p/${slug}`
  return buildProductMetadata({
    storefront: data.storefront,
    product: data.product,
    canonicalUrl,
  })
}

export default async function CustomDomainProductDetailPage({
  params,
}: CustomDomainProductDetailPageProps) {
  const { domain, slug } = await params
  const data = await getPublicProductDetailByCustomDomain(domain, slug)
  if (!data) {
    notFound()
  }

  const { storefront } = data
  const basePath = `/c/${domain}`
  const canonicalUrl = `https://${domain}/p/${slug}`
  const jsonLd = generateProductJsonLd(data, canonicalUrl)

  return (
    <StorefrontThemeProvider theme={storefront.themeConfig}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col">
        <StorefrontHeader storefront={storefront} basePath={basePath} />
        <main className="flex-1">
          <ProductDetailView data={data} basePath={basePath} />
        </main>
        <StorefrontFooter storefront={storefront} />
      </div>
    </StorefrontThemeProvider>
  )
}
