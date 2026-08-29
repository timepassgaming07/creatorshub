/**
 * Custom domain storefront homepage (Item 4.4).
 * Route: /c/[domain]
 */
import { notFound } from 'next/navigation'
import { getPublicStorefrontDataByCustomDomain } from '@/lib/storefront-actions'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { StorefrontHero } from '@/components/storefront/StorefrontHero'
import { ProductGrid } from '@/components/storefront/ProductGrid'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type CustomDomainStorefrontPageProps = {
  readonly params: Promise<{ readonly domain: string }>
}

export default async function CustomDomainStorefrontPage({
  params,
}: CustomDomainStorefrontPageProps) {
  const { domain } = await params
  const data = await getPublicStorefrontDataByCustomDomain(domain)
  if (!data) {
    notFound()
  }

  const { storefront, products } = data
  const basePath = `/c/${domain}`

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)]">
      <StorefrontHeader storefront={storefront} basePath={basePath} />
      <main className="flex-1">
        <StorefrontHero storefront={storefront} basePath={basePath} />
        <section id="products" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                Products
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-sm">
                Digital downloads, templates, and courses
              </p>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {products.length} {products.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <ProductGrid
            products={products}
            basePath={basePath}
            accentColor={storefront.themeConfig.accentColor}
          />
        </section>
      </main>
      <StorefrontFooter storefront={storefront} />
    </div>
  )
}
