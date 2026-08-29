/**
 * Creator subdomain product detail page (Item 4.4, 4.5, 4.6).
 * Route: /s/[subdomain]/p/[slug]
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicProductDetailBySubdomain } from '@/lib/storefront-actions'
import { buildProductMetadata, generateProductJsonLd } from '@/lib/seo'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { ProductDetailView } from '@/components/storefront/ProductDetailView'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type SubdomainProductDetailPageProps = {
  readonly params: Promise<{ readonly subdomain: string; readonly slug: string }>
  readonly searchParams?: Promise<{ readonly previewWorkspaceId?: string }>
}

export async function generateMetadata({
  params,
  searchParams,
}: SubdomainProductDetailPageProps): Promise<Metadata> {
  const { subdomain, slug } = await params
  const sParams = await searchParams
  const data = await getPublicProductDetailBySubdomain(subdomain, slug, sParams?.previewWorkspaceId)
  if (!data) return { title: 'Product Not Found' }

  const platformRoot = process.env['PLATFORM_ROOT_DOMAIN'] ?? 'creatorhub.com'
  const canonicalUrl = `https://${subdomain}.${platformRoot}/p/${slug}`
  return buildProductMetadata({
    storefront: data.storefront,
    product: data.product,
    canonicalUrl,
  })
}

export default async function SubdomainProductDetailPage({
  params,
  searchParams,
}: SubdomainProductDetailPageProps) {
  const { subdomain, slug } = await params
  const sParams = await searchParams
  const previewWorkspaceId = sParams?.previewWorkspaceId

  const data = await getPublicProductDetailBySubdomain(subdomain, slug, previewWorkspaceId)
  if (!data) {
    notFound()
  }

  const { storefront } = data
  const basePath = `/s/${subdomain}`
  const platformRoot = process.env['PLATFORM_ROOT_DOMAIN'] ?? 'creatorhub.com'
  const canonicalUrl = `https://${subdomain}.${platformRoot}/p/${slug}`
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
