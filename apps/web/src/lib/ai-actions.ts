/**
 * AI copilot server actions: product copy, storefront copy, SEO metadata, and
 * a plain-language read of the store's analytics.
 *
 * Each runs in three steps so the model call never holds a database
 * transaction open: authorise and check the monthly quota, call the model,
 * then record usage and the audit entry.
 */
'use server'

import {
  analyticsInsightsPrompt,
  productCopyPrompt,
  seoMetadataPrompt,
  storefrontCopyPrompt,
  type AnalyticsInsightsInput,
  type ProductCopyInput,
  type PromptTemplate,
  type SeoMetadataInput,
  type StorefrontCopyInput,
} from '@creatorhub/ai'
import {
  ANALYTICS_TIMEFRAMES,
  type AiUsageSummaryDTO,
  type AnalyticsInsightsOutput,
  type AnalyticsTimeframe,
  type ProductCopyOutput,
  type SeoMetadataOutput,
  type StorefrontCopyOutput,
} from '@creatorhub/contracts'
import { aiUsageRepo, analytics, auditLog, type RepositoryScope } from '@creatorhub/db'

import { getAiGateway } from './ai'
import { auditOptions } from './env'
import { formatAmount } from './format'
import {
  ActionFailure,
  authoriseMember,
  inWorkspace,
  memberAction,
  runAction,
} from './member-action'

export type AiActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'QUOTA_EXCEEDED' | 'ERROR'
        readonly message: string
      }
    }

/** Inputs come from a form; anything this large is not product copy. */
const MAX_INPUT_CHARS = 6000

async function generate<I, O>(
  label: string,
  rawWorkspaceId: string,
  prompt: PromptTemplate<I, O>,
  buildInput: (scope: RepositoryScope) => Promise<I>,
): Promise<AiActionResult<O>> {
  const result = await runAction(label, async () => {
    const gateway = getAiGateway()
    if (!gateway) throw new ActionFailure('The AI copilot is not switched on for this store.')
    const member = await authoriseMember(rawWorkspaceId, 'ai.generate')

    // 1. Quota and inputs, in one short transaction.
    const prepared = await inWorkspace(member, async (scope) => {
      const usage = await aiUsageRepo.getMonthlyUsageSummary(scope)
      if (usage.isQuotaExceeded) return { quota: true as const }
      return { quota: false as const, input: await buildInput(scope) }
    })
    if (prepared.quota) return { quota: true as const }
    if (JSON.stringify(prepared.input).length > MAX_INPUT_CHARS) {
      throw new ActionFailure(
        'That is more text than the copilot works with. Shorten the details and try again.',
      )
    }

    // 2. The model call, outside any transaction.
    const response = await gateway.generateStructured({
      promptId: prompt.id,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.buildUserPrompt(prepared.input),
      schema: prompt.schema,
      maxTokens: prompt.maxTokens,
    })
    if (!response.ok) throw new ActionFailure(response.error.message)

    // 3. Usage and audit.
    await inWorkspace(member, async (scope) => {
      await aiUsageRepo.recordUsage(scope, {
        userId: member.actorId as never,
        promptId: prompt.id,
        promptVersion: prompt.version,
        provider: response.value.provider,
        model: response.value.model,
        promptTokens: response.value.promptTokens,
        completionTokens: response.value.completionTokens,
        totalTokens: response.value.totalTokens,
        costMicroCents: response.value.costMicroCents,
        status: 'success',
      })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'ai.generated',
        targetType: 'workspace',
        targetId: scope.context.workspaceId,
        metadata: {
          promptId: prompt.id,
          tokens: response.value.totalTokens,
          model: response.value.model,
        },
      })
    })
    return { quota: false as const, data: response.value.data }
  })

  if (!result.ok) return { ok: false, error: { code: 'ERROR', message: result.error } }
  if (result.data.quota) {
    return {
      ok: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'This workspace has used its AI allowance for the month. It resets on the 1st.',
      },
    }
  }
  return { ok: true, data: result.data.data }
}

export async function generateProductCopyAction(
  workspaceIdRaw: string,
  input: ProductCopyInput,
): Promise<AiActionResult<ProductCopyOutput>> {
  return generate('ai.product_copy', workspaceIdRaw, productCopyPrompt, () =>
    Promise.resolve(input),
  )
}

export async function generateStorefrontCopyAction(
  workspaceIdRaw: string,
  input: StorefrontCopyInput,
): Promise<AiActionResult<StorefrontCopyOutput>> {
  return generate('ai.storefront_copy', workspaceIdRaw, storefrontCopyPrompt, () =>
    Promise.resolve(input),
  )
}

export async function generateSeoMetadataAction(
  workspaceIdRaw: string,
  input: SeoMetadataInput,
): Promise<AiActionResult<SeoMetadataOutput>> {
  return generate('ai.seo', workspaceIdRaw, seoMetadataPrompt, () => Promise.resolve(input))
}

export async function generateAnalyticsInsightsAction(
  workspaceIdRaw: string,
  timeframeRaw = '30d',
): Promise<AiActionResult<AnalyticsInsightsOutput>> {
  const timeframe: AnalyticsTimeframe =
    ANALYTICS_TIMEFRAMES.find((t) => t === timeframeRaw) ?? '30d'
  return generate('ai.insights', workspaceIdRaw, analyticsInsightsPrompt, async (scope) => {
    const [summary, products, affiliatePerf] = await Promise.all([
      analytics.getWorkspaceAnalyticsSummary(scope, { timeframe }),
      analytics.listProductPerformance(scope, { timeframe }),
      analytics.listAffiliatePerformance(scope, { timeframe }),
    ])
    const topProduct = products.find((p) => p.unitsSold > 0)?.productTitle
    const topAffiliate = affiliatePerf.find((a) => a.conversionsCount > 0)
    const input: AnalyticsInsightsInput = {
      timeframe,
      grossRevenue: formatAmount(summary.grossRevenueMinor, summary.currency),
      netRevenue: formatAmount(summary.netRevenueMinor, summary.currency),
      totalOrders: summary.ordersCount,
      conversionRateBps: summary.conversionRateBps,
      refundRateBps: summary.refundRateBps,
      uniqueVisitors: summary.uniqueVisitorsCount,
      ...(topProduct ? { topProduct } : {}),
      ...(topAffiliate ? { topAffiliate: topAffiliate.name ?? topAffiliate.email } : {}),
    }
    return input
  })
}

export async function getAiUsageSummaryAction(
  workspaceIdRaw: string,
): Promise<AiActionResult<AiUsageSummaryDTO>> {
  const result = await memberAction('ai.usage', workspaceIdRaw, 'analytics.view', (scope) =>
    aiUsageRepo.getMonthlyUsageSummary(scope),
  )
  return result.ok
    ? { ok: true, data: result.data }
    : { ok: false, error: { code: 'ERROR', message: result.error } }
}
