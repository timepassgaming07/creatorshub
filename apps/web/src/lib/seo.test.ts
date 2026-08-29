/**
 * Storefront SEO and JSON-LD unit tests (Item 4.6).
 */
import { storefrontId, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import {
  buildProductMetadata,
  buildStorefrontMetadata,
  generateProductJsonLd,
  generateStorefrontJsonLd,
} from './seo'
import type { PublicProductDetailData, PublicStorefrontData } from './storefront-actions'

describe('Storefront SEO Metadata & Open Graph', () => {
  const mockStorefront = {
    id: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
    workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
    subdomain: 'sarah-designs',
    customDomain: 'shop.sarahdesigns.com',
    customDomainStatus: 'verified' as const,
    customDomainVerificationToken: null,
    customDomainVerifiedAt: new Date(),
    title: 'Sarah Designs',
    tagline: 'Premium UI kits and Figma templates',
    description: 'The best design assets for web creators.',
    themeConfig: {
      accentColor: '#4f46e5',
      fontPreset: 'sans' as const,
      layoutPreset: 'showcase' as const,
    },
    status: 'published' as const,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('builds complete metadata for storefront homepage', () => {
    const meta = buildStorefrontMetadata({
      storefront: mockStorefront,
      canonicalUrl: 'https://shop.sarahdesigns.com',
    })

    expect(meta.title).toBe('Sarah Designs | Creator Store')
    expect(meta.description).toBe('Premium UI kits and Figma templates')
    expect(meta.alternates?.canonical).toBe('https://shop.sarahdesigns.com')
    expect(meta.openGraph?.title).toBe('Sarah Designs')
    expect((meta.openGraph as Record<string, unknown> | undefined)?.['type']).toBe('website')
    expect((meta.twitter as Record<string, unknown> | undefined)?.['card']).toBe(
      'summary_large_image',
    )
    expect(meta.robots).toEqual({ index: true, follow: true })
  })

  it('builds complete metadata for product detail page', () => {
    const product = {
      id: '018f9e2b-7c5e-7a2e-8c3b-333333333333',
      title: 'Mobile UI Kit 2026',
      slug: 'mobile-ui-kit-2026',
      description: 'Over 200 components designed for modern iOS and Android apps.',
      basePrice: '7900',
      compareAtPrice: '12900',
      currency: 'USD',
      assets: [],
    }

    const meta = buildProductMetadata({
      storefront: mockStorefront,
      product,
      canonicalUrl: 'https://shop.sarahdesigns.com/p/mobile-ui-kit-2026',
    })

    expect(meta.title).toBe('Mobile UI Kit 2026 | Sarah Designs')
    expect(meta.description).toContain('Over 200 components')
    expect(meta.alternates?.canonical).toBe('https://shop.sarahdesigns.com/p/mobile-ui-kit-2026')
    expect(meta.openGraph?.title).toBe('Mobile UI Kit 2026')
  })
})

describe('JSON-LD Structured Data Generation', () => {
  const mockStorefrontData: PublicStorefrontData = {
    storefront: {
      id: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
      subdomain: 'sarah-designs',
      customDomain: null,
      customDomainStatus: 'pending',
      customDomainVerificationToken: null,
      customDomainVerifiedAt: null,
      title: 'Sarah Designs',
      tagline: 'Premium UI kits',
      description: 'Design assets',
      themeConfig: {
        accentColor: '#4f46e5',
        fontPreset: 'sans',
        layoutPreset: 'showcase',
      },
      status: 'published',
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    products: [],
  }

  it('generates valid WebSite Schema.org JSON-LD', () => {
    const jsonLd = generateStorefrontJsonLd(
      mockStorefrontData,
      'https://sarah-designs.creatorhub.com',
    )

    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@type']).toBe('WebSite')
    expect(jsonLd.name).toBe('Sarah Designs')
    expect(jsonLd.url).toBe('https://sarah-designs.creatorhub.com')
  })

  it('generates valid Product and Offer Schema.org JSON-LD with correct minor-unit conversion', () => {
    const mockProductData: PublicProductDetailData = {
      storefront: mockStorefrontData.storefront,
      product: {
        id: '018f9e2b-7c5e-7a2e-8c3b-333333333333',
        title: 'Design System Pro',
        slug: 'design-system-pro',
        description: 'Comprehensive token and component library',
        basePrice: '9900', // $99.00 USD
        compareAtPrice: null,
        currency: 'USD',
        assets: [],
      },
    }

    const jsonLd = generateProductJsonLd(
      mockProductData,
      'https://sarah-designs.creatorhub.com/p/design-system-pro',
    )

    expect(jsonLd['@context']).toBe('https://schema.org')
    expect(jsonLd['@type']).toBe('Product')
    expect(jsonLd.name).toBe('Design System Pro')
    expect(jsonLd.offers['@type']).toBe('Offer')
    expect(jsonLd.offers.price).toBe('99.00')
    expect(jsonLd.offers.priceCurrency).toBe('USD')
    expect(jsonLd.offers.availability).toBe('https://schema.org/InStock')
    expect(jsonLd.offers.seller.name).toBe('Sarah Designs')
  })
})
