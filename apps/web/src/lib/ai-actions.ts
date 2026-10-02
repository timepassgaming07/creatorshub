/**
 * AI Generation & Copilot Server Actions (Slice 10 §10.4, §10.6, §10.7, §10.8, §10.9).
 *
 * Responsibilities:
 * 1. Enforce RBAC permissions (`ai.generate`).
 * 2. Enforce monthly token quotas per workspace.
 * 3. Invoke versioned prompt templates via AiGateway.
 * 4. Record token usage and micro-cent cost accounting in `ai_usage`.
 * 5. Write audit logs for administrative tracking.
 */
'use server'

import {
  analyticsInsightsPrompt,
  createAiGateway,
  emailCampaignPrompt,
  productCopyPrompt,
  seoMetadataPrompt,
  storefrontCopyPrompt,
  type AnalyticsInsightsInput,
  type EmailCampaignInput,
  type ProductCopyInput,
  type SeoMetadataInput,
  type StorefrontCopyInput,
} from '@creatorhub/ai'
import {
  requestId as toRequestId,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type AiUsageSummaryDTO,
  type AnalyticsInsightsOutput,
  type EmailCampaignOutput,
  type ProductCopyOutput,
  type SeoMetadataOutput,
  type StorefrontCopyOutput,
} from '@creatorhub/contracts'
import {
  aiUsageRepo,
  analytics,
  auditLog,
  workspaceMembers,
} from '@creatorhub/db'
import { authorise, type Membership } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

export type AiActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'QUOTA_EXCEEDED' | 'ERROR'
        readonly message: string
      }
    }

/**
 * Generates product title, description, and key benefits.
 */
export async function generateProductCopyAction(
  workspaceIdRaw: string,
  input: ProductCopyInput,
): Promise<AiActionResult<ProductCopyOutput>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to use AI generation.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-ai-prod-${Date.now()}`),
    })

    return await db.withWorkspace(ctx, async (tx) => {
      const scope = { tx, context: ctx }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workspace membership not found.' },
        }
      }

      const authRes = authorise(
        { userId: usrId, workspaceId: wsId, role: member.role } as Membership,
        wsId,
        'ai.generate',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to perform AI generation.' },
        }
      }

      // Check workspace monthly quota
      const usageSummary = await aiUsageRepo.getMonthlyUsageSummary(scope)
      if (usageSummary.isQuotaExceeded) {
        return {
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Your workspace has reached its monthly AI token generation limit (250,000 tokens).',
          },
        }
      }

      // Run AI generation via Gateway
      const gateway = createAiGateway()
      const userPrompt = productCopyPrompt.buildUserPrompt(input)
      const aiRes = await gateway.generateStructured({
        promptId: productCopyPrompt.id,
        systemPrompt: productCopyPrompt.systemPrompt,
        userPrompt,
        schema: productCopyPrompt.schema,
      })

      if (!aiRes.ok) {
        return {
          ok: false,
          error: { code: 'ERROR', message: aiRes.error.message },
        }
      }

      // Record token usage & cost
      await aiUsageRepo.recordUsage(scope, {
        userId: usrId,
        promptId: productCopyPrompt.id,
        promptVersion: productCopyPrompt.version,
        provider: aiRes.value.provider,
        model: aiRes.value.model,
        promptTokens: aiRes.value.promptTokens,
        completionTokens: aiRes.value.completionTokens,
        totalTokens: aiRes.value.totalTokens,
        costMicroCents: aiRes.value.costMicroCents,
        status: 'success',
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: usrId,
        action: 'ai.generated',
        targetType: 'workspace',
        targetId: wsId,
        metadata: {
          promptId: productCopyPrompt.id,
          tokens: aiRes.value.totalTokens,
        },
      })

      return { ok: true, data: aiRes.value.data }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to generate product copy.',
      },
    }
  }
}

/**
 * Generates storefront headline, subhead, and value propositions.
 */
export async function generateStorefrontCopyAction(
  workspaceIdRaw: string,
  input: StorefrontCopyInput,
): Promise<AiActionResult<StorefrontCopyOutput>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to use AI generation.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-ai-store-${Date.now()}`),
    })

    return await db.withWorkspace(ctx, async (tx) => {
      const scope = { tx, context: ctx }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workspace membership not found.' },
        }
      }

      const authRes = authorise(
        { userId: usrId, workspaceId: wsId, role: member.role } as Membership,
        wsId,
        'ai.generate',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to perform AI generation.' },
        }
      }

      const usageSummary = await aiUsageRepo.getMonthlyUsageSummary(scope)
      if (usageSummary.isQuotaExceeded) {
        return {
          ok: false,
          error: { code: 'QUOTA_EXCEEDED', message: 'Monthly AI token quota exceeded.' },
        }
      }

      const gateway = createAiGateway()
      const userPrompt = storefrontCopyPrompt.buildUserPrompt(input)
      const aiRes = await gateway.generateStructured({
        promptId: storefrontCopyPrompt.id,
        systemPrompt: storefrontCopyPrompt.systemPrompt,
        userPrompt,
        schema: storefrontCopyPrompt.schema,
      })

      if (!aiRes.ok) {
        return {
          ok: false,
          error: { code: 'ERROR', message: aiRes.error.message },
        }
      }

      await aiUsageRepo.recordUsage(scope, {
        userId: usrId,
        promptId: storefrontCopyPrompt.id,
        promptVersion: storefrontCopyPrompt.version,
        provider: aiRes.value.provider,
        model: aiRes.value.model,
        promptTokens: aiRes.value.promptTokens,
        completionTokens: aiRes.value.completionTokens,
        totalTokens: aiRes.value.totalTokens,
        costMicroCents: aiRes.value.costMicroCents,
        status: 'success',
      })

      return { ok: true, data: aiRes.value.data }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to generate storefront copy.',
      },
    }
  }
}

/**
 * Generates SEO title, description, keywords, and OpenGraph tags.
 */
export async function generateSeoMetadataAction(
  workspaceIdRaw: string,
  input: SeoMetadataInput,
): Promise<AiActionResult<SeoMetadataOutput>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to use AI generation.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-ai-seo-${Date.now()}`),
    })

    return await db.withWorkspace(ctx, async (tx) => {
      const scope = { tx, context: ctx }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workspace membership not found.' },
        }
      }

      const authRes = authorise(
        { userId: usrId, workspaceId: wsId, role: member.role } as Membership,
        wsId,
        'ai.generate',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to perform AI generation.' },
        }
      }

      const usageSummary = await aiUsageRepo.getMonthlyUsageSummary(scope)
      if (usageSummary.isQuotaExceeded) {
        return {
          ok: false,
          error: { code: 'QUOTA_EXCEEDED', message: 'Monthly AI token quota exceeded.' },
        }
      }

      const gateway = createAiGateway()
      const userPrompt = seoMetadataPrompt.buildUserPrompt(input)
      const aiRes = await gateway.generateStructured({
        promptId: seoMetadataPrompt.id,
        systemPrompt: seoMetadataPrompt.systemPrompt,
        userPrompt,
        schema: seoMetadataPrompt.schema,
      })

      if (!aiRes.ok) {
        return {
          ok: false,
          error: { code: 'ERROR', message: aiRes.error.message },
        }
      }

      await aiUsageRepo.recordUsage(scope, {
        userId: usrId,
        promptId: seoMetadataPrompt.id,
        promptVersion: seoMetadataPrompt.version,
        provider: aiRes.value.provider,
        model: aiRes.value.model,
        promptTokens: aiRes.value.promptTokens,
        completionTokens: aiRes.value.completionTokens,
        totalTokens: aiRes.value.totalTokens,
        costMicroCents: aiRes.value.costMicroCents,
        status: 'success',
      })

      return { ok: true, data: aiRes.value.data }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to generate SEO metadata.',
      },
    }
  }
}

/**
 * Generates an executive plain-language growth briefing from raw ledger analytics.
 */
export async function generateAnalyticsInsightsAction(
  workspaceIdRaw: string,
  timeframeRaw: string = '30d',
): Promise<AiActionResult<AnalyticsInsightsOutput>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to use AI generation.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-ai-insights-${Date.now()}`),
    })

    return await db.withWorkspace(ctx, async (tx) => {
      const scope = { tx, context: ctx }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workspace membership not found.' },
        }
      }

      const authRes = authorise(
        { userId: usrId, workspaceId: wsId, role: member.role } as Membership,
        wsId,
        'ai.generate',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to perform AI generation.' },
        }
      }

      const usageSummary = await aiUsageRepo.getMonthlyUsageSummary(scope)
      if (usageSummary.isQuotaExceeded) {
        return {
          ok: false,
          error: { code: 'QUOTA_EXCEEDED', message: 'Monthly AI token quota exceeded.' },
        }
      }

      // Fetch analytics summary from the ledger
      const analyticsSummary = await analytics.getWorkspaceAnalyticsSummary(scope, {
        timeframe: timeframeRaw as any,
      })

      const topProducts = await analytics.listProductPerformance(scope, {
        timeframe: timeframeRaw as any,
      })
      const topAffiliates = await analytics.listAffiliatePerformance(scope, {
        timeframe: timeframeRaw as any,
      })

      const topProd = topProducts[0]?.productTitle
      const topAff = topAffiliates[0]?.name ?? topAffiliates[0]?.email

      const input: AnalyticsInsightsInput = {
        timeframe: timeframeRaw,
        grossRevenue: `₹${(Number(analyticsSummary.grossRevenueMinor) / 100).toFixed(2)}`,
        netRevenue: `₹${(Number(analyticsSummary.netRevenueMinor) / 100).toFixed(2)}`,
        totalOrders: analyticsSummary.ordersCount,
        conversionRateBps: analyticsSummary.conversionRateBps,
        refundRateBps: analyticsSummary.refundRateBps,
        uniqueVisitors: analyticsSummary.uniqueVisitorsCount,
        ...(topProd ? { topProduct: topProd } : {}),
        ...(topAff ? { topAffiliate: topAff } : {}),
      }

      const gateway = createAiGateway()
      const userPrompt = analyticsInsightsPrompt.buildUserPrompt(input)
      const aiRes = await gateway.generateStructured({
        promptId: analyticsInsightsPrompt.id,
        systemPrompt: analyticsInsightsPrompt.systemPrompt,
        userPrompt,
        schema: analyticsInsightsPrompt.schema,
      })

      if (!aiRes.ok) {
        return {
          ok: false,
          error: { code: 'ERROR', message: aiRes.error.message },
        }
      }

      await aiUsageRepo.recordUsage(scope, {
        userId: usrId,
        promptId: analyticsInsightsPrompt.id,
        promptVersion: analyticsInsightsPrompt.version,
        provider: aiRes.value.provider,
        model: aiRes.value.model,
        promptTokens: aiRes.value.promptTokens,
        completionTokens: aiRes.value.completionTokens,
        totalTokens: aiRes.value.totalTokens,
        costMicroCents: aiRes.value.costMicroCents,
        status: 'success',
      })

      return { ok: true, data: aiRes.value.data }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to generate analytics insights.',
      },
    }
  }
}

/**
 * Returns current monthly token usage and quota metrics for a workspace.
 */
export async function getAiUsageSummaryAction(
  workspaceIdRaw: string,
): Promise<AiActionResult<AiUsageSummaryDTO>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to view AI quota.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-ai-usage-${Date.now()}`),
    })

    return await db.withWorkspace(ctx, async (tx) => {
      const scope = { tx, context: ctx }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Workspace membership not found.' },
        }
      }

      const usage = await aiUsageRepo.getMonthlyUsageSummary(scope)
      return { ok: true, data: usage }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to retrieve AI usage summary.',
      },
    }
  }
}
