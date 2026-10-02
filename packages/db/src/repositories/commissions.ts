/**
 * Commissions & Clawbacks Repository (Slice 9 §9.1, §9.4, §9.5, §9.8).
 *
 * Responsibilities:
 * 1. Commission CRUD, state transitions, and hold lifecycle.
 * 2. Automated batch vesting of mature held commissions.
 * 3. Pro-rated refund clawbacks with affiliate lifetime balance adjustments.
 * 4. Ledger-derived financial breakdown reporting for creators and promoters.
 */
import {
  type AffiliateId,
  type AffiliateLedgerBreakdown,
  type AttributionId,
  type ClawbackId,
  type CommissionId,
  type CommissionStatus,
  type CreateClawbackInput,
  type CreateCommissionInput,
  type OrderId,
} from '@creatorhub/contracts'
import { and, desc, eq, lte, sql } from 'drizzle-orm'

import {
  affiliates,
  commissionClawbacks,
  commissions,
  type CommissionClawbackRow,
  type CommissionRow,
} from '../schema/index.js'
import { insertValues, scoped, type RepositoryScope } from '../repository.js'

export type CommissionFilter = {
  readonly affiliateId?: string
  readonly orderId?: string
  readonly status?: CommissionStatus
}

/**
 * Creates an initial commission record in 'held' state.
 */
export async function createCommission(
  scope: RepositoryScope,
  input: CreateCommissionInput,
): Promise<CommissionRow> {
  const [created] = await scope.tx
    .insert(commissions)
    .values(
      insertValues<typeof commissions.$inferInsert>(scope, {
        attributionId: input.attributionId,
        affiliateId: input.affiliateId,
        orderId: input.orderId,
        grossSaleAmount: input.grossSaleAmount,
        commissionBps: input.commissionBps,
        grossAmount: input.grossAmount,
        netAmount: input.grossAmount,
        status: 'held',
        heldUntil: input.heldUntil,
        currency: input.currency,
      }),
    )
    .returning()

  if (!created) {
    throw new Error('Failed to create commission record.')
  }

  return created
}

/**
 * Finds a commission by ID.
 */
export async function findCommissionById(
  scope: RepositoryScope,
  id: CommissionId,
): Promise<CommissionRow | null> {
  const [row] = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, eq(commissions.id, id)))
    .limit(1)

  return row ?? null
}

/**
 * Finds a commission by Attribution ID.
 */
export async function findCommissionByAttributionId(
  scope: RepositoryScope,
  attributionId: AttributionId,
): Promise<CommissionRow | null> {
  const [row] = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, eq(commissions.attributionId, attributionId)))
    .limit(1)

  return row ?? null
}

/**
 * Finds a commission by Order ID.
 */
export async function findCommissionByOrderId(
  scope: RepositoryScope,
  orderId: OrderId,
): Promise<CommissionRow | null> {
  const [row] = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, eq(commissions.orderId, orderId)))
    .limit(1)

  return row ?? null
}

/**
 * Lists commissions for a promoter.
 */
export async function listCommissionsForAffiliate(
  scope: RepositoryScope,
  affiliateId: AffiliateId,
  status?: CommissionStatus,
): Promise<CommissionRow[]> {
  const conditions = [eq(commissions.affiliateId, affiliateId)]
  if (status) {
    conditions.push(eq(commissions.status, status))
  }

  return scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, ...conditions))
    .orderBy(desc(commissions.createdAt))
}

/**
 * Lists all workspace commissions matching filter criteria.
 */
export async function listWorkspaceCommissions(
  scope: RepositoryScope,
  filter: CommissionFilter = {},
): Promise<{ items: CommissionRow[]; total: number }> {
  const conditions = []
  if (filter.affiliateId) {
    conditions.push(eq(commissions.affiliateId, filter.affiliateId))
  }
  if (filter.orderId) {
    conditions.push(eq(commissions.orderId, filter.orderId))
  }
  if (filter.status) {
    conditions.push(eq(commissions.status, filter.status))
  }

  const items = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, ...conditions))
    .orderBy(desc(commissions.createdAt))

  const countResult = await scope.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(commissions)
    .where(scoped(scope, commissions, ...conditions))

  return {
    items,
    total: countResult[0]?.count ?? 0,
  }
}

/**
 * Batch vesting operation: releases mature held commissions whose hold period has elapsed.
 */
export async function releaseHeldCommissions(
  scope: RepositoryScope,
  asOfDate: Date = new Date(),
): Promise<{ vestedCount: number; vestedAmountMinor: bigint }> {
  const eligible = await scope.tx
    .select()
    .from(commissions)
    .where(
      scoped(
        scope,
        commissions,
        eq(commissions.status, 'held'),
        lte(commissions.heldUntil, asOfDate),
      ),
    )

  if (eligible.length === 0) {
    return { vestedCount: 0, vestedAmountMinor: 0n }
  }

  let vestedAmount = 0n
  for (const comm of eligible) {
    vestedAmount += comm.netAmount
    await scope.tx
      .update(commissions)
      .set({
        status: 'vested',
        vestedAt: asOfDate,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(scoped(scope, commissions, eq(commissions.id, comm.id)))
  }

  return {
    vestedCount: eligible.length,
    vestedAmountMinor: vestedAmount,
  }
}

/**
 * Applies a full or partial refund clawback to a commission.
 */
export async function applyClawback(
  scope: RepositoryScope,
  input: CreateClawbackInput,
): Promise<{
  clawback: CommissionClawbackRow
  updatedCommission: CommissionRow
}> {
  const [existing] = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, eq(commissions.id, input.commissionId)))
    .limit(1)

  if (!existing) {
    throw new Error(`Commission ${input.commissionId} not found.`)
  }

  if (existing.status === 'clawed_back' || existing.netAmount <= 0n) {
    throw new Error('This commission has already been fully reversed.')
  }

  const grossCommission = existing.grossAmount
  const netCommission = existing.netAmount
  const orderSubtotal = existing.grossSaleAmount
  const refundAmount = input.amount

  let clawbackAmountMinor = 0n
  if (refundAmount >= orderSubtotal) {
    clawbackAmountMinor = netCommission
  } else if (orderSubtotal > 0n) {
    const proRated = (refundAmount * grossCommission) / orderSubtotal
    clawbackAmountMinor = proRated > 0n ? proRated : 1n
    if (clawbackAmountMinor > netCommission) {
      clawbackAmountMinor = netCommission
    }
  }

  if (clawbackAmountMinor <= 0n) {
    throw new Error('Calculated clawback amount must be positive.')
  }

  const nextNetAmountMinor = netCommission - clawbackAmountMinor
  const nextStatus = nextNetAmountMinor === 0n ? 'clawed_back' : existing.status
  const clawbackStatus =
    existing.status === 'paid' ? 'uncollectable' : (input.status ?? 'applied')

  // 1. Insert clawback record
  const [clawback] = await scope.tx
    .insert(commissionClawbacks)
    .values(
      insertValues<typeof commissionClawbacks.$inferInsert>(scope, {
        commissionId: existing.id,
        refundId: input.refundId,
        amount: clawbackAmountMinor,
        status: clawbackStatus,
        reason: input.reason,
      }),
    )
    .returning()

  if (!clawback) {
    throw new Error('Failed to record commission clawback.')
  }

  // 2. Update commission status & net amount
  const [updatedCommission] = await scope.tx
    .update(commissions)
    .set({
      netAmount: nextNetAmountMinor,
      status: nextStatus,
      clawedBackAt: nextStatus === 'clawed_back' ? sql`clock_timestamp()` : undefined,
      clawbackReason: input.reason,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(scoped(scope, commissions, eq(commissions.id, existing.id)))
    .returning()

  if (!updatedCommission) {
    throw new Error('Failed to update commission after clawback.')
  }

  // 3. Deduct from affiliate total earnings
  await scope.tx
    .update(affiliates)
    .set({
      totalEarnings: sql`GREATEST(0, ${affiliates.totalEarnings} - ${clawbackAmountMinor})`,
      updatedAt: sql`clock_timestamp()`,
    })
    .where(scoped(scope, affiliates, eq(affiliates.id, existing.affiliateId)))

  return { clawback, updatedCommission }
}

/**
 * Derives real-time financial balance breakdown for a promoter.
 */
export async function getAffiliateLedgerBreakdown(
  scope: RepositoryScope,
  affiliateId: AffiliateId,
): Promise<AffiliateLedgerBreakdown> {
  const comms = await scope.tx
    .select()
    .from(commissions)
    .where(scoped(scope, commissions, eq(commissions.affiliateId, affiliateId)))

  let heldMinor = 0n
  let vestedMinor = 0n
  let paidMinor = 0n
  let clawedBackMinor = 0n
  let totalEarnedMinor = 0n

  for (const c of comms) {
    if (c.status === 'held') {
      heldMinor += c.netAmount
      totalEarnedMinor += c.netAmount
    } else if (c.status === 'vested') {
      vestedMinor += c.netAmount
      totalEarnedMinor += c.netAmount
    } else if (c.status === 'paid') {
      paidMinor += c.grossAmount
      totalEarnedMinor += c.grossAmount
    }
  }

  // Aggregate clawbacks
  const clawbacks = await scope.tx
    .select({ total: sql<string>`COALESCE(SUM(${commissionClawbacks.amount}), 0)::text` })
    .from(commissionClawbacks)
    .innerJoin(commissions, eq(commissionClawbacks.commissionId, commissions.id))
    .where(
      scoped(
        scope,
        commissionClawbacks,
        eq(commissions.affiliateId, affiliateId),
      ),
    )

  clawedBackMinor = BigInt(clawbacks[0]?.total ?? '0')

  return {
    pendingMinor: 0n,
    heldMinor,
    vestedMinor,
    paidMinor,
    clawedBackMinor,
    totalEarnedMinor,
  }
}
