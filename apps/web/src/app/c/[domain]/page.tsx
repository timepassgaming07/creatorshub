/**
 * Custom domain storefront homepage (Item 4.4, 4.5, 4.6, 4.7).
 * Route: /c/[domain]
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicStorefrontDataByCustomDomain } from '@/lib/storefront-actions'
import { buildStorefrontMetadata, generateStorefrontJsonLd } from '@/lib/seo'
import { StorefrontThemeProvider } from '@/components/storefront/StorefrontThemeProvider'
import { StorefrontTelemetry } from '@/components/storefront/StorefrontTelemetry'
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader'
import { StorefrontHero } from '@/components/storefront/StorefrontHero'
import { ProductGrid } from '@/components/storefront/ProductGrid'
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter'

type CustomDomainStorefrontPageProps = {
  readonly params: Promise<{ readonly domain: string }>
}

export async function generateMetadata({
  params,
}: CustomDomainStorefrontPageProps): Promise<Metadata> {
  const { domain } = await params
  const data = await getPublicStorefrontDataByCustomDomain(domain)
  if (!data) return { title: 'Storefront Not Found' }

  const canonicalUrl = `https://${domain}`
  return buildStorefrontMetadata({ storefront: data.storefront, canonicalUrl })
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
  const canonicalUrl = `https://${domain}`
  const jsonLd = generateStorefrontJsonLd(data, canonicalUrl)

  return (
    <StorefrontThemeProvider theme={storefront.themeConfig}>
      <StorefrontTelemetry storefrontId={storefront.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex min-h-screen flex-col">
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
              layoutPreset={storefront.themeConfig.layoutPreset}
            />
          </section>
        </main>
        <StorefrontFooter storefront={storefront} />
      </div>
    </StorefrontThemeProvider>
  )
}
