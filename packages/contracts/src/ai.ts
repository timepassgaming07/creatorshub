/**
 * AI Assistant & Cost Accounting Contracts (Slice 10 §10.4-§10.9).
 *
 * Responsibilities:
 * 1. Versioned prompt identifiers and structured output Zod schemas.
 * 2. Multi-provider configuration and token usage tracking types.
 * 3. Monthly workspace AI token quota structures.
 */
import { z } from 'zod'

export const AI_PROVIDERS = ['memory', 'openai', 'anthropic', 'gemini'] as const
export type AiProviderType = (typeof AI_PROVIDERS)[number]

export const AI_PROMPT_IDS = [
  'product_copy_v1',
  'storefront_copy_v1',
  'seo_metadata_v1',
  'analytics_insights_v1',
  'email_campaign_v1',
] as const
export type AiPromptId = (typeof AI_PROMPT_IDS)[number]

// ---------------------------------------------------------------------------
// Structured Output Zod Schemas
// ---------------------------------------------------------------------------

export const productCopyOutputSchema = z.object({
  title: z.string().min(3).max(120),
  tagline: z.string().min(5).max(180),
  descriptionMarkdown: z.string().min(20).max(4000),
  keyBenefits: z.array(z.string().min(5).max(200)).min(2).max(8),
  targetAudience: z.string().min(5).max(300),
  suggestedPriceInr: z.number().int().positive().optional(),
})
export type ProductCopyOutput = z.infer<typeof productCopyOutputSchema>

export const storefrontCopyOutputSchema = z.object({
  heroHeadline: z.string().min(5).max(100),
  heroSubhead: z.string().min(10).max(250),
  badgeText: z.string().min(2).max(40),
  ctaPrimaryText: z.string().min(2).max(30),
  ctaSecondaryText: z.string().min(2).max(30),
  valueProps: z
    .array(
      z.object({
        title: z.string().min(3).max(60),
        description: z.string().min(10).max(180),
      }),
    )
    .min(2)
    .max(4),
})
export type StorefrontCopyOutput = z.infer<typeof storefrontCopyOutputSchema>

export const seoMetadataOutputSchema = z.object({
  seoTitle: z.string().min(10).max(65),
  metaDescription: z.string().min(30).max(160),
  keywords: z.array(z.string().min(2).max(40)).min(3).max(10),
  ogTitle: z.string().min(10).max(70),
  ogDescription: z.string().min(30).max(200),
})
export type SeoMetadataOutput = z.infer<typeof seoMetadataOutputSchema>

export const analyticsInsightsOutputSchema = z.object({
  executiveSummary: z.string().min(20).max(500),
  keyDriver: z.string().min(10).max(200),
  growthActions: z.array(z.string().min(10).max(250)).min(2).max(5),
  riskAlert: z.string().max(300).nullable(),
})
export type AnalyticsInsightsOutput = z.infer<typeof analyticsInsightsOutputSchema>

export const emailCampaignOutputSchema = z.object({
  subject: z.string().min(5).max(100),
  previewText: z.string().min(10).max(150),
  bodyMarkdown: z.string().min(30).max(3000),
  callToActionText: z.string().min(2).max(30),
})
export type EmailCampaignOutput = z.infer<typeof emailCampaignOutputSchema>

// ---------------------------------------------------------------------------
// Usage & Cost DTOs
// ---------------------------------------------------------------------------

export type AiUsageRecordDTO = {
  readonly id: string
  readonly workspaceId: string
  readonly userId: string
  readonly promptId: AiPromptId
  readonly promptVersion: string
  readonly provider: string
  readonly model: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly costMicroCents: string
  readonly status: 'success' | 'failed' | 'rejected_quota'
  readonly createdAt: string
}

export type AiUsageSummaryDTO = {
  readonly workspaceId: string
  readonly billingMonth: string // YYYY-MM
  readonly totalGenerations: number
  readonly totalTokens: number
  readonly monthlyQuotaTokens: number
  readonly quotaRemainingTokens: number
  readonly isQuotaExceeded: boolean
}
