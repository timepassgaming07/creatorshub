/**
 * Storefront schemas, constants, and types (@creatorhub/contracts).
 *
 * Responsibilities:
 * - Subdomain and custom domain validation with reserved word guardrails.
 * - Storefront status and custom domain verification lifecycle states.
 * - Theme configuration model (accent colors, layout presets, typography).
 * - Create, update, and wire schemas for storefront multi-tenant public routing.
 */
import { z } from 'zod'

import {
  assetIdSchema,
  productIdSchema,
  storefrontIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import type { StorefrontId, WorkspaceId } from './identifiers.js'

export const STOREFRONT_STATUSES = ['draft', 'published', 'suspended'] as const
export type StorefrontStatus = (typeof STOREFRONT_STATUSES)[number]

export const CUSTOM_DOMAIN_STATUSES = ['pending', 'verified', 'failed'] as const
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number]

export const THEME_LAYOUT_PRESETS = ['minimal', 'showcase', 'grid', 'editorial'] as const
export type ThemeLayoutPreset = (typeof THEME_LAYOUT_PRESETS)[number]

/**
 * Reserved subdomains that cannot be claimed by creator storefronts.
 */
export const RESERVED_SUBDOMAINS = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'checkout',
  'creatorhub',
  'dashboard',
  'docs',
  'help',
  'mail',
  'pay',
  'payment',
  'payments',
  'preview',
  'staging',
  'status',
  'storefront',
  'support',
  'test',
  'webhook',
  'webhooks',
  'www',
] as const

export const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/
export const CUSTOM_DOMAIN_PATTERN =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/

export const storefrontStatusSchema = z.enum(STOREFRONT_STATUSES)
export const customDomainStatusSchema = z.enum(CUSTOM_DOMAIN_STATUSES)
export const themeLayoutPresetSchema = z.enum(THEME_LAYOUT_PRESETS)

export const subdomainSchema = z
  .string()
  .min(3, 'Subdomain must be at least 3 characters.')
  .max(63, 'Subdomain must not exceed 63 characters.')
  .toLowerCase()
  .regex(SUBDOMAIN_PATTERN, 'Subdomain must contain only lowercase letters, digits, and hyphens.')
  .refine(
    (sub) => !RESERVED_SUBDOMAINS.includes(sub as (typeof RESERVED_SUBDOMAINS)[number]),
    'This subdomain is reserved by the platform.',
  )

export const customDomainSchema = z
  .string()
  .min(4, 'Domain must be at least 4 characters.')
  .max(253, 'Domain must not exceed 253 characters.')
  .toLowerCase()
  .regex(CUSTOM_DOMAIN_PATTERN, 'Custom domain must be a valid FQDN (e.g. shop.example.com).')

/**
 * Supported social platforms for the link-in-bio section.
 * Icons are rendered on the public storefront by platform key.
 */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'youtube',
  'twitter',
  'tiktok',
  'linkedin',
  'github',
  'discord',
  'telegram',
  'spotify',
  'twitch',
  'facebook',
  'pinterest',
  'dribbble',
  'behance',
  'website',
] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

/**
 * A link a buyer will click. `z.string().url()` alone accepts `javascript:`
 * and `data:` URLs, which would run script on the storefront's origin.
 */
function linkUrl(protocols: readonly string[]) {
  return (
    z
      .string()
      .trim()
      .max(500)
      // pipe, so the URL check sees the trimmed value
      .pipe(z.url('Must be a valid URL.'))
      .refine(
        (value) => protocols.some((protocol) => value.toLowerCase().startsWith(protocol)),
        'Links must start with https://.',
      )
  )
}

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  url: linkUrl(['https:', 'http:']),
})

export type SocialLink = z.infer<typeof socialLinkSchema>

export const customLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: linkUrl(['https:', 'http:', 'mailto:']),
  emoji: z.string().max(4).optional(),
})

export type CustomLink = z.infer<typeof customLinkSchema>

export const storefrontThemeSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Accent color must be a valid hex code.')
    .default('#4f46e5'),
  fontPreset: z.enum(['sans', 'serif', 'mono']).default('sans'),
  layoutPreset: themeLayoutPresetSchema.default('showcase'),
  heroHeadline: z.string().max(200).optional(),
  heroSubheadline: z.string().max(500).optional(),
  logoAssetId: assetIdSchema.optional(),
  bannerAssetId: assetIdSchema.optional(),
  /** Creator bio text shown in the link-in-bio section. */
  bio: z.string().max(300).optional(),
  /** Social platform links displayed as icon row. Max 10. */
  socialLinks: z.array(socialLinkSchema).max(10).default([]),
  /** Custom link buttons displayed below products. Max 20. */
  customLinks: z.array(customLinkSchema).max(20).default([]),
})

export type StorefrontTheme = z.infer<typeof storefrontThemeSchema>

export const createStorefrontInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  subdomain: subdomainSchema,
  customDomain: customDomainSchema.optional(),
  title: z.string().trim().min(1, 'Title is required.').max(100),
  tagline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  themeConfig: storefrontThemeSchema.partial().optional(),
})

export type CreateStorefrontInput = z.infer<typeof createStorefrontInputSchema>

export const updateStorefrontInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(100).optional(),
  tagline: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
  customDomain: customDomainSchema.optional().nullable(),
  themeConfig: storefrontThemeSchema.partial().optional(),
  status: storefrontStatusSchema.optional(),
})

export type UpdateStorefrontInput = z.infer<typeof updateStorefrontInputSchema>

export const CERTIFICATE_STATUSES = ['pending', 'issuing', 'active', 'failed'] as const
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]

export type CustomDomainChallenge = {
  readonly domain: string
  readonly verificationToken: string
  readonly txtRecord: {
    readonly host: string
    readonly value: string
  }
  readonly cnameRecord: {
    readonly host: string
    readonly target: string
  }
}

export type CustomDomainVerificationResult =
  | {
      readonly verified: true
      readonly method: 'txt' | 'cname'
      readonly verifiedAt: Date
    }
  | {
      readonly verified: false
      readonly reason: 'token_mismatch' | 'cname_mismatch' | 'dns_lookup_failed' | 'not_configured'
      readonly details: string
    }

export const DEFAULT_PLATFORM_CNAME_TARGET = 'cname.creatorhub.com'

/**
 * Builds the expected DNS TXT and CNAME verification records for a custom domain.
 */
export function buildDomainChallenge(
  domain: string,
  verificationToken: string,
  cnameTarget: string = DEFAULT_PLATFORM_CNAME_TARGET,
): CustomDomainChallenge {
  const cleanDomain = domain.toLowerCase().trim()
  return {
    domain: cleanDomain,
    verificationToken,
    txtRecord: {
      host: `_creatorhub-challenge.${cleanDomain}`,
      value: verificationToken,
    },
    cnameRecord: {
      host: cleanDomain,
      target: cnameTarget,
    },
  }
}

export type StorefrontRecord = {
  readonly id: StorefrontId
  readonly workspaceId: WorkspaceId
  readonly subdomain: string
  readonly customDomain: string | null
  readonly customDomainStatus: CustomDomainStatus
  readonly customDomainVerificationToken: string | null
  readonly customDomainVerifiedAt: Date | null
  readonly title: string
  readonly tagline: string | null
  readonly description: string | null
  readonly themeConfig: StorefrontTheme
  readonly status: StorefrontStatus
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const STOREFRONT_EVENT_TYPES = ['page_view', 'product_view', 'checkout_started'] as const
export type StorefrontEventType = (typeof STOREFRONT_EVENT_TYPES)[number]
export const storefrontEventTypeSchema = z.enum(STOREFRONT_EVENT_TYPES)

export const recordStorefrontEventInputSchema = z.object({
  storefrontId: storefrontIdSchema,
  productId: productIdSchema.optional().nullable(),
  eventType: storefrontEventTypeSchema,
  visitorSessionId: z.string().max(128).optional().nullable(),
  referrer: z.string().max(2000).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type RecordStorefrontEventInput = z.infer<typeof recordStorefrontEventInputSchema>

export type StorefrontEventRecord = {
  readonly id: string
  readonly workspaceId: string
  readonly storefrontId: string
  readonly productId: string | null
  readonly eventType: StorefrontEventType
  readonly visitorSessionId: string | null
  readonly referrer: string | null
  readonly userAgent: string | null
  readonly utmSource: string | null
  readonly utmMedium: string | null
  readonly utmCampaign: string | null
  readonly metadata: Record<string, unknown>
  readonly createdAt: Date
}
