/**
 * Commission, Holds & Clawback Server Actions (Slice 9 §9.8).
 *
 * Responsibilities:
 * 1. Enforce RBAC permissions (`affiliate.view` and `affiliate.manage`).
 * 2. Manage commission lifecycle, hold tracking, and batch vesting releases.
 * 3. Process full and pro-rated refund clawbacks.
 * 4. Serve ledger-derived financial balance views for creators and promoters.
 */
'use server'

import {
  affiliateId as toAffiliateId,
  commissionId as toCommissionId,
  createClawbackSchema,
  refundId as toRefundId,
  requestId as toRequestId,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type AffiliateLedgerBreakdown,
  type CommissionDTO,
  type CreateClawbackInput,
} from '@creatorhub/contracts'
import {
  auditLog,
  commissions,
  workspaceMembers,
  type CommissionFilter,
  type CommissionRow,
} from '@creatorhub/db'
import { authorise, type Membership } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { auditOptions } from './env'


export type CommissionActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

function mapCommissionDTO(c: CommissionRow): CommissionDTO {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    attributionId: c.attributionId,
    affiliateId: c.affiliateId,
    orderId: c.orderId,
    grossSaleAmount: c.grossSaleAmount.toString(),
    commissionBps: c.commissionBps,
    grossAmount: c.grossAmount.toString(),
    netAmount: c.netAmount.toString(),
    status: c.status as any,
    heldUntil: c.heldUntil.toISOString(),
    vestedAt: c.vestedAt ? c.vestedAt.toISOString() : null,
    paidAt: c.paidAt ? c.paidAt.toISOString() : null,
    clawedBackAt: c.clawedBackAt ? c.clawedBackAt.toISOString() : null,
    clawbackReason: c.clawbackReason,
    currency: c.currency,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

/**
 * Lists commissions for creator workspace.
 */
export async function listCommissionsAction(
  rawWorkspaceId: string,
  filter?: CommissionFilter,
): Promise<CommissionActionResult<{ items: CommissionDTO[]; total: number }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const usrId = toUserId(session.user.id)
  const reqId = toRequestId(`req-comm-list-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId: usrId, requestId: reqId })
  const db = getDatabase()

  try {
    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: 'Not a member.' } }
      }

      const membership: Membership = { userId: usrId, role: member.role, workspaceId: wsId }
      const auth = authorise(membership, wsId, 'affiliate.view')
      if (!auth.ok) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: auth.error.detail } }
      }

      const res = await commissions.listWorkspaceCommissions(scope, filter as any)
      return {
        ok: true as const,
        data: {
          items: res.items.map(mapCommissionDTO),
          total: res.total,
        },
      }
    })

    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to list commissions.'
    return { ok: false, error: { code: 'ERROR', message: msg } }
  }
}

/**
 * Derives financial balance breakdown (held, vested, paid, clawed back) for an affiliate.
 */
export async function getAffiliateFinancialBreakdownAction(
  rawWorkspaceId: string,
  rawAffiliateId: string,
): Promise<
  CommissionActionResult<{
    held: string
    vested: string
    paid: string
    clawedBack: string
    totalEarned: string
  }>
> {
  const wsId = toWorkspaceId(rawWorkspaceId)
  const affId = toAffiliateId(rawAffiliateId)
  const reqId = toRequestId(`req-comm-breakdown-${Date.now()}`)
  const context = workspaceContext({
    workspaceId: wsId,
    requestId: reqId,
  })
  const db = getDatabase()

  try {
    const breakdown = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      return commissions.getAffiliateLedgerBreakdown(scope, affId)
    })

    return {
      ok: true,
      data: {
        held: breakdown.heldMinor.toString(),
        vested: breakdown.vestedMinor.toString(),
        paid: breakdown.paidMinor.toString(),
        clawedBack: breakdown.clawedBackMinor.toString(),
        totalEarned: breakdown.totalEarnedMinor.toString(),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to get financial breakdown.'
    return { ok: false, error: { code: 'ERROR', message: msg } }
  }
}

/**
 * Triggers batch vesting release for mature held commissions.
 */
export async function releaseVestedCommissionsAction(
  rawWorkspaceId: string,
): Promise<CommissionActionResult<{ vestedCount: number; vestedAmount: string }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const usrId = toUserId(session.user.id)
  const reqId = toRequestId(`req-comm-vest-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId: usrId, requestId: reqId })
  const db = getDatabase()

  try {
    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: 'Not a member.' } }
      }

      const membership: Membership = { userId: usrId, role: member.role, workspaceId: wsId }
      const auth = authorise(membership, wsId, 'affiliate.manage')
      if (!auth.ok) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: auth.error.detail } }
      }

      const res = await commissions.releaseHeldCommissions(scope, new Date())

      if (res.vestedCount > 0) {
        await auditLog.writeAuditLog(scope, auditOptions, {
          action: 'affiliate.commissions_vested',
          targetType: 'commission',
          targetId: wsId,
          actorType: 'user',
          actorId: usrId,
          metadata: {
            vestedCount: res.vestedCount,
            vestedAmount: res.vestedAmountMinor.toString(),
          },
        })
      }

      return {
        ok: true as const,
        data: {
          vestedCount: res.vestedCount,
          vestedAmount: res.vestedAmountMinor.toString(),
        },
      }
    })

    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to release vested commissions.'
    return { ok: false, error: { code: 'ERROR', message: msg } }
  }
}

/**
 * Applies a manual or refund clawback to a commission.
 */
export async function applyClawbackAction(
  rawWorkspaceId: string,
  rawInput: {
    readonly commissionId: string
    readonly refundId: string
    readonly amount: string
    readonly reason: string
  },
): Promise<CommissionActionResult<{ clawbackId: string; updatedStatus: string }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const usrId = toUserId(session.user.id)
  const reqId = toRequestId(`req-comm-clawback-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId: usrId, requestId: reqId })
  const db = getDatabase()

  try {
    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const member = await workspaceMembers.findMemberByUserId(scope, usrId)
      if (!member) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: 'Not a member.' } }
      }

      const membership: Membership = { userId: usrId, role: member.role, workspaceId: wsId }
      const auth = authorise(membership, wsId, 'affiliate.manage')
      if (!auth.ok) {
        return { ok: false as const, error: { code: 'FORBIDDEN' as const, message: auth.error.detail } }
      }

      const parseResult = createClawbackSchema.safeParse({
        commissionId: rawInput.commissionId,
        refundId: rawInput.refundId,
        amount: BigInt(rawInput.amount),
        reason: rawInput.reason,
      })

      if (!parseResult.success) {
        return {
          ok: false as const,
          error: {
            code: 'ERROR' as const,
            message: parseResult.error.issues[0]?.message ?? 'Invalid clawback input.',
          },
        }
      }

      const { clawback, updatedCommission } = await commissions.applyClawback(
        scope,
        parseResult.data as CreateClawbackInput,
      )

      await auditLog.writeAuditLog(scope, auditOptions, {
        action: 'affiliate.commission_clawed_back',
        targetType: 'commission',
        targetId: updatedCommission.id,
        actorType: 'user',
        actorId: usrId,
        metadata: {
          clawbackId: clawback.id,
          amount: clawback.amount.toString(),
          reason: rawInput.reason,
          nextStatus: updatedCommission.status,
        },
      })

      return {
        ok: true as const,
        data: {
          clawbackId: clawback.id,
          updatedStatus: updatedCommission.status,
        },
      }
    })

    return result
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to apply clawback.'
    return { ok: false, error: { code: 'ERROR', message: msg } }
  }
}
