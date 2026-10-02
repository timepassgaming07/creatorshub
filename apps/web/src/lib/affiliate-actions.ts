/**
 * Creator Affiliate Programme Server Actions (Slice 8 §8.8, §8.9).
 *
 * Responsibilities:
 * 1. RBAC authorization for `affiliate.view` and `affiliate.manage`.
 * 2. Settings lifecycle, custom commission rates, and referral link generation.
 * 3. Public promoter portal data fetching and visitor click recording.
 * 4. Tenant-scoped CSV data exports with audit logging.
 */
'use server'

import { createHash } from 'node:crypto'
import {
  affiliateId as toAffiliateId,
  createAffiliateLinkSchema,
  createAffiliateSchema,
  requestId as toRequestId,
  updateAffiliateProgramSchema,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type CreateAffiliateInput,
  type CreateAffiliateLinkInput,
  type UpdateAffiliateProgramInput,
  type WorkspaceId,
} from '@creatorhub/contracts'
import {
  affiliates,
  auditLog,
  commissions,
  workspaceMembers,
  type AffiliateFilter,
  type AffiliateProgramRow,
  type AffiliateRow,
} from '@creatorhub/db'
import { authorise, type Membership } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

export type AffiliateActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

export type AffiliateDTO = {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly status: string
  readonly customCommissionBps: number | null
  readonly totalEarnings: string
  readonly totalConversions: number
  readonly joinedAt: string
}

export type AffiliateProgramDTO = {
  readonly id: string
  readonly isActive: boolean
  readonly defaultCommissionBps: number
  readonly cookieWindowDays: number
  readonly allowSelfReferral: boolean
  readonly autoApproveAffiliates: boolean
}

export type AffiliateSummaryDTO = {
  readonly totalAffiliates: number
  readonly activeAffiliatesCount: number
  readonly totalReferredRevenueMinor: string
  readonly totalCommissionAccruedMinor: string
  readonly totalConversionsCount: number
}

/**
 * Gets affiliate program settings and aggregated summary.
 */
export async function getAffiliateProgramAction(
  rawWorkspaceId: string,
): Promise<AffiliateActionResult<{ program: AffiliateProgramDTO | null; summary: AffiliateSummaryDTO }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-get-aff-prog-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.view',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to view affiliate program.' } }
    }

    const program = await affiliates.getAffiliateProgram(scope)
    const summary = await affiliates.getAffiliateProgramSummary(scope)

    const programDTO: AffiliateProgramDTO | null = program
      ? {
          id: program.id,
          isActive: program.isActive,
          defaultCommissionBps: program.defaultCommissionBps,
          cookieWindowDays: program.cookieWindowDays,
          allowSelfReferral: program.allowSelfReferral,
          autoApproveAffiliates: program.autoApproveAffiliates,
        }
      : null

    return {
      ok: true,
      data: {
        program: programDTO,
        summary: {
          totalAffiliates: summary.totalAffiliates,
          activeAffiliatesCount: summary.activeAffiliatesCount,
          totalReferredRevenueMinor: summary.totalReferredRevenueMinor.toString(),
          totalCommissionAccruedMinor: summary.totalCommissionAccruedMinor.toString(),
          totalConversionsCount: summary.totalConversionsCount,
        },
      },
    }
  })
}

/**
 * Updates affiliate program settings.
 */
export async function updateAffiliateProgramAction(
  rawWorkspaceId: string,
  rawInput: UpdateAffiliateProgramInput,
): Promise<AffiliateActionResult<AffiliateProgramDTO>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-update-aff-prog-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.manage',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to manage affiliate program.' } }
    }

    const parsed = updateAffiliateProgramSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input.' } }
    }

    const updated = await affiliates.upsertAffiliateProgram(scope, parsed.data)

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'affiliate_program.updated',
      targetType: 'affiliate_program',
      targetId: updated.id,
      actorType: 'user',
      actorId,
      metadata: {
        isActive: updated.isActive,
        defaultCommissionBps: updated.defaultCommissionBps,
        cookieWindowDays: updated.cookieWindowDays,
        allowSelfReferral: updated.allowSelfReferral,
        autoApproveAffiliates: updated.autoApproveAffiliates,
      },
    })

    return {
      ok: true,
      data: {
        id: updated.id,
        isActive: updated.isActive,
        defaultCommissionBps: updated.defaultCommissionBps,
        cookieWindowDays: updated.cookieWindowDays,
        allowSelfReferral: updated.allowSelfReferral,
        autoApproveAffiliates: updated.autoApproveAffiliates,
      },
    }
  })
}

/**
 * Lists promoters with search, status filtering, and pagination.
 */
export async function listAffiliatesAction(
  rawWorkspaceId: string,
  filter: {
    readonly status?: string | undefined
    readonly query?: string | undefined
    readonly limit?: number | undefined
    readonly offset?: number | undefined
  } = {},
): Promise<AffiliateActionResult<{ items: readonly AffiliateDTO[]; total: number }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-list-aff-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.view',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to view affiliates.' } }
    }

    const items = await affiliates.listAffiliates(scope, filter)
    const total = await affiliates.countAffiliates(scope, filter)

    const formatted: AffiliateDTO[] = items.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      status: a.status,
      customCommissionBps: a.customCommissionBps,
      totalEarnings: a.totalEarnings.toString(),
      totalConversions: a.totalConversions,
      joinedAt: a.joinedAt.toISOString(),
    }))

    return { ok: true, data: { items: formatted, total } }
  })
}

/**
 * Updates affiliate status (approved, suspended, rejected).
 */
export async function updateAffiliateStatusAction(
  rawWorkspaceId: string,
  affiliateId: string,
  status: 'approved' | 'suspended' | 'rejected',
): Promise<AffiliateActionResult<AffiliateDTO>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-update-aff-status-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.manage',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to manage affiliates.' } }
    }

    const updated = await affiliates.updateAffiliateStatus(scope, affiliateId, status)
    if (!updated) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Affiliate not found.' } }
    }

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'affiliate.status_updated',
      targetType: 'affiliate',
      targetId: affiliateId,
      actorType: 'user',
      actorId,
      metadata: { newStatus: status },
    })

    return {
      ok: true,
      data: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        status: updated.status,
        customCommissionBps: updated.customCommissionBps,
        totalEarnings: updated.totalEarnings.toString(),
        totalConversions: updated.totalConversions,
        joinedAt: updated.joinedAt.toISOString(),
      },
    }
  })
}

/**
 * Creates an affiliate referral link.
 */
export async function createAffiliateLinkAction(
  rawWorkspaceId: string,
  rawInput: CreateAffiliateLinkInput,
): Promise<AffiliateActionResult<{ id: string; code: string; clicksCount: number; conversionsCount: number }>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-create-aff-link-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.manage',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to create referral links.' } }
    }

    const parsed = createAffiliateLinkSchema.safeParse(rawInput)
    if (!parsed.success) {
      return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid link input.' } }
    }

    const existing = await affiliates.findAffiliateLinkByCode(scope, parsed.data.code)
    if (existing) {
      return { ok: false, error: { code: 'ERROR', message: `Referral code "${parsed.data.code}" is already taken.` } }
    }

    const link = await affiliates.createAffiliateLink(scope, parsed.data)

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'affiliate_link.created',
      targetType: 'affiliate_link',
      targetId: link.id,
      actorType: 'user',
      actorId,
      metadata: { code: link.code, affiliateId: link.affiliateId },
    })

    return {
      ok: true,
      data: {
        id: link.id,
        code: link.code,
        clicksCount: link.clicksCount,
        conversionsCount: link.conversionsCount,
      },
    }
  })
}

/**
 * Public portal loader: Fetches statistics for a promoter by their referral code.
 */
export async function getAffiliatePortalDataAction(
  code: string,
  rawWorkspaceId?: string,
): Promise<
  AffiliateActionResult<{
    workspaceId: string
    affiliate: { name: string | null; email: string; status: string; totalEarnings: string; totalConversions: number }
    link: { code: string; clicksCount: number; conversionsCount: number; destinationUrl: string | null }
    financialBreakdown: {
      held: string
      vested: string
      paid: string
      clawedBack: string
      totalEarned: string
    }
    commissions: readonly {
      id: string
      orderId: string
      grossSaleAmount: string
      commissionBps: number
      grossAmount: string
      netAmount: string
      status: string
      heldUntil: string
      currency: string
      createdAt: string
    }[]
    attributions: readonly { id: string; commissionAmount: string; status: string; attributedAt: string }[]
  }>
> {
  const db = getDatabase()
  let wsId: WorkspaceId

  if (rawWorkspaceId) {
    wsId = toWorkspaceId(rawWorkspaceId)
  } else {
    const resolved = await db.resolveAffiliateLinkByCode(code)
    if (!resolved) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Referral link not found.' } }
    }
    wsId = resolved.workspaceId
  }

  const reqId = toRequestId(`req-portal-${code}-${Date.now()}`)
  const context = workspaceContext({
    workspaceId: wsId,
    actorId: toUserId(wsId), // Public unauthenticated visitor scope
    requestId: reqId,
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const link = await affiliates.findAffiliateLinkByCode(scope, code)
    if (!link) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Referral link not found.' } }
    }

    const aff = await affiliates.findAffiliateById(scope, link.affiliateId)
    if (!aff) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Affiliate profile not found.' } }
    }

    const [recentAttributions, breakdown, affiliateCommissions] = await Promise.all([
      affiliates.listAttributionsForAffiliate(scope, toAffiliateId(aff.id)),
      commissions.getAffiliateLedgerBreakdown(scope, toAffiliateId(aff.id)),
      commissions.listCommissionsForAffiliate(scope, toAffiliateId(aff.id)),
    ])

    return {
      ok: true,
      data: {
        workspaceId: wsId,
        affiliate: {
          name: aff.name,
          email: aff.email,
          status: aff.status,
          totalEarnings: aff.totalEarnings.toString(),
          totalConversions: aff.totalConversions,
        },
        link: {
          code: link.code,
          clicksCount: link.clicksCount,
          conversionsCount: link.conversionsCount,
          destinationUrl: link.destinationUrl,
        },
        financialBreakdown: {
          held: breakdown.heldMinor.toString(),
          vested: breakdown.vestedMinor.toString(),
          paid: breakdown.paidMinor.toString(),
          clawedBack: breakdown.clawedBackMinor.toString(),
          totalEarned: breakdown.totalEarnedMinor.toString(),
        },
        commissions: affiliateCommissions.map((c) => ({
          id: c.id,
          orderId: c.orderId,
          grossSaleAmount: c.grossSaleAmount.toString(),
          commissionBps: c.commissionBps,
          grossAmount: c.grossAmount.toString(),
          netAmount: c.netAmount.toString(),
          status: c.status,
          heldUntil: c.heldUntil.toISOString(),
          currency: c.currency,
          createdAt: c.createdAt.toISOString(),
        })),
        attributions: recentAttributions.slice(0, 20).map((a) => ({
          id: a.id,
          commissionAmount: a.commissionAmount.toString(),
          status: a.status,
          attributedAt: a.attributedAt.toISOString(),
        })),
      },
    }
  })
}

/**
 * Public action: Records a visitor click on an affiliate referral code.
 */
export async function recordAffiliateClickAction(
  code: string,
  metadata: {
    visitorToken: string
    ip?: string
    userAgent?: string
    referer?: string
    isBot?: boolean
  },
  rawWorkspaceId?: string,
): Promise<AffiliateActionResult<{ recorded: boolean }>> {
  const db = getDatabase()
  let wsId: WorkspaceId

  if (rawWorkspaceId) {
    wsId = toWorkspaceId(rawWorkspaceId)
  } else {
    const resolved = await db.resolveAffiliateLinkByCode(code)
    if (!resolved) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Invalid referral code.' } }
    }
    wsId = resolved.workspaceId
  }

  const reqId = toRequestId(`req-click-${code}-${Date.now()}`)
  const context = workspaceContext({
    workspaceId: wsId,
    actorId: toUserId(wsId),
    requestId: reqId,
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const link = await affiliates.findAffiliateLinkByCode(scope, code)
    if (!link) {
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Invalid referral code.' } }
    }

    const rawIp = metadata.ip ?? '127.0.0.1'
    const ipHash = createHash('sha256').update(`${rawIp}:${AUDIT_SALT}`).digest('hex')

    await affiliates.recordAffiliateClick(scope, {
      affiliateLinkId: link.id,
      affiliateId: link.affiliateId,
      visitorToken: metadata.visitorToken,
      ipHash,
      userAgent: metadata.userAgent,
      referer: metadata.referer,
      isBot: metadata.isBot ?? false,
    })

    return { ok: true, data: { recorded: true } }
  })
}

/**
 * Generates sanitized CSV export for affiliates.
 */
export async function exportAffiliatesCsvAction(
  rawWorkspaceId: string,
): Promise<AffiliateActionResult<string>> {
  const session = await getServerSession()
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.' } }
  }

  const wsId = toWorkspaceId(rawWorkspaceId)
  const actorId = toUserId(session.user.id)
  const reqId = toRequestId(`req-export-aff-${Date.now()}`)
  const context = workspaceContext({ workspaceId: wsId, actorId, requestId: reqId })
  const db = getDatabase()

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace.' } }
    }

    const authCheck = authorise(
      { userId: actorId, workspaceId: wsId, role: member.role } as Membership,
      wsId,
      'affiliate.view',
    )
    if (!authCheck.ok) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Permission denied to export affiliates.' } }
    }

    const items = await affiliates.listAffiliates(scope, { limit: 1000 })

    const headers = [
      'Affiliate ID',
      'Email',
      'Name',
      'Status',
      'Custom Commission Bps',
      'Total Earnings (INR)',
      'Total Conversions',
      'Joined Date',
    ]

    const rows = items.map((a) => {
      const earningsInr = (Number(a.totalEarnings) / 100).toFixed(2)
      return [
        `"${a.id}"`,
        `"${a.email.replace(/"/g, '""')}"`,
        `"${(a.name ?? '').replace(/"/g, '""')}"`,
        `"${a.status}"`,
        `"${a.customCommissionBps ?? 'Default'}"`,
        `"${earningsInr}"`,
        `"${a.totalConversions}"`,
        `"${a.joinedAt.toISOString()}"`,
      ].join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'affiliates.exported_csv',
      targetType: 'workspace',
      targetId: wsId,
      actorType: 'user',
      actorId,
      metadata: { rowCount: items.length },
    })

    return { ok: true, data: csvContent }
  })
}
