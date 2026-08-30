/**
 * Disputes Repository — Tenant-scoped dispute/chargeback persistence (Slice 5 §5.10).
 *
 * Responsibilities:
 * 1. Record payment disputes and chargebacks bound to workspace and order.
 * 2. Retrieve disputes by ID, provider dispute ID, and order.
 * 3. Enforce multi-tenancy isolation on all queries and mutations.
 * 4. Update dispute lifecycle status and evidence deadlines.
 */
import type { DisputeId, DisputeStatus, OrderId, PaymentId } from '@creatorhub/contracts'
import { and, desc, eq } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import { type DisputeRecord, type NewDisputeRecord, disputes } from '../schema/index.js'

export type { DisputeRecord, NewDisputeRecord }

export type CreateDisputeInput = {
  readonly orderId: OrderId | string
  readonly paymentId: PaymentId | string
  readonly providerDisputeId: string
  readonly amount: bigint
  readonly currency: string
  readonly reason?: string | null
  readonly status?: DisputeStatus
  readonly feeAmount?: bigint
  readonly evidenceDueAt?: Date | null
  readonly metadata?: Record<string, unknown>
}

export type UpdateDisputeStatusOptions = {
  readonly feeAmount?: bigint
  readonly metadata?: Record<string, unknown>
}

/**
 * Creates a new dispute record.
 */
export async function createDispute(
  scope: RepositoryScope,
  input: CreateDisputeInput,
): Promise<DisputeRecord> {
  const [created] = await scope.tx
    .insert(disputes)
    .values(
      insertValues<NewDisputeRecord>(scope, {
        orderId: input.orderId,
        paymentId: input.paymentId,
        providerDisputeId: input.providerDisputeId,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        reason: input.reason ?? null,
        status: input.status ?? 'needs_response',
        feeAmount: input.feeAmount ?? 0n,
        evidenceDueAt: input.evidenceDueAt ?? null,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create dispute for order '${input.orderId}'`)
  }

  return created
}

/**
 * Updates the status of an existing dispute.
 */
export async function updateDisputeStatus(
  scope: RepositoryScope,
  id: DisputeId | string,
  status: DisputeStatus,
  opts: UpdateDisputeStatusOptions = {},
): Promise<DisputeRecord> {
  const updateData: Partial<NewDisputeRecord> = {
    status,
    updatedAt: new Date(),
  }

  if (opts.feeAmount !== undefined) {
    updateData.feeAmount = opts.feeAmount
  }
  if (opts.metadata) {
    updateData.metadata = opts.metadata
  }

  const [updated] = await scope.tx
    .update(disputes)
    .set(updateData)
    .where(and(scoped(scope, disputes), eq(disputes.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Dispute '${id}' not found in workspace '${scope.context.workspaceId}'`)
  }

  return updated
}

/**
 * Finds a dispute by internal ID within the current tenant workspace.
 */
export async function findDisputeById(
  scope: RepositoryScope,
  id: DisputeId | string,
): Promise<DisputeRecord | null> {
  const [record] = await scope.tx
    .select()
    .from(disputes)
    .where(and(scoped(scope, disputes), eq(disputes.id, id)))
    .limit(1)

  return record ?? null
}

/**
 * Finds a dispute by provider dispute ID within the current tenant workspace.
 */
export async function findDisputeByProviderDisputeId(
  scope: RepositoryScope,
  providerDisputeId: string,
): Promise<DisputeRecord | null> {
  const [record] = await scope.tx
    .select()
    .from(disputes)
    .where(and(scoped(scope, disputes), eq(disputes.providerDisputeId, providerDisputeId)))
    .limit(1)

  return record ?? null
}

/**
 * Lists all disputes for an order within the workspace.
 */
export async function listDisputesForOrder(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<readonly DisputeRecord[]> {
  return scope.tx
    .select()
    .from(disputes)
    .where(and(scoped(scope, disputes), eq(disputes.orderId, orderId)))
    .orderBy(desc(disputes.createdAt))
}

/**
 * Lists all disputes for the workspace.
 */
export async function listDisputesForWorkspace(
  scope: RepositoryScope,
  limit = 50,
): Promise<readonly DisputeRecord[]> {
  return scope.tx
    .select()
    .from(disputes)
    .where(scoped(scope, disputes))
    .orderBy(desc(disputes.createdAt))
    .limit(limit)
}
