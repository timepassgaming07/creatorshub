/**
 * Payments Repository — Tenant-scoped payment transactions and account management (Slice 5 §5.2).
 *
 * Responsibilities:
 * 1. Connected payment account management.
 * 2. Payment attempt tracking and status updates.
 * 3. Multi-tenancy isolation: All queries and mutations are bound to `scope.context.workspaceId`.
 */
import type {
  PaymentAccountStatus,
  PaymentId,
  PaymentProviderType,
  PaymentStatusType,
} from '@creatorhub/contracts'
import { and, eq } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type NewPaymentAccountRecord,
  type NewPaymentRowRecord,
  type PaymentAccountRecord,
  type PaymentRowRecord,
  paymentAccounts,
  payments,
} from '../schema/index.js'

export type { NewPaymentAccountRecord, NewPaymentRowRecord, PaymentAccountRecord, PaymentRowRecord }

export type CreatePaymentAccountInput = {
  readonly provider: PaymentProviderType
  readonly providerAccountId: string
  readonly country: string
  readonly defaultCurrency: string
  readonly status?: PaymentAccountStatus
  readonly chargesEnabled?: boolean
  readonly payoutsEnabled?: boolean
  readonly detailsSubmitted?: boolean
  readonly metadata?: Record<string, unknown>
}

export type CreatePaymentRowInput = {
  readonly orderId: string
  readonly provider: PaymentProviderType
  readonly providerPaymentId: string
  readonly providerOrderId?: string | null
  readonly providerSignature?: string | null
  readonly amount: bigint
  readonly currency: string
  readonly status?: PaymentStatusType
  readonly method?: string | null
  readonly capturedAt?: Date | null
  readonly failedAt?: Date | null
  readonly failureReason?: string | null
  readonly idempotencyKey?: string | null
  readonly metadata?: Record<string, unknown>
}

/**
 * Creates or registers a connected payment account for the current workspace.
 */
export async function createPaymentAccount(
  scope: RepositoryScope,
  input: CreatePaymentAccountInput,
): Promise<PaymentAccountRecord> {
  const [created] = await scope.tx
    .insert(paymentAccounts)
    .values(
      insertValues<NewPaymentAccountRecord>(scope, {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        country: input.country.toUpperCase(),
        defaultCurrency: input.defaultCurrency.toUpperCase(),
        status: input.status ?? 'created',
        chargesEnabled: input.chargesEnabled ?? false,
        payoutsEnabled: input.payoutsEnabled ?? false,
        detailsSubmitted: input.detailsSubmitted ?? false,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create payment account for workspace '${scope.context.workspaceId}'`)
  }

  return created
}

/**
 * Finds a connected payment account by provider and providerAccountId for the workspace.
 */
export async function findPaymentAccount(
  scope: RepositoryScope,
  provider: PaymentProviderType,
  providerAccountId: string,
): Promise<PaymentAccountRecord | null> {
  const [account] = await scope.tx
    .select()
    .from(paymentAccounts)
    .where(
      and(
        scoped(scope, paymentAccounts),
        eq(paymentAccounts.provider, provider),
        eq(paymentAccounts.providerAccountId, providerAccountId),
      ),
    )
    .limit(1)

  return account ?? null
}

/**
 * Finds the first active payment account for a provider in the workspace.
 */
export async function findActivePaymentAccount(
  scope: RepositoryScope,
  provider: PaymentProviderType,
): Promise<PaymentAccountRecord | null> {
  const [account] = await scope.tx
    .select()
    .from(paymentAccounts)
    .where(
      and(
        scoped(scope, paymentAccounts),
        eq(paymentAccounts.provider, provider),
        eq(paymentAccounts.status, 'active'),
      ),
    )
    .limit(1)

  return account ?? null
}

/**
 * Updates a payment account's status and capability flags.
 */
export async function updatePaymentAccountStatus(
  scope: RepositoryScope,
  accountId: string,
  status: PaymentAccountStatus,
  flags: {
    readonly chargesEnabled?: boolean
    readonly payoutsEnabled?: boolean
    readonly detailsSubmitted?: boolean
  } = {},
): Promise<PaymentAccountRecord> {
  const updateData: Partial<NewPaymentAccountRecord> = {
    status,
    updatedAt: new Date(),
  }

  if (flags.chargesEnabled !== undefined) {
    updateData.chargesEnabled = flags.chargesEnabled
  }
  if (flags.payoutsEnabled !== undefined) {
    updateData.payoutsEnabled = flags.payoutsEnabled
  }
  if (flags.detailsSubmitted !== undefined) {
    updateData.detailsSubmitted = flags.detailsSubmitted
  }

  const [updated] = await scope.tx
    .update(paymentAccounts)
    .set(updateData)
    .where(and(scoped(scope, paymentAccounts), eq(paymentAccounts.id, accountId)))
    .returning()

  if (!updated) {
    throw new Error(
      `Payment account '${accountId}' not found in workspace '${scope.context.workspaceId}'`,
    )
  }

  return updated
}

/**
 * Creates a payment attempt row for an order.
 */
export async function createPayment(
  scope: RepositoryScope,
  input: CreatePaymentRowInput,
): Promise<PaymentRowRecord> {
  const [created] = await scope.tx
    .insert(payments)
    .values(
      insertValues<NewPaymentRowRecord>(scope, {
        orderId: input.orderId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId ?? null,
        providerSignature: input.providerSignature ?? null,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        status: input.status ?? 'pending',
        method: input.method ?? null,
        capturedAt: input.capturedAt ?? null,
        failedAt: input.failedAt ?? null,
        failureReason: input.failureReason ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create payment for order '${input.orderId}'`)
  }

  return created
}

/**
 * Finds a payment row by internal ID within the workspace.
 */
export async function findPaymentById(
  scope: RepositoryScope,
  paymentId: PaymentId | string,
): Promise<PaymentRowRecord | null> {
  const [payment] = await scope.tx
    .select()
    .from(payments)
    .where(and(scoped(scope, payments), eq(payments.id, paymentId)))
    .limit(1)

  return payment ?? null
}

/**
 * Finds a payment by provider payment ID within the workspace.
 */
export async function findPaymentByProviderPaymentId(
  scope: RepositoryScope,
  provider: PaymentProviderType,
  providerPaymentId: string,
): Promise<PaymentRowRecord | null> {
  const [payment] = await scope.tx
    .select()
    .from(payments)
    .where(
      and(
        scoped(scope, payments),
        eq(payments.provider, provider),
        eq(payments.providerPaymentId, providerPaymentId),
      ),
    )
    .limit(1)

  return payment ?? null
}

/**
 * Updates status and metadata of a payment record.
 */
export async function updatePaymentStatus(
  scope: RepositoryScope,
  paymentId: PaymentId | string,
  status: PaymentStatusType,
  updates: {
    readonly capturedAt?: Date | null
    readonly failedAt?: Date | null
    readonly failureReason?: string | null
    readonly method?: string | null
    /** The provider's payment id, once known. A session starts with only an order id. */
    readonly providerPaymentId?: string
  } = {},
): Promise<PaymentRowRecord> {
  const updateData: Partial<NewPaymentRowRecord> = {
    status,
    updatedAt: new Date(),
  }

  if (updates.capturedAt !== undefined) {
    updateData.capturedAt = updates.capturedAt
  }
  if (updates.failedAt !== undefined) {
    updateData.failedAt = updates.failedAt
  }
  if (updates.failureReason !== undefined) {
    updateData.failureReason = updates.failureReason
  }
  if (updates.method !== undefined) {
    updateData.method = updates.method
  }
  if (updates.providerPaymentId !== undefined) {
    updateData.providerPaymentId = updates.providerPaymentId
  }

  const [updated] = await scope.tx
    .update(payments)
    .set(updateData)
    .where(and(scoped(scope, payments), eq(payments.id, paymentId)))
    .returning()

  if (!updated) {
    throw new Error(`Payment '${paymentId}' not found in workspace '${scope.context.workspaceId}'`)
  }

  return updated
}

/**
 * Lists all payments for an order scoped to current workspace.
 */
export async function listPaymentsForOrder(
  scope: RepositoryScope,
  orderId: string,
): Promise<readonly PaymentRowRecord[]> {
  return scope.tx
    .select()
    .from(payments)
    .where(and(scoped(scope, payments), eq(payments.orderId, orderId)))
    .orderBy(payments.createdAt)
}
