/**
 * Unit & Offline Eval Test Suite for @creatorhub/ai Gateway (Slice 10 §10.4, §10.10).
 */
import { describe, expect, it } from 'vitest'
import {
  analyticsInsightsPrompt,
  createAiGateway,
  emailCampaignPrompt,
  productCopyPrompt,
  seoMetadataPrompt,
  storefrontCopyPrompt,
} from './index.js'

describe('AI Gateway & Structured Generation (Slice 10)', () => {
  const gateway = createAiGateway({ provider: 'memory' })

  it('generates high quality structured product copy matching Zod schema', async () => {
    const userPrompt = productCopyPrompt.buildUserPrompt({
      title: 'Fullstack Next.js Masterclass',
      category: 'Video Course & Templates',
      targetAudience: 'Software Engineers and Indie Hackers',
      tone: 'bold',
    })

    const res = await gateway.generateStructured({
      promptId: productCopyPrompt.id,
      systemPrompt: productCopyPrompt.systemPrompt,
      userPrompt,
      schema: productCopyPrompt.schema,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.data.title).toBeDefined()
    expect(res.value.data.tagline.length).toBeGreaterThan(10)
    expect(res.value.data.descriptionMarkdown).toContain('###')
    expect(res.value.data.keyBenefits.length).toBeGreaterThanOrEqual(2)
    expect(res.value.promptTokens).toBeGreaterThan(0)
    expect(res.value.completionTokens).toBeGreaterThan(0)
    expect(res.value.totalTokens).toBe(res.value.promptTokens + res.value.completionTokens)
    expect(res.value.costMicroCents).toBeGreaterThan(0n)
  })

  it('generates storefront branding copy matching Zod schema', async () => {
    const userPrompt = storefrontCopyPrompt.buildUserPrompt({
      creatorName: 'Arjun Verma',
      brandNiche: 'Fullstack Systems & Design',
    })

    const res = await gateway.generateStructured({
      promptId: storefrontCopyPrompt.id,
      systemPrompt: storefrontCopyPrompt.systemPrompt,
      userPrompt,
      schema: storefrontCopyPrompt.schema,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.data.heroHeadline).toBeDefined()
    expect(res.value.data.valueProps.length).toBeGreaterThanOrEqual(2)
    expect(res.value.data.badgeText).toBeDefined()
  })

  it('generates SEO metadata with length limits', async () => {
    const userPrompt = seoMetadataPrompt.buildUserPrompt({
      pageType: 'product_detail',
      pageTitle: 'Ultimate UI Kit',
      descriptionSummary: 'A collection of 200+ accessible components for React.',
    })

    const res = await gateway.generateStructured({
      promptId: seoMetadataPrompt.id,
      systemPrompt: seoMetadataPrompt.systemPrompt,
      userPrompt,
      schema: seoMetadataPrompt.schema,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.data.seoTitle.length).toBeLessThanOrEqual(65)
    expect(res.value.data.metaDescription.length).toBeLessThanOrEqual(160)
    expect(res.value.data.keywords.length).toBeGreaterThanOrEqual(3)
  })

  it('generates executive analytics business insights', async () => {
    const userPrompt = analyticsInsightsPrompt.buildUserPrompt({
      timeframe: 'Last 30 Days',
      grossRevenue: '₹2,50,000',
      netRevenue: '₹2,35,000',
      totalOrders: 95,
      conversionRateBps: 420,
      refundRateBps: 150,
      uniqueVisitors: 2260,
      topProduct: 'Next.js Boilerplate',
      topAffiliate: 'CodeWithAlex',
    })

    const res = await gateway.generateStructured({
      promptId: analyticsInsightsPrompt.id,
      systemPrompt: analyticsInsightsPrompt.systemPrompt,
      userPrompt,
      schema: analyticsInsightsPrompt.schema,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.data.executiveSummary).toBeDefined()
    expect(res.value.data.keyDriver).toBeDefined()
    expect(res.value.data.growthActions.length).toBeGreaterThanOrEqual(2)
  })

  it('generates launch email campaigns', async () => {
    const userPrompt = emailCampaignPrompt.buildUserPrompt({
      creatorName: 'Sarah Jenkins',
      productTitle: 'Procreate Brush Toolkit',
      offerGoal: 'Launch announcement with 20% early bird discount',
      discountPercentage: 20,
    })

    const res = await gateway.generateStructured({
      promptId: emailCampaignPrompt.id,
      systemPrompt: emailCampaignPrompt.systemPrompt,
      userPrompt,
      schema: emailCampaignPrompt.schema,
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.value.data.subject).toBeDefined()
    expect(res.value.data.bodyMarkdown).toBeDefined()
    expect(res.value.data.callToActionText).toBeDefined()
  })

  it('generates raw text responses', async () => {
    const res = await gateway.generateText({
      systemPrompt: 'You are an assistant',
      userPrompt: 'Suggest 3 course topic ideas',
    })

    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.text).toBeDefined()
  })
})
