/**
 * Versioned Prompt Registry (Slice 10 §10.4, §10.7, §10.8, §10.9).
 *
 * Responsibilities:
 * 1. Maintain deterministic, versioned system and user prompt templates.
 * 2. Associate each prompt with its typed Zod schema for structured output.
 * 3. Enforce temperature and token limits per task.
 */
import {
  analyticsInsightsOutputSchema,
  emailCampaignOutputSchema,
  productCopyOutputSchema,
  seoMetadataOutputSchema,
  storefrontCopyOutputSchema,
  type AiPromptId,
  type AnalyticsInsightsOutput,
  type EmailCampaignOutput,
  type ProductCopyOutput,
  type SeoMetadataOutput,
  type StorefrontCopyOutput,
} from '@creatorhub/contracts'
import type { ZodType } from 'zod'

/** An omitted or blank field reads as the fallback, so the prompt never says "undefined". */
function orDefault(value: string | undefined, fallback: string): string {
  return value?.trim() ? value : fallback
}

export type PromptTemplate<TInput, TOutput> = {
  readonly id: AiPromptId
  readonly version: string
  readonly description: string
  readonly systemPrompt: string
  readonly buildUserPrompt: (input: TInput) => string
  readonly schema: ZodType<TOutput>
  readonly defaultTemperature: number
  readonly maxTokens: number
}

// ---------------------------------------------------------------------------
// 1. Product Copywriting Template
// ---------------------------------------------------------------------------

export type ProductCopyInput = {
  readonly title?: string
  readonly category?: string
  readonly keyPoints?: string
  readonly targetAudience?: string
  readonly tone?: 'persuasive' | 'educational' | 'minimalist' | 'bold'
}

export const productCopyPrompt: PromptTemplate<ProductCopyInput, ProductCopyOutput> = {
  id: 'product_copy_v1',
  version: '1.0.0',
  description:
    'Generates title, compelling tagline, rich markdown description, and key benefits for a digital product.',
  systemPrompt: `You are an elite digital commerce copywriter specializing in creator products (e-books, video courses, design kits, Lightroom presets, 3D assets, software templates).
Your goal is to write high-converting, honest, and exciting product copy that clearly communicates value and inspires buyers to purchase immediately.
Always format descriptions with clean markdown (bullet points, bold highlights, concise paragraphs).`,
  buildUserPrompt: (input: ProductCopyInput) => {
    return `Generate product copy for the following digital product:
- Working Title / Idea: ${orDefault(input.title, 'Untitled Digital Product')}
- Product Category: ${orDefault(input.category, 'Digital Asset / Download')}
- Key Topics / Materials: ${orDefault(input.keyPoints, 'Comprehensive resources, templates, and actionable guides.')}
- Target Audience: ${orDefault(input.targetAudience, 'Creators, designers, entrepreneurs, and digital professionals.')}
- Desired Tone: ${orDefault(input.tone, 'persuasive')}

Respond with valid JSON matching the schema with title, tagline, descriptionMarkdown, keyBenefits, targetAudience, and suggestedPriceInr.`
  },
  schema: productCopyOutputSchema,
  defaultTemperature: 0.7,
  maxTokens: 1500,
}

// ---------------------------------------------------------------------------
// 2. Storefront Copy Template
// ---------------------------------------------------------------------------

export type StorefrontCopyInput = {
  readonly creatorName: string
  readonly brandNiche: string
  readonly mainProductFocus?: string
  readonly tone?: string
}

export const storefrontCopyPrompt: PromptTemplate<StorefrontCopyInput, StorefrontCopyOutput> = {
  id: 'storefront_copy_v1',
  version: '1.0.0',
  description:
    'Generates hero headline, subhead, badges, and value propositions for the creator storefront.',
  systemPrompt: `You are a world-class storefront branding specialist creating memorable hero headlines, crisp subheadings, and high-converting value propositions for creator digital storefronts.
Keep headlines under 8 words, punchy, and confident. Value propositions must highlight instant access, high quality, and verified expertise.`,
  buildUserPrompt: (input: StorefrontCopyInput) => {
    return `Generate storefront branding copy for:
- Creator Name: ${input.creatorName}
- Brand Niche / Domain: ${input.brandNiche}
- Main Product Focus: ${orDefault(input.mainProductFocus, 'Digital templates, courses, and premium assets')}
- Brand Tone: ${orDefault(input.tone, 'modern and premium')}

Respond with valid JSON matching the schema.`
  },
  schema: storefrontCopyOutputSchema,
  defaultTemperature: 0.7,
  maxTokens: 1000,
}

// ---------------------------------------------------------------------------
// 3. SEO Metadata Template
// ---------------------------------------------------------------------------

export type SeoMetadataInput = {
  readonly pageType: 'storefront_home' | 'product_detail' | 'course_page'
  readonly pageTitle: string
  readonly descriptionSummary: string
  readonly primaryKeywords?: string
}

export const seoMetadataPrompt: PromptTemplate<SeoMetadataInput, SeoMetadataOutput> = {
  id: 'seo_metadata_v1',
  version: '1.0.0',
  description:
    'Generates Google-optimized title tags, meta descriptions, and OpenGraph social cards.',
  systemPrompt: `You are a technical SEO specialist optimizing metadata for digital products and creator storefronts.
Enforce strict character lengths:
- SEO Title: 45 to 60 characters max.
- Meta Description: 120 to 155 characters max.
- Include the primary keyword near the beginning of the title.`,
  buildUserPrompt: (input: SeoMetadataInput) => {
    return `Generate SEO and social metadata for:
- Page Type: ${input.pageType}
- Title / Name: ${input.pageTitle}
- Summary: ${input.descriptionSummary}
- Focus Keywords: ${orDefault(input.primaryKeywords, 'creator templates, digital downloads, premium guides')}

Respond with valid JSON matching the schema.`
  },
  schema: seoMetadataOutputSchema,
  defaultTemperature: 0.4,
  maxTokens: 600,
}

// ---------------------------------------------------------------------------
// 4. Analytics Business Insights Template
// ---------------------------------------------------------------------------

export type AnalyticsInsightsInput = {
  readonly timeframe: string
  readonly grossRevenue: string
  readonly netRevenue: string
  readonly totalOrders: number
  readonly conversionRateBps: number
  readonly refundRateBps: number
  readonly uniqueVisitors: number
  readonly topProduct?: string
  readonly topAffiliate?: string
}

export const analyticsInsightsPrompt: PromptTemplate<
  AnalyticsInsightsInput,
  AnalyticsInsightsOutput
> = {
  id: 'analytics_insights_v1',
  version: '1.0.0',
  description:
    'Analyzes financial and telemetry metrics to provide actionable executive growth insights in plain language.',
  systemPrompt: `You are an executive e-commerce growth analyst for creator businesses.
You translate raw financial ledger numbers and visitor telemetry into an inspiring, honest, and actionable briefing.
Provide 1 clear executive summary, the single most important growth driver, 3 concrete high-impact growth actions, and a risk alert if refund/drop-off is concerning (or null if healthy).`,
  buildUserPrompt: (input: AnalyticsInsightsInput) => {
    const refundPercent = (input.refundRateBps / 100).toFixed(2)
    const convPercent = (input.conversionRateBps / 100).toFixed(2)
    return `Analyze the following creator business metrics for the period (${input.timeframe}):
- Gross Sales: ${input.grossRevenue}
- Net Revenue: ${input.netRevenue}
- Total Orders: ${String(input.totalOrders)}
- Unique Visitors: ${String(input.uniqueVisitors)}
- Storefront Conversion Rate: ${convPercent}% (${String(input.conversionRateBps)} bps)
- Refund Rate: ${refundPercent}% (${String(input.refundRateBps)} bps)
- Top Product: ${orDefault(input.topProduct, 'N/A')}
- Top Promoter / Affiliate: ${orDefault(input.topAffiliate, 'N/A')}

Respond with valid JSON matching the schema with executiveSummary, keyDriver, growthActions, and riskAlert.`
  },
  schema: analyticsInsightsOutputSchema,
  defaultTemperature: 0.5,
  maxTokens: 1200,
}

// ---------------------------------------------------------------------------
// 5. Email Campaign Announcement Template
// ---------------------------------------------------------------------------

export type EmailCampaignInput = {
  readonly creatorName: string
  readonly productTitle: string
  readonly offerGoal: string
  readonly discountPercentage?: number
  readonly deadlineText?: string
}

export const emailCampaignPrompt: PromptTemplate<EmailCampaignInput, EmailCampaignOutput> = {
  id: 'email_campaign_v1',
  version: '1.0.0',
  description:
    'Generates promotional email campaign copy for new product launches or limited-time discounts.',
  systemPrompt: `You are a direct-response email marketing expert writing engaging, authentic newsletters and launch emails for creators.
Use a conversational, personal tone with high-CTR subject lines and clear, single-minded call to actions.`,
  buildUserPrompt: (input: EmailCampaignInput) => {
    return `Generate a promotional email campaign for:
- Creator Name: ${input.creatorName}
- Product Title: ${input.productTitle}
- Offer Goal / Hook: ${input.offerGoal}
- Discount: ${input.discountPercentage ? `${String(input.discountPercentage)}% off` : 'Standard launch price'}
- Deadline / Urgency: ${orDefault(input.deadlineText, 'Available immediately')}

Respond with valid JSON matching the schema with subject, previewText, bodyMarkdown, and callToActionText.`
  },
  schema: emailCampaignOutputSchema,
  defaultTemperature: 0.7,
  maxTokens: 1500,
}
