/**
 * Analytics & Business Intelligence Server Actions (Slice 10 §10.1, §10.2, §10.3).
 *
 * Responsibilities:
 * 1. RBAC authorization for `analytics.view`.
 * 2. Serve ledger-derived financial summaries and conversion funnels.
 * 3. Product and affiliate performance matrix data.
 * 4. Sanitized CSV export for external reporting.
 */
'use server'

import {
  analyticsTimeframeSchema,
  requestId as toRequestId,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type AffiliatePerformanceDTO,
  type AnalyticsSummaryDTO,
  type AnalyticsTimeframe,
  type ProductPerformanceDTO,
} from '@creatorhub/contracts'
import {
  analytics,
  auditLog,
  workspaceMembers,
} from '@creatorhub/db'
import { authorise, type Membership } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { auditOptions } from './env'


export type AnalyticsActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

/**
 * Retrieves the comprehensive analytics and funnel summary for a workspace.
 */
export async function getWorkspaceAnalyticsAction(
  workspaceIdRaw: string,
  timeframeRaw: string = '30d',
): Promise<AnalyticsActionResult<AnalyticsSummaryDTO>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to view analytics.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)
    const tfParsed = analyticsTimeframeSchema.safeParse(timeframeRaw)
    const timeframe: AnalyticsTimeframe = tfParsed.success ? tfParsed.data : '30d'

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-analytics-${Date.now()}`),
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
        'analytics.view',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to view workspace analytics.' },
        }
      }

      const summary = await analytics.getWorkspaceAnalyticsSummary(scope, { timeframe })
      return { ok: true, data: summary }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to retrieve analytics summary.',
      },
    }
  }
}

/**
 * Retrieves product-level sales, revenue, and conversion performance.
 */
export async function getProductPerformanceAction(
  workspaceIdRaw: string,
  timeframeRaw: string = '30d',
): Promise<AnalyticsActionResult<readonly ProductPerformanceDTO[]>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to view analytics.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)
    const tfParsed = analyticsTimeframeSchema.safeParse(timeframeRaw)
    const timeframe: AnalyticsTimeframe = tfParsed.success ? tfParsed.data : '30d'

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-prod-perf-${Date.now()}`),
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
        'analytics.view',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to view analytics.' },
        }
      }

      const productsList = await analytics.listProductPerformance(scope, { timeframe })
      return { ok: true, data: productsList }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to retrieve product performance.',
      },
    }
  }
}

/**
 * Retrieves affiliate promoter conversion and commission performance.
 */
export async function getAffiliatePerformanceAction(
  workspaceIdRaw: string,
  timeframeRaw: string = '30d',
): Promise<AnalyticsActionResult<readonly AffiliatePerformanceDTO[]>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to view analytics.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)
    const tfParsed = analyticsTimeframeSchema.safeParse(timeframeRaw)
    const timeframe: AnalyticsTimeframe = tfParsed.success ? tfParsed.data : '30d'

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-aff-perf-${Date.now()}`),
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
        'analytics.view',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to view analytics.' },
        }
      }

      const affiliatesList = await analytics.listAffiliatePerformance(scope, { timeframe })
      return { ok: true, data: affiliatesList }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to retrieve affiliate performance.',
      },
    }
  }
}

/**
 * Generates a sanitized CSV export of time-series analytics.
 */
export async function exportAnalyticsCsvAction(
  workspaceIdRaw: string,
  timeframeRaw: string = '30d',
): Promise<AnalyticsActionResult<{ readonly csv: string; readonly filename: string }>> {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'You must be signed in to export analytics.' },
      }
    }

    const wsId = toWorkspaceId(workspaceIdRaw)
    const usrId = toUserId(session.user.id)
    const tfParsed = analyticsTimeframeSchema.safeParse(timeframeRaw)
    const timeframe: AnalyticsTimeframe = tfParsed.success ? tfParsed.data : '30d'

    const db = await getDatabase()
    const ctx = workspaceContext({
      workspaceId: wsId,
      actorId: usrId,
      requestId: toRequestId(`req-export-analytics-${Date.now()}`),
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
        'analytics.view',
      )
      if (!authRes.ok) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', message: 'You lack permission to export analytics.' },
        }
      }

      const summary = await analytics.getWorkspaceAnalyticsSummary(scope, { timeframe })

      const headers = ['Date', 'Gross Revenue (INR)', 'Net Revenue (INR)', 'Orders Count', 'Visitors Count']
      const rows = summary.timeSeries.map((d) => [
        d.date,
        (Number(d.grossRevenueMinor) / 100).toFixed(2),
        (Number(d.netRevenueMinor) / 100).toFixed(2),
        d.ordersCount.toString(),
        d.visitorsCount.toString(),
      ])

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const filename = `analytics-${workspaceIdRaw}-${timeframe}-${new Date().toISOString().split('T')[0]}.csv`

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: usrId,
        action: 'analytics.exported',
        targetType: 'workspace',
        targetId: wsId,
        metadata: { timeframe, rowCount: rows.length },
      })

      return {
        ok: true,
        data: { csv: csvContent, filename },
      }
    })
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: err instanceof Error ? err.message : 'Failed to export analytics CSV.',
      },
    }
  }
}
