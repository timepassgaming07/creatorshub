/**
 * Custom domain product detail page (Item 4.4).
 * Route: /c/[domain]/p/[slug]
 */
import { notFound } from 'next/navigation'
import { getPublicProductDetailByCustomDomain } from '@/lib/storefront-actions'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { ProductDetailView } from '@/components/storefront/ProductDetailView'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type CustomDomainProductDetailPageProps = {
  readonly params: Promise<{ readonly domain: string; readonly slug: string }>
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

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)]">
      <StorefrontHeader storefront={storefront} basePath={basePath} />
      <main className="flex-1">
        <ProductDetailView data={data} basePath={basePath} />
      </main>
      <StorefrontFooter storefront={storefront} />
    </div>
  )
}
