/**
 * AI Usage & Cost Accounting Repository (Slice 10 §10.6).
 *
 * Responsibilities:
 * 1. Record AI generation tokens, models, and micro-cent costs.
 * 2. Aggregate monthly token usage against workspace quotas.
 * 3. Multi-tenant RLS query scoping via RepositoryScope.
 */
import { and, desc, gte, lt, sql } from 'drizzle-orm'
import type {
  AiPromptId,
  AiUsageRecordDTO,
  AiUsageSummaryDTO,
  UserId,
} from '@creatorhub/contracts'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import { aiUsage, type AiUsageRow } from '../schema/ai.js'

export type RecordAiUsageInput = {
  readonly userId: UserId
  readonly promptId: AiPromptId
  readonly promptVersion?: string
  readonly provider: string
  readonly model: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly costMicroCents: bigint
  readonly status?: 'success' | 'failed' | 'rejected_quota'
}

/**
 * Records an AI usage event.
 */
export async function recordUsage(
  scope: RepositoryScope,
  input: RecordAiUsageInput,
): Promise<AiUsageRecordDTO> {
  const [row] = await scope.tx
    .insert(aiUsage)
    .values(
      insertValues(scope, {
        userId: input.userId,
        promptId: input.promptId,
        promptVersion: input.promptVersion ?? '1.0.0',
        provider: input.provider,
        model: input.model,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        costMicroCents: input.costMicroCents,
        status: input.status ?? 'success',
      }),
    )
    .returning()

  if (!row) {
    throw new Error('Failed to record AI usage')
  }

  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    promptId: row.promptId as AiPromptId,
    promptVersion: row.promptVersion,
    provider: row.provider,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    costMicroCents: row.costMicroCents.toString(),
    status: row.status as 'success' | 'failed' | 'rejected_quota',
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Aggregates monthly token usage for a workspace.
 */
export async function getMonthlyUsageSummary(
  scope: RepositoryScope,
  options: {
    readonly billingMonth?: string // YYYY-MM
    readonly monthlyQuotaTokens?: number
  } = {},
): Promise<AiUsageSummaryDTO> {
  const now = new Date()
  const currentMonth = `${String(now.getUTCFullYear())}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const billingMonth = options.billingMonth ?? currentMonth

  const [yearStr, monthStr] = billingMonth.split('-')
  const year = yearStr ? parseInt(yearStr, 10) : now.getUTCFullYear()
  const month = monthStr ? parseInt(monthStr, 10) : now.getUTCMonth() + 1

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const startOfNextMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))

  const [result] = await scope.tx
    .select({
      totalGenerations: sql<number>`count(*)::int`,
      totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(
      scoped(
        scope,
        aiUsage,
        and(
          gte(aiUsage.createdAt, startOfMonth),
          lt(aiUsage.createdAt, startOfNextMonth),
        ),
      ),
    )

  const totalGenerations = result?.totalGenerations ?? 0
  const totalTokens = result?.totalTokens ?? 0
  const monthlyQuotaTokens = options.monthlyQuotaTokens ?? 250_000
  const quotaRemainingTokens = Math.max(0, monthlyQuotaTokens - totalTokens)
  const isQuotaExceeded = totalTokens >= monthlyQuotaTokens

  return {
    workspaceId: scope.context.workspaceId,
    billingMonth,
    totalGenerations,
    totalTokens,
    monthlyQuotaTokens,
    quotaRemainingTokens,
    isQuotaExceeded,
  }
}

/**
 * Lists recent AI generation records for auditing.
 */
export async function listRecentUsage(
  scope: RepositoryScope,
  limit = 20,
): Promise<readonly AiUsageRecordDTO[]> {
  const rows: AiUsageRow[] = await scope.tx
    .select()
    .from(aiUsage)
    .where(scoped(scope, aiUsage))
    .orderBy(desc(aiUsage.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    userId: r.userId,
    promptId: r.promptId as AiPromptId,
    promptVersion: r.promptVersion,
    provider: r.provider,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    costMicroCents: r.costMicroCents.toString(),
    status: r.status as 'success' | 'failed' | 'rejected_quota',
    createdAt: r.createdAt.toISOString(),
  }))
}
