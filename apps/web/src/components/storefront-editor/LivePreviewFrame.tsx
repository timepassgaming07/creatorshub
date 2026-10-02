'use client'

/**
 * Responsive Live Preview Canvas for Storefront Studio (Item 4.8).
 *
 * Responsibilities:
 * - Viewport switcher (Desktop, Tablet, Mobile) with fluid width transitions.
 * - Browser address bar simulation with dynamic protocol and host.
 * - Live rendered StorefrontThemeProvider wrapping Header, Hero, ProductGrid, and Footer.
 * - Instant reactivity to title, tagline, description, and theme customization changes.
 */
import { useState } from 'react'
import {
  storefrontId,
  workspaceId,
  type StorefrontRecord,
  type StorefrontTheme,
} from '@creatorhub/contracts'

import type { StorefrontProductItem } from '../storefront/ProductCard'
import { ProductGrid } from '../storefront/ProductGrid'
import { StorefrontFooter } from '../storefront/StorefrontFooter'
import { StorefrontHeader } from '../storefront/StorefrontHeader'
import { StorefrontHero } from '../storefront/StorefrontHero'
import { LinkInBioSection } from '../storefront/LinkInBioSection'
import { StorefrontThemeProvider } from '../storefront/StorefrontThemeProvider'

export type ViewportDevice = 'desktop' | 'tablet' | 'mobile'

type LivePreviewFrameProps = {
  readonly title: string
  readonly tagline?: string | null
  readonly description?: string | null
  readonly subdomain: string
  readonly customDomain?: string | null
  readonly themeConfig?: StorefrontTheme | null
  readonly products: readonly StorefrontProductItem[]
}

const SAMPLE_DEMO_PRODUCTS: readonly StorefrontProductItem[] = [
  {
    id: 'demo-1',
    title: 'Mastering TypeScript & Modern Node.js',
    slug: 'mastering-typescript',
    description:
      'A complete deep-dive video masterclass on advanced type systems and architecture.',
    basePrice: '499900',
    compareAtPrice: '799900',
    currency: 'INR',
  },
  {
    id: 'demo-2',
    title: 'UI Design System Starter Kit',
    slug: 'ui-design-system-kit',
    description:
      'Figma templates, responsive components, and accessible design tokens for creators.',
    basePrice: '299900',
    compareAtPrice: null,
    currency: 'INR',
  },
  {
    id: 'demo-3',
    title: 'Creator Playbook: Zero to 10k',
    slug: 'creator-playbook-guide',
    description: 'Actionable handbook and Notion worksheets on audience growth and digital sales.',
    basePrice: '149900',
    compareAtPrice: '249900',
    currency: 'INR',
  },
]

export function LivePreviewFrame({
  title,
  tagline,
  description,
  subdomain,
  customDomain,
  themeConfig,
  products,
}: LivePreviewFrameProps) {
  const [device, setDevice] = useState<ViewportDevice>('desktop')

  const effectiveProducts = products.length > 0 ? products : SAMPLE_DEMO_PRODUCTS
  const displayHost =
    customDomain ?? (subdomain ? `${subdomain}.creatorhub.com` : 'store.creatorhub.com')

  const widthStyle =
    device === 'mobile'
      ? 'max-w-[390px]'
      : device === 'tablet'
        ? 'max-w-[768px]'
        : 'w-full max-w-full'

  const previewTheme: StorefrontTheme = {
    accentColor: themeConfig?.accentColor ?? '#4f46e5',
    fontPreset: themeConfig?.fontPreset ?? 'sans',
    layoutPreset: themeConfig?.layoutPreset ?? 'showcase',
    heroHeadline: themeConfig?.heroHeadline,
    heroSubheadline: themeConfig?.heroSubheadline,
    logoAssetId: themeConfig?.logoAssetId,
    bannerAssetId: themeConfig?.bannerAssetId,
    bio: themeConfig?.bio,
    socialLinks: themeConfig?.socialLinks ?? [],
    customLinks: themeConfig?.customLinks ?? [],
  }

  const mockStorefront: StorefrontRecord = {
    id: storefrontId('018f9e2b-7c5e-7a2e-8c3b-000000000000'),
    workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000000'),
    subdomain,
    customDomain: customDomain ?? null,
    customDomainStatus: 'verified',
    customDomainVerificationToken: null,
    customDomainVerifiedAt: null,
    title: title || 'Your Storefront',
    tagline: tagline ?? null,
    description: description ?? null,
    themeConfig: previewTheme,
    status: 'published',
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  return (
    <div className="flex flex-col h-full rounded-2xl border border-neutral-200 bg-neutral-100 shadow-inner dark:border-neutral-800 dark:bg-neutral-950/60 overflow-hidden">
      {/* Device Toolbar & Mock Browser Chrome */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        {/* Device Switcher */}
        <div className="flex items-center rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => {
              setDevice('desktop')
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              device === 'desktop'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            title="Desktop View (100%)"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="2" />
              <line x1="8" y1="21" x2="16" y2="21" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="17" x2="12" y2="21" strokeWidth="2" />
            </svg>
            <span>Desktop</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDevice('tablet')
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              device === 'tablet'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            title="Tablet View (768px)"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="4" y="2" width="16" height="20" rx="2" strokeWidth="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Tablet</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDevice('mobile')
            }}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
              device === 'mobile'
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
            title="Mobile View (390px)"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Mobile</span>
          </button>
        </div>

        {/* Browser Mock URL Bar */}
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          <svg
            className="h-3 w-3 text-emerald-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="font-mono truncate max-w-[220px]">https://{displayHost}</span>
        </div>

        {/* Live Badge */}
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Preview</span>
        </div>
      </div>

      {/* Viewport Frame Container */}
      <div className="flex-1 overflow-y-auto p-4 flex justify-center items-start">
        <div
          className={`${widthStyle} transition-all duration-300 ease-in-out rounded-xl border border-neutral-300 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 overflow-hidden`}
        >
          <StorefrontThemeProvider theme={previewTheme}>
            <div className="flex min-h-[680px] flex-col justify-between">
              <div>
                <StorefrontHeader storefront={mockStorefront} basePath="" />
                <StorefrontHero storefront={mockStorefront} basePath="" />
                <LinkInBioSection
                  theme={previewTheme}
                  creatorName={title || 'Your Storefront'}
                />
                <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                  <ProductGrid
                    products={effectiveProducts}
                    basePath=""
                    accentColor={previewTheme.accentColor}
                    layoutPreset={previewTheme.layoutPreset}
                  />
                </section>
              </div>
              <StorefrontFooter storefront={mockStorefront} />
            </div>
          </StorefrontThemeProvider>
        </div>
      </div>
    </div>
  )
}
