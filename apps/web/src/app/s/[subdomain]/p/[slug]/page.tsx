/**
 * Creator subdomain product detail page (Item 4.4).
 * Route: /s/[subdomain]/p/[slug]
 */
import { notFound } from 'next/navigation'
import { getPublicProductDetailBySubdomain } from '@/lib/storefront-actions'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { ProductDetailView } from '@/components/storefront/ProductDetailView'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type SubdomainProductDetailPageProps = {
  readonly params: Promise<{ readonly subdomain: string; readonly slug: string }>
  readonly searchParams?: Promise<{ readonly previewWorkspaceId?: string }>
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
