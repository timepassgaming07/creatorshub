/**
 * Refunds Repository — Tenant-scoped refund persistence and retrieval (Slice 5 §5.10).
 *
 * Responsibilities:
 * 1. Record full and partial refunds bound to workspace and order.
 * 2. Retrieve refunds by ID, provider refund ID, and order.
 * 3. Enforce multi-tenancy isolation on all queries and mutations.
 * 4. Aggregate total refunded amount per order.
 */
import type { OrderId, PaymentId, RefundId, RefundStatus, UserId } from '@creatorhub/contracts'
import { and, desc, eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import { type NewRefundRecord, type RefundRecord, refunds } from '../schema/index.js'

export type { NewRefundRecord, RefundRecord }

export type CreateRefundInput = {
  readonly orderId: OrderId | string
  readonly paymentId: PaymentId | string
  readonly providerRefundId: string
  readonly amount: bigint
  readonly currency: string
  readonly reason?: string | null
  readonly status?: RefundStatus
  readonly initiatedByUserId?: UserId | string | null
  readonly metadata?: Record<string, unknown>
}

export type UpdateRefundStatusOptions = {
  readonly metadata?: Record<string, unknown>
}

/**
 * Creates a new refund row.
 */
export async function createRefund(
  scope: RepositoryScope,
  input: CreateRefundInput,
): Promise<RefundRecord> {
  const [created] = await scope.tx
    .insert(refunds)
    .values(
      insertValues<NewRefundRecord>(scope, {
        orderId: input.orderId,
        paymentId: input.paymentId,
        providerRefundId: input.providerRefundId,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        reason: input.reason ?? null,
        status: input.status ?? 'pending',
        initiatedByUserId: input.initiatedByUserId ?? null,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create refund for order '${input.orderId}'`)
  }

  return created
}

/**
 * Updates the status of an existing refund.
 */
export async function updateRefundStatus(
  scope: RepositoryScope,
  id: RefundId | string,
  status: RefundStatus,
  opts: UpdateRefundStatusOptions = {},
): Promise<RefundRecord> {
  const updateData: Partial<NewRefundRecord> = {
    status,
    updatedAt: new Date(),
  }

  if (opts.metadata) {
    updateData.metadata = opts.metadata
  }

  const [updated] = await scope.tx
    .update(refunds)
    .set(updateData)
    .where(and(scoped(scope, refunds), eq(refunds.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Refund '${id}' not found in workspace '${scope.context.workspaceId}'`)
  }

  return updated
}

/**
 * Finds a refund by internal ID within the current tenant workspace.
 */
export async function findRefundById(
  scope: RepositoryScope,
  id: RefundId | string,
): Promise<RefundRecord | null> {
  const [record] = await scope.tx
    .select()
    .from(refunds)
    .where(and(scoped(scope, refunds), eq(refunds.id, id)))
    .limit(1)

  return record ?? null
}

/**
 * Finds a refund by provider refund ID within the current tenant workspace.
 */
export async function findRefundByProviderRefundId(
  scope: RepositoryScope,
  providerRefundId: string,
): Promise<RefundRecord | null> {
  const [record] = await scope.tx
    .select()
    .from(refunds)
    .where(and(scoped(scope, refunds), eq(refunds.providerRefundId, providerRefundId)))
    .limit(1)

  return record ?? null
}

/**
 * Lists all refunds for a specific order within the tenant workspace.
 */
export async function listRefundsForOrder(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<readonly RefundRecord[]> {
  return scope.tx
    .select()
    .from(refunds)
    .where(and(scoped(scope, refunds), eq(refunds.orderId, orderId)))
    .orderBy(desc(refunds.createdAt))
}

/**
 * Lists all refunds for the workspace.
 */
export async function listRefundsForWorkspace(
  scope: RepositoryScope,
  limit = 50,
): Promise<readonly RefundRecord[]> {
  return scope.tx
    .select()
    .from(refunds)
    .where(scoped(scope, refunds))
    .orderBy(desc(refunds.createdAt))
    .limit(limit)
}

/**
 * Calculates the total refunded amount in minor units for an order.
 * Only includes 'succeeded' refunds.
 */
export async function calculateTotalRefundedForOrder(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<bigint> {
  const [row] = await scope.tx
    .select({
      total: sql<string>`coalesce(sum(${refunds.amount}), '0')`,
    })
    .from(refunds)
    .where(
      and(scoped(scope, refunds), eq(refunds.orderId, orderId), eq(refunds.status, 'succeeded')),
    )

  return BigInt(row?.total ?? '0')
}
