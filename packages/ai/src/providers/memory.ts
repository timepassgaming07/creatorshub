/**
 * Memory AI Provider (Slice 10 §10.4, §10.10).
 *
 * Deterministic offline AI provider for local development, CI builds, and unit test suites.
 * Generates rich, realistic JSON responses matching each registered Zod schema without network requests.
 */
import { ok, type Result } from '@creatorhub/domain'
import type {
  AnalyticsInsightsOutput,
  EmailCampaignOutput,
  ProductCopyOutput,
  SeoMetadataOutput,
  StorefrontCopyOutput,
} from '@creatorhub/contracts'

import type { AiError } from '../errors.js'
import type {
  AiGenerateOptions,
  AiGenerateTextOptions,
  AiProvider,
  AiResponse,
  AiTextResponse,
} from '../types.js'

export class MemoryAiProvider implements AiProvider {
  readonly providerType = 'memory' as const
  readonly defaultModel = 'memory-deterministic-v1'

  async generateStructured<T>(
    options: AiGenerateOptions<T>,
  ): Promise<Result<AiResponse<T>, AiError>> {
    await Promise.resolve()
    const rawData = this.generateSampleDataForPrompt(options.promptId, options.userPrompt)
    const parseResult = options.schema.safeParse(rawData)
    const validData = parseResult.success ? parseResult.data : (rawData as T)

    const rawJson = JSON.stringify(validData, null, 2)
    const promptTokens = Math.max(50, Math.round(options.userPrompt.length / 4))
    const completionTokens = Math.max(50, Math.round(rawJson.length / 4))
    const totalTokens = promptTokens + completionTokens
    // Approximate cost: 50 micro-cents per 1000 tokens
    const costMicroCents = BigInt(Math.round((totalTokens * 50) / 1000))

    return ok({
      data: validData,
      rawJson,
      promptTokens,
      completionTokens,
      totalTokens,
      costMicroCents,
      model: options.modelOverride ?? this.defaultModel,
      provider: this.providerType,
    })
  }

  async generateText(
    options: AiGenerateTextOptions,
  ): Promise<Result<AiTextResponse, AiError>> {
    await Promise.resolve()
    const text = `High quality AI response generated for prompt: ${options.userPrompt.slice(0, 100)}...`
    const promptTokens = Math.max(30, Math.round(options.userPrompt.length / 4))
    const completionTokens = Math.max(30, Math.round(text.length / 4))
    const totalTokens = promptTokens + completionTokens
    const costMicroCents = BigInt(Math.round((totalTokens * 50) / 1000))

    return ok({
      text,
      promptTokens,
      completionTokens,
      totalTokens,
      costMicroCents,
      model: options.modelOverride ?? this.defaultModel,
      provider: this.providerType,
    })
  }

  private generateSampleDataForPrompt(promptId: string, userPrompt: string): unknown {
    if (promptId === 'product_copy_v1') {
      const isDesign = userPrompt.toLowerCase().includes('design') || userPrompt.toLowerCase().includes('figma')
      const isCourse = userPrompt.toLowerCase().includes('course') || userPrompt.toLowerCase().includes('video')

      const title = isDesign
        ? 'Ultimate Design System Pro Kit'
        : isCourse
          ? 'Fullstack Next.js Masterclass & Architecture'
          : 'The Modern Creator Playbook: Complete Digital Growth Kit'

      const sample: ProductCopyOutput = {
        title,
        tagline: 'The battle-tested toolkit designed to help you build, launch, and monetize in record time.',
        descriptionMarkdown: `### Elevate Your Craft with Production-Grade Assets

Stop reinventing the wheel. This comprehensive resource delivers meticulously crafted templates, workflows, and actionable architectures used by industry-leading creators.

#### What's Included:
- **Complete Source Files**: Fully structured, layered, and documented.
- **Step-by-Step Implementation Guide**: Clear, pragmatic walkthroughs from zero to production.
- **Lifetime Updates & Future Revisions**: Continuous improvements and new component drops.
- **Commercial Use License**: Build and ship client and personal projects without restrictions.

*Instant digital access provided immediately upon payment.*`,
        keyBenefits: [
          'Save over 120+ hours of tedious setup and design time',
          'Production-tested architecture adhering to modern standards',
          'Clean, modular, and easy to customize for any brand',
          'Direct access to downloadable resources with 1-click updates',
        ],
        targetAudience: 'Independent creators, developers, designers, and digital entrepreneurs who value craft and velocity.',
        suggestedPriceInr: 2499,
      }
      return sample
    }

    if (promptId === 'storefront_copy_v1') {
      const sample: StorefrontCopyOutput = {
        heroHeadline: 'Premium Tools & Resources for Modern Creators',
        heroSubhead: 'Curated digital products, verified templates, and architectural masterclasses to level up your workflow.',
        badgeText: '★ Creator Hub Verified',
        ctaPrimaryText: 'Explore Products',
        ctaSecondaryText: 'View Best Sellers',
        valueProps: [
          {
            title: 'Instant Delivery',
            description: 'Direct download grants delivered immediately upon successful checkout.',
          },
          {
            title: 'Battle-Tested Quality',
            description: 'Crafted with rigorous engineering, zero fluff, and production polish.',
          },
          {
            title: 'Lifetime Access',
            description: 'Free updates and enhancements included with every digital purchase.',
          },
        ],
      }
      return sample
    }

    if (promptId === 'seo_metadata_v1') {
      const sample: SeoMetadataOutput = {
        seoTitle: 'Premium Creator Store & Digital Templates | Official Store',
        metaDescription: 'Discover verified digital courses, design toolkits, and software templates. Instant download and lifetime access.',
        keywords: ['creator templates', 'digital downloads', 'production code', 'design assets', 'courses'],
        ogTitle: 'Official Creator Store — Premium Digital Resources',
        ogDescription: 'Instant access to verified digital products, templates, and courses crafted for creators and builders.',
      }
      return sample
    }

    if (promptId === 'analytics_insights_v1') {
      const sample: AnalyticsInsightsOutput = {
        executiveSummary: 'Your digital storefront demonstrated strong positive momentum with healthy conversion rates and minimal refund requests.',
        keyDriver: 'High traffic velocity and promoter referral conversions from your top affiliate link.',
        growthActions: [
          'Launch a limited-time coupon discount to convert the remaining 75% of checkout-initiated drop-offs.',
          'Double down on your top-performing product by bundling it with an introductory preset pack.',
          'Recruit 3 additional niche promoters by offering a temporary 500 bps commission boost on your flagship course.',
        ],
        riskAlert: null,
      }
      return sample
    }

    if (promptId === 'email_campaign_v1') {
      const sample: EmailCampaignOutput = {
        subject: '🎉 It is finally here: The Complete Creator Growth Kit',
        previewText: 'Instant access is now live. Here is everything inside...',
        bodyMarkdown: `Hey there,

After weeks of refining, testing, and polishing every single asset, I am thrilled to announce that **The Creator Growth Kit** is officially live!

### Why I built this:
We waste countless hours rebuilding standard components, hunting for reference templates, and fixing avoidable mistakes. This kit eliminates that friction so you can focus on shipping.

**Here is what you get today:**
- 50+ Production Templates
- Full source files and commercial licensing
- Step-by-step video walkthroughs

Click below to claim your copy before the launch discount expires!`,
        callToActionText: 'Get Instant Access Now',
      }
      return sample
    }

    return {}
  }
}
