/**
 * Refund and Dispute Fulfillment Orchestrator (Slice 5 §5.10).
 *
 * Responsibilities:
 * 1. Fulfill full and partial refunds atomically in a single database transaction.
 * 2. Validate order state progression (paid -> partially_refunded -> refunded).
 * 3. Enforce that cumulative refunds cannot exceed the gross order amount.
 * 4. Compute balanced compensating double-entry ledger postings (ADR-0008).
 * 5. Record order transition audit trail, outbox events, and system audit logs.
 * 6. Record disputes and chargebacks with fee expense postings.
 */
import {
  basisPoints,
  commissionId,
  currency,
  ledgerAccountId,
  money,
  orderId,
  paymentId,
  percentage,
  refundId,
  userId,
  type DisputeStatus,
} from '@creatorhub/contracts'
import {
  auditLog,
  commissions,
  customers,
  disputes,
  fulfillment,
  ledger,
  orders,
  outbox,
  payments,
  refunds,
  workspaces,
  type CreateDisputeInput,
  type CreateRefundInput,
  type DisputeRecord,
  type OrderRecord,
  type RefundRecord,
  type RepositoryScope,
  type UpdateDisputeStatusOptions,
  type UpdateRefundStatusOptions,
} from '@creatorhub/db'
import {
  canTransitionOrderStatus,
  createDisputePosting,
  createRefundPosting,
  type DisputePostingParams,
  type RefundPostingParams,
} from '@creatorhub/domain'
import { auditOptions } from './env'

export type FulfillRefundInput = {
  readonly orderId: string
  readonly providerRefundId: string
  readonly amount: bigint
  readonly currency: string
  readonly reason?: string | null | undefined
  readonly paymentId?: string | undefined
  readonly initiatedByUserId?: string | null | undefined
  readonly platformFeeRefundBps?: number | undefined
  readonly affiliateClawbackAmount?: bigint | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type FulfillRefundResult = {
  readonly success: boolean
  readonly order: OrderRecord
  readonly refund: RefundRecord
  readonly transactionId: string
  readonly isFullRefund: boolean
}

export type FulfillDisputeInput = {
  readonly orderId: string
  readonly providerDisputeId: string
  readonly amount: bigint
  readonly currency: string
  readonly reason?: string | null | undefined
  readonly paymentId?: string | undefined
  readonly status?: DisputeStatus | undefined
  readonly feeAmount?: bigint | undefined
  readonly evidenceDueAt?: Date | null | undefined
  readonly metadata?: Record<string, unknown> | undefined
}

export type FulfillDisputeResult = {
  readonly success: boolean
  readonly order: OrderRecord
  readonly dispute: DisputeRecord
  readonly transactionId?: string | undefined
}

/**
 * Executes a full or partial refund for an order in a single atomic database transaction.
 */
export async function fulfillRefund(
  scope: RepositoryScope,
  input: FulfillRefundInput,
): Promise<FulfillRefundResult> {
  const oId = orderId(input.orderId)
  const curr = currency(input.currency)

  // 1. Fetch order and verify eligibility
  const orderRecord = await orders.findOrderById(scope, oId)
  if (!orderRecord) {
    throw new Error(
      `Order '${input.orderId}' not found in workspace '${scope.context.workspaceId}'.`,
    )
  }

  // A refund already applied (the creator's own action, then the provider's
  // webhook for the same refund) replays cleanly before any state checks; a
  // fully refunded order would otherwise fail them and be retried forever.
  const alreadyApplied = await refunds.findRefundByProviderRefundId(scope, input.providerRefundId)
  if (alreadyApplied?.status === 'succeeded') {
    return {
      success: true,
      order: orderRecord,
      refund: alreadyApplied,
      transactionId: `tx_replay_${alreadyApplied.id}`,
      isFullRefund: orderRecord.status === 'refunded',
    }
  }

  if (orderRecord.status !== 'paid' && orderRecord.status !== 'partially_refunded') {
    throw new Error(
      `Cannot refund order in '${orderRecord.status}' status. Order must be paid or partially refunded.`,
    )
  }

  // 2. Validate refund amount against remaining balance
  const previousRefunded = await refunds.calculateTotalRefundedForOrder(scope, oId)
  const remainingRefundable = orderRecord.totalAmount - previousRefunded

  if (input.amount <= 0n) {
    throw new Error('Refund amount must be strictly positive.')
  }

  if (input.amount > remainingRefundable) {
    throw new Error(
      `Refund amount (${input.amount.toString()}) exceeds remaining refundable order balance (${remainingRefundable.toString()}).`,
    )
  }

  const newTotalRefunded = previousRefunded + input.amount
  const isFullRefund = newTotalRefunded === orderRecord.totalAmount
  const nextOrderStatus = isFullRefund ? 'refunded' : 'partially_refunded'

  if (!canTransitionOrderStatus(orderRecord.status, nextOrderStatus)) {
    throw new Error(
      `Invalid order transition: cannot transition order from '${orderRecord.status}' to '${nextOrderStatus}'.`,
    )
  }

  // 3. Resolve payment record
  let pId = input.paymentId
  if (!pId) {
    const existingPayments = await payments.listPaymentsForOrder(scope, oId)
    const capturedPayment = existingPayments.find((p) => p.status === 'captured')
    if (!capturedPayment) {
      throw new Error(`No captured payment found for order '${input.orderId}'.`)
    }
    pId = capturedPayment.id
  }

  // 4. Create refund record (or idempotently find existing)
  const existingRefund = await refunds.findRefundByProviderRefundId(scope, input.providerRefundId)
  let refundRecord: RefundRecord

  if (existingRefund) {
    if (existingRefund.status === 'succeeded') {
      return {
        success: true,
        order: orderRecord,
        refund: existingRefund,
        transactionId: `tx_replay_${existingRefund.id}`,
        isFullRefund,
      }
    }
    const updateOpts: UpdateRefundStatusOptions = {
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }
    refundRecord = await refunds.updateRefundStatus(
      scope,
      existingRefund.id,
      'succeeded',
      updateOpts,
    )
  } else {
    const createInput: CreateRefundInput = {
      orderId: oId,
      paymentId: paymentId(pId),
      providerRefundId: input.providerRefundId,
      amount: input.amount,
      currency: curr,
      status: 'succeeded',
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.initiatedByUserId !== undefined
        ? { initiatedByUserId: input.initiatedByUserId }
        : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }
    refundRecord = await refunds.createRefund(scope, createInput)
  }

  // 5. Update order status and payment status
  const updatedOrder = await orders.updateOrderStatus(
    scope,
    oId,
    nextOrderStatus,
    isFullRefund ? 'refunded' : 'partially_refunded',
  )

  // 6. Record order transition
  await orders.recordOrderTransition(scope, {
    orderId: oId,
    fromStatus: orderRecord.status,
    toStatus: nextOrderStatus,
    actorType: input.initiatedByUserId ? 'member' : 'webhook',
    reason: input.reason ?? (isFullRefund ? 'Order fully refunded' : 'Order partially refunded'),
    metadata: {
      refundId: refundRecord.id,
      providerRefundId: input.providerRefundId,
      refundAmount: input.amount.toString(),
      isFullRefund,
    },
  })

  // 6.5. Process affiliate commission clawback if applicable (Slice 9 §9.5)
  let affiliateClawbackAmount = input.affiliateClawbackAmount ?? 0n
  let affiliatePayableAccId: typeof procAcc.id | undefined

  try {
    const existingCommission = await commissions.findCommissionByOrderId(scope, oId)
    if (existingCommission && existingCommission.netAmount > 0n) {
      const clawbackRes = await commissions.applyClawback(scope, {
        commissionId: commissionId(existingCommission.id),
        refundId: refundId(refundRecord.id),
        amount: input.amount,
        reason: input.reason ?? 'Order refund commission clawback',
      })
      affiliateClawbackAmount = clawbackRes.clawback.amount
    }
  } catch {
    // Non-fatal if commission clawback is not applicable or already clawed back
  }

  if (affiliateClawbackAmount > 0n) {
    const affAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'affiliate_payable', curr)
    affiliatePayableAccId = affAcc.id
  }

  // 7. Calculate compensating ledger posting portions
  // Pro-rata tax refund: (refundAmount / totalAmount) * taxAmount
  let taxRefundAmount = 0n
  if (orderRecord.taxAmount > 0n && orderRecord.totalAmount > 0n) {
    taxRefundAmount = (input.amount * orderRecord.taxAmount) / orderRecord.totalAmount
  }

  // Platform fee refund: use workspace's configured rate
  const workspaceRecord = await workspaces.findCurrentWorkspace(scope)
  const workspaceFeeBps = workspaceRecord?.platformFeeBps ?? 500
  const baseRefundAmount = input.amount - taxRefundAmount
  const baseMoney = money(baseRefundAmount, curr)
  const feeRefundMoney = percentage(baseMoney, basisPoints(workspaceFeeBps))

  const procAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'processor_clearing', curr)
  const creatorAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'creator_payable', curr)
  const feeAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'platform_revenue', curr)
  const taxAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'tax_payable', curr)

  const postingParams: RefundPostingParams = {
    workspaceId: scope.context.workspaceId,
    orderId: oId,
    refundId: refundRecord.id,
    idempotencyKey: `refund_${refundRecord.id}`,
    currency: curr,
    grossRefundAmount: money(input.amount, curr),
    platformFeeRefundAmount: feeRefundMoney,
    ...(taxRefundAmount > 0n ? { taxRefundAmount: money(taxRefundAmount, curr) } : {}),
    ...(affiliateClawbackAmount > 0n
      ? { affiliateClawbackAmount: money(affiliateClawbackAmount, curr) }
      : {}),
    accounts: {
      processorClearingAccountId: ledgerAccountId(procAcc.id),
      creatorPayableAccountId: ledgerAccountId(creatorAcc.id),
      platformRevenueAccountId: ledgerAccountId(feeAcc.id),
      ...(taxRefundAmount > 0n ? { taxPayableAccountId: ledgerAccountId(taxAcc.id) } : {}),
      ...(affiliatePayableAccId
        ? { affiliatePayableAccountId: ledgerAccountId(affiliatePayableAccId) }
        : {}),
    },
  }

  const postingResult = createRefundPosting(postingParams)
  if (!postingResult.ok) {
    throw new Error(
      `Failed to construct balanced refund ledger posting: ${postingResult.error.detail}`,
    )
  }

  const ledgerTx = await ledger.postTransaction(scope, postingResult.value)

  // Lifetime spend is net of refunds.
  await customers.upsertCustomer(scope, {
    email: orderRecord.customerEmail,
    incrementSpend: -input.amount,
  })

  // Revoke digital entitlements (Slice 6)
  if (isFullRefund) {
    await fulfillment.revokeEntitlementsByOrderId(
      scope,
      oId,
      input.reason ?? 'order_fully_refunded',
    )
  }

  // 8. Enqueue outbox event
  await outbox.writeOutboxEvent(scope, {
    workspaceId: scope.context.workspaceId,
    aggregateType: 'order',
    aggregateId: oId,
    eventType: isFullRefund ? 'order.refunded' : 'order.partially_refunded',
    payload: {
      orderId: oId,
      refundId: refundRecord.id,
      providerRefundId: input.providerRefundId,
      amount: input.amount.toString(),
      currency: curr,
      isFullRefund,
    },
  })

  // 9. Write audit log
  await auditLog.writeAuditLog(scope, auditOptions, {
    action: isFullRefund ? 'order.refunded' : 'order.partially_refunded',
    actorType: input.initiatedByUserId ? 'user' : 'system',
    ...(input.initiatedByUserId ? { actorId: userId(input.initiatedByUserId) } : {}),
    targetType: 'order',
    targetId: oId,
    metadata: {
      refundId: refundRecord.id,
      amount: input.amount.toString(),
      currency: curr,
      ...(input.reason ? { reason: input.reason } : {}),
      transactionId: ledgerTx.transaction.id,
    },
  })

  return {
    success: true,
    order: updatedOrder,
    refund: refundRecord,
    transactionId: ledgerTx.transaction.id,
    isFullRefund,
  }
}

/**
 * Fulfills a payment dispute or chargeback atomically.
 */
export async function fulfillDispute(
  scope: RepositoryScope,
  input: FulfillDisputeInput,
): Promise<FulfillDisputeResult> {
  const oId = orderId(input.orderId)
  const curr = currency(input.currency)

  const orderRecord = await orders.findOrderById(scope, oId)
  if (!orderRecord) {
    throw new Error(
      `Order '${input.orderId}' not found in workspace '${scope.context.workspaceId}'.`,
    )
  }

  let pId = input.paymentId
  if (!pId) {
    const existingPayments = await payments.listPaymentsForOrder(scope, oId)
    const capturedPayment = existingPayments.find((p) => p.status === 'captured')
    if (!capturedPayment) {
      throw new Error(`No captured payment found for order '${input.orderId}'.`)
    }
    pId = capturedPayment.id
  }

  const existingDispute = await disputes.findDisputeByProviderDisputeId(
    scope,
    input.providerDisputeId,
  )
  let disputeRecord: DisputeRecord
  let transactionId: string | undefined

  if (existingDispute) {
    const updateOpts: UpdateDisputeStatusOptions = {
      ...(input.feeAmount !== undefined ? { feeAmount: input.feeAmount } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }
    disputeRecord = await disputes.updateDisputeStatus(
      scope,
      existingDispute.id,
      input.status ?? 'under_review',
      updateOpts,
    )
  } else {
    const createInput: CreateDisputeInput = {
      orderId: oId,
      paymentId: paymentId(pId),
      providerDisputeId: input.providerDisputeId,
      amount: input.amount,
      currency: curr,
      status: input.status ?? 'needs_response',
      feeAmount: input.feeAmount ?? 0n,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.evidenceDueAt !== undefined ? { evidenceDueAt: input.evidenceDueAt } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    }
    disputeRecord = await disputes.createDispute(scope, createInput)

    // Post dispute ledger transaction
    const procAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'processor_clearing', curr)
    const creatorAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'creator_payable', curr)
    const feeExpAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'fees_expense', curr)

    const disputePostingParams: DisputePostingParams = {
      workspaceId: scope.context.workspaceId,
      orderId: oId,
      disputeId: disputeRecord.id,
      idempotencyKey: `dispute_${disputeRecord.id}`,
      currency: curr,
      disputeAmount: money(input.amount, curr),
      ...(input.feeAmount ? { feeAmount: money(input.feeAmount, curr) } : {}),
      accounts: {
        processorClearingAccountId: ledgerAccountId(procAcc.id),
        creatorPayableAccountId: ledgerAccountId(creatorAcc.id),
        ...(input.feeAmount ? { feesExpenseAccountId: ledgerAccountId(feeExpAcc.id) } : {}),
      },
    }

    const postingResult = createDisputePosting(disputePostingParams)
    if (!postingResult.ok) {
      throw new Error(
        `Failed to construct balanced dispute ledger posting: ${postingResult.error.detail}`,
      )
    }

    const ledgerTx = await ledger.postTransaction(scope, postingResult.value)
    transactionId = ledgerTx.transaction.id
  }

  // Enqueue outbox event
  await outbox.writeOutboxEvent(scope, {
    workspaceId: scope.context.workspaceId,
    aggregateType: 'order',
    aggregateId: oId,
    eventType: 'order.disputed',
    payload: {
      orderId: oId,
      disputeId: disputeRecord.id,
      providerDisputeId: input.providerDisputeId,
      amount: input.amount.toString(),
      currency: curr,
      status: disputeRecord.status,
    },
  })

  // Revoke digital entitlements upon dispute creation (Slice 6)
  await fulfillment.revokeEntitlementsByOrderId(scope, oId, input.reason ?? 'payment_dispute')

  // Write audit log
  await auditLog.writeAuditLog(scope, auditOptions, {
    action: 'order.disputed',
    actorType: 'system',
    targetType: 'order',
    targetId: oId,
    metadata: {
      disputeId: disputeRecord.id,
      amount: input.amount.toString(),
      currency: curr,
      ...(input.reason ? { reason: input.reason } : {}),
      status: disputeRecord.status,
    },
  })

  return {
    success: true,
    order: orderRecord,
    dispute: disputeRecord,
    transactionId,
  }
}
