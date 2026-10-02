/**
 * Order & Payment Fulfillment Service (Slice 5 §5.9).
 *
 * Responsibilities:
 * 1. Process payment success events atomically in a single database transaction.
 * 2. Enforce pure order and payment state machine transitions.
 * 3. Construct and write balanced double-entry ledger transactions (`createOrderPaymentPosting`).
 * 4. Record order transition audit trail in `order_transitions`.
 * 5. Write transactional outbox events for downstream asynchronous workflows.
 * 6. Guarantee idempotency: multiple calls with the same provider payment id replay cleanly.
 */
import {
  affiliateId,
  attributionId,
  basisPoints,
  currency,
  discountId,
  ledgerAccountId,
  money,
  orderId,
  percentage,
  type CurrencyCode,
  type PaymentProviderType,
} from '@creatorhub/contracts'
import {
  affiliates,
  auditLog,
  commissions,
  customers,
  discounts,
  fulfillment,
  ledger,
  orders,
  outbox,
  payments,
  workspaces,
  type OrderRecord,
  type PaymentRowRecord,
  type RepositoryScope,
} from '@creatorhub/db'
import {
  calculateHeldUntil,
  canTransitionOrderStatus,
  createOrderPaymentPosting,
  evaluateAttribution,
  type AttributionDecision,
} from '@creatorhub/domain'

import { issueDownloadGrants, type IssuedDownload } from './delivery'
import { auditOptions } from './env'


export type FulfillPaidOrderInput = {
  readonly orderId: string
  readonly provider: PaymentProviderType
  readonly providerPaymentId: string
  readonly amount: bigint
  readonly currency: string
  readonly method?: string | null | undefined
  readonly capturedAt?: Date | null | undefined
  readonly platformFeeBps?: number | undefined
  readonly affiliateCommission?: bigint | undefined
  readonly affiliateAccountId?: string | undefined
}

export type FulfillPaidOrderResult = {
  readonly success: boolean
  readonly order: OrderRecord
  readonly payment: PaymentRowRecord
  readonly idempotentReplay: boolean
  readonly transactionId?: string
  readonly downloadGrants?: readonly IssuedDownload[]
}

/**
 * The provider reported a capture that does not cover the order. The order is
 * left unpaid and nothing is delivered; the payment needs a human to refund or
 * reconcile it.
 */
export class PaymentAmountMismatchError extends Error {
  constructor(
    readonly orderId: string,
    readonly expected: bigint,
    readonly received: bigint,
    readonly expectedCurrency: string,
    readonly receivedCurrency: string,
  ) {
    super(
      `Captured ${received.toString()} ${receivedCurrency} does not match order ${orderId} total ${expected.toString()} ${expectedCurrency}.`,
    )
    this.name = 'PaymentAmountMismatchError'
  }
}

export type ProcessPaymentFailureInput = {
  readonly orderId: string
  readonly provider: PaymentProviderType
  readonly providerPaymentId: string
  readonly reason: string
  readonly failedAt?: Date | null
}

export type ProcessPaymentFailureResult = {
  readonly success: boolean
  readonly order: OrderRecord
  readonly payment: PaymentRowRecord
}

/**
 * Atomically fulfills an order upon payment capture (ADR-0008, Slice 5 §5.9).
 *
 * Writes within scope.tx:
 * 1. Payment status update to 'captured'
 * 2. Order status update to 'paid' (payment_status: 'paid')
 * 3. Order transition log in `order_transitions`
 * 4. Perfectly balanced double-entry ledger transaction (`ledger_transactions` + `ledger_entries`)
 * 5. Outbox domain event in `outbox`
 * 6. Audit log in `audit_logs`
 */
export async function fulfillPaidOrder(
  scope: RepositoryScope,
  input: FulfillPaidOrderInput,
): Promise<FulfillPaidOrderResult> {
  const oId = orderId(input.orderId)
  const orderRecord = await orders.findOrderById(scope, oId)

  if (!orderRecord) {
    throw new Error(
      `Order '${input.orderId}' not found in workspace '${scope.context.workspaceId}'`,
    )
  }

  const curr: CurrencyCode = currency(orderRecord.currency)
  const ledgerIdempotencyKey = `order_payment_${orderRecord.id}`

  // Idempotency: a second capture notice for a paid order (the browser
  // confirmation and the webhook both arrive) replays without side effects.
  if (orderRecord.status === 'paid' && orderRecord.paymentStatus === 'paid') {
    const existingPayments = await payments.listPaymentsForOrder(scope, orderRecord.id)
    const capturedPayment =
      existingPayments.find(
        (p) => p.status === 'captured' && p.providerPaymentId === input.providerPaymentId,
      ) ??
      existingPayments.find((p) => p.status === 'captured') ??
      existingPayments[0]

    if (!capturedPayment) {
      throw new Error(`Order '${orderRecord.id}' is paid but has no payment record.`)
    }

    return {
      success: true,
      order: orderRecord,
      payment: capturedPayment,
      idempotentReplay: true,
    }
  }

  // The capture must cover the order exactly. Free orders carry no payment.
  if (
    orderRecord.totalAmount > 0n &&
    (input.amount !== orderRecord.totalAmount ||
      input.currency.toUpperCase() !== orderRecord.currency.toUpperCase())
  ) {
    throw new PaymentAmountMismatchError(
      orderRecord.id,
      orderRecord.totalAmount,
      input.amount,
      orderRecord.currency,
      input.currency,
    )
  }

  let currentStatus = orderRecord.status
  if (currentStatus === 'pending') {
    await orders.recordOrderTransition(scope, {
      orderId: orderRecord.id,
      fromStatus: 'pending',
      toStatus: 'requires_payment',
      actorType: 'system',
      reason: 'Payment processing initiated',
    })
    await orders.updateOrderStatus(scope, orderRecord.id, 'requires_payment', 'unpaid')
    currentStatus = 'requires_payment'
  }

  // Validate state machine transition
  if (!canTransitionOrderStatus(currentStatus, 'paid')) {
    throw new Error(
      `Invalid order transition: cannot transition order from '${currentStatus}' to 'paid'.`,
    )
  }

  // 1. Update or create payment attempt record
  const existingPayments = await payments.listPaymentsForOrder(scope, orderRecord.id)
  let paymentRecord: PaymentRowRecord

  const matchPayment = existingPayments.find(
    (p) =>
      p.providerPaymentId === input.providerPaymentId ||
      (p.provider === input.provider && p.status === 'pending'),
  )

  if (matchPayment) {
    paymentRecord = await payments.updatePaymentStatus(scope, matchPayment.id, 'captured', {
      capturedAt: input.capturedAt ?? new Date(),
      method: input.method ?? matchPayment.method ?? 'card',
      providerPaymentId: input.providerPaymentId,
    })
  } else {
    paymentRecord = await payments.createPayment(scope, {
      orderId: orderRecord.id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      amount: orderRecord.totalAmount,
      currency: orderRecord.currency,
      status: 'captured',
      method: input.method ?? 'card',
      capturedAt: input.capturedAt ?? new Date(),
      idempotencyKey: ledgerIdempotencyKey,
    })
  }

  // 2. Transition order status to 'paid'
  const updatedOrder = await orders.updateOrderStatus(scope, orderRecord.id, 'paid', 'paid')

  // 3. Record order transition
  await orders.recordOrderTransition(scope, {
    orderId: orderRecord.id,
    fromStatus: currentStatus,
    toStatus: 'paid',
    actorType: 'system',
    reason: `Payment captured via ${input.provider} (${input.providerPaymentId})`,
    metadata: {
      providerPaymentId: input.providerPaymentId,
      method: input.method ?? 'card',
    },
  })

  // Attribution is decided before the ledger posting so the commission is part
  // of the same balanced transaction. Posting it later, or not at all, would
  // overstate what the creator is owed.
  const attribution = await resolveAttribution(scope, orderRecord)
  const commissionMinor =
    attribution?.decision.status === 'attributed' ? attribution.decision.commissionAmountMinor : 0n

  let ledgerTxResult: Awaited<ReturnType<typeof ledger.postTransaction>> | null = null

  if (orderRecord.totalAmount > 0n) {
    // 4. Find or create tenant ledger accounts
    const processorClearingAcc = await ledger.findOrCreateWorkspaceAccount(
      scope,
      'processor_clearing',
      curr,
    )
    const creatorPayableAcc = await ledger.findOrCreateWorkspaceAccount(
      scope,
      'creator_payable',
      curr,
    )
    const platformRevenueAcc = await ledger.findOrCreateWorkspaceAccount(
      scope,
      'platform_revenue',
      curr,
    )

    let taxPayableAccId = undefined
    if (orderRecord.taxAmount > 0n) {
      const taxAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'tax_payable', curr)
      taxPayableAccId = ledgerAccountId(taxAcc.id)
    }

    let affiliatePayableAccId = undefined
    if (commissionMinor > 0n) {
      const affAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'affiliate_payable', curr)
      affiliatePayableAccId = ledgerAccountId(affAcc.id)
    }

    // 5. Look up the workspace's configured platform fee rate
    const workspaceRecord = await workspaces.findCurrentWorkspace(scope)
    const workspaceFeeBps = workspaceRecord?.platformFeeBps ?? 500
    const grossMoney = money(orderRecord.totalAmount, curr)
    const taxMoney = money(orderRecord.taxAmount, curr)
    const feeBps = basisPoints(workspaceFeeBps)
    // Platform fee computed on subtotal amount (pre-tax base)
    const baseMoney = money(orderRecord.subtotalAmount, curr)
    const platformFeeMoney = percentage(baseMoney, feeBps)

    const affiliateMoney = commissionMinor > 0n ? money(commissionMinor, curr) : undefined

    const postingResult = createOrderPaymentPosting({
      workspaceId: scope.context.workspaceId,
      orderId: orderRecord.id,
      idempotencyKey: ledgerIdempotencyKey,
      currency: curr,
      grossAmount: grossMoney,
      platformFee: platformFeeMoney,
      ...(orderRecord.taxAmount > 0n ? { taxAmount: taxMoney } : {}),
      ...(affiliateMoney ? { affiliateCommission: affiliateMoney } : {}),
      accounts: {
        processorClearingAccountId: ledgerAccountId(processorClearingAcc.id),
        creatorPayableAccountId: ledgerAccountId(creatorPayableAcc.id),
        platformRevenueAccountId: ledgerAccountId(platformRevenueAcc.id),
        ...(taxPayableAccId ? { taxPayableAccountId: taxPayableAccId } : {}),
        ...(affiliatePayableAccId ? { affiliatePayableAccountId: affiliatePayableAccId } : {}),
      },
    })

    if (!postingResult.ok) {
      throw new Error(`Failed to construct balanced ledger posting: ${postingResult.error.detail}`)
    }

    // 6. Post balanced double-entry transaction atomically
    ledgerTxResult = await ledger.postTransaction(scope, postingResult.value)
  }

  // 7. Enqueue domain event to transactional outbox
  await outbox.writeOutboxEvent(scope, {
    workspaceId: scope.context.workspaceId,
    aggregateType: 'order',
    aggregateId: orderRecord.id,
    eventType: 'order.paid',
    payload: {
      orderId: orderRecord.id,
      workspaceId: scope.context.workspaceId,
      customerEmail: orderRecord.customerEmail,
      totalAmount: orderRecord.totalAmount.toString(),
      currency: orderRecord.currency,
      providerPaymentId: input.providerPaymentId,
      ...(ledgerTxResult ? { transactionId: ledgerTxResult.transaction.id } : {}),
    },
  })

  // 8. Audit log entry
  await auditLog.writeAuditLog(scope, auditOptions, {
    action: orderRecord.totalAmount === 0n ? 'order.free_claimed' : 'order.payment_captured',
    targetType: 'order',
    targetId: orderRecord.id,
    actorType: 'system',
    metadata: {
      orderId: orderRecord.id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      totalAmount: orderRecord.totalAmount.toString(),
      currency: orderRecord.currency,
      ...(ledgerTxResult ? { ledgerTransactionId: ledgerTxResult.transaction.id } : {}),
    },
  })

  // 9. Customer Lifecycle: Upsert customer profile and aggregate spend (Slice 7)
  try {
    await customers.upsertCustomer(scope, {
      email: orderRecord.customerEmail,
      name: orderRecord.customerName,
      phone: orderRecord.customerPhone,
      incrementSpend: orderRecord.totalAmount,
      incrementOrders: 1,
    })
  } catch {
    // Non-fatal if customer repository encounters transient error
  }

  // A discount counts as used only once the order is paid, so abandoned
  // checkouts never exhaust a limited code.
  const appliedDiscountId = (orderRecord.metadata as Record<string, unknown> | null)?.['discountId']
  if (typeof appliedDiscountId === 'string') {
    await discounts.incrementDiscountUsage(scope, discountId(appliedDiscountId))
  }

  // 10. Entitlements, then fresh download grants for every file.
  const orderWithItems = await orders.findOrderWithItems(scope, orderRecord.id)
  if (orderWithItems) {
    const existing = await fulfillment.findEntitlementsByOrderId(scope, orderRecord.id)
    for (const item of orderWithItems.items) {
      if (existing.some((e) => e.productId === item.productId)) continue
      await fulfillment.createEntitlement(scope, {
        orderId: orderRecord.id,
        productId: item.productId,
        customerEmail: orderRecord.customerEmail,
        metadata: {
          productTitle: item.productTitle,
          quantity: item.quantity,
          unitAmount: item.unitAmount.toString(),
        },
      })
    }
  }
  const issuedDownloadGrants = await issueDownloadGrants(scope, orderRecord.id)

  // 11. Record the attribution and, when it earned one, the held commission.
  if (attribution) {
    const attr = await affiliates.createAttribution(scope, {
      orderId: orderRecord.id,
      affiliateId: attribution.affiliateId,
      affiliateLinkId: attribution.linkId,
      commissionBps: attribution.decision.commissionBps,
      commissionAmount: attribution.decision.commissionAmountMinor,
      status: attribution.decision.status,
      rejectionReason: attribution.decision.rejectionReason,
    })

    if (commissionMinor > 0n) {
      await commissions.createCommission(scope, {
        attributionId: attributionId(attr.id),
        affiliateId: affiliateId(attribution.affiliateId),
        orderId: orderId(orderRecord.id),
        grossSaleAmount: orderRecord.subtotalAmount,
        commissionBps: attribution.decision.commissionBps,
        grossAmount: commissionMinor,
        heldUntil: calculateHeldUntil(orderRecord.createdAt, 30, 14),
        currency: curr,
      })
    }
  }

  return {
    success: true,
    order: updatedOrder,
    payment: paymentRecord,
    idempotentReplay: ledgerTxResult?.idempotentReplay ?? false,
    ...(ledgerTxResult ? { transactionId: ledgerTxResult.transaction.id } : {}),
    downloadGrants: issuedDownloadGrants,
  }
}

type ResolvedAttribution = {
  readonly affiliateId: string
  readonly linkId: string
  readonly decision: AttributionDecision
}

/**
 * Decide whether a referral on the order earns a commission. Returns null when
 * there is no referral, the code matches no link, or the order is already
 * attributed. Rule evaluation lives in the domain; this only gathers inputs.
 */
async function resolveAttribution(
  scope: RepositoryScope,
  orderRecord: OrderRecord,
): Promise<ResolvedAttribution | null> {
  const meta = orderRecord.metadata as Record<string, unknown> | null
  const referralCode = typeof meta?.['referralCode'] === 'string' ? meta['referralCode'] : null
  if (!referralCode || orderRecord.subtotalAmount <= 0n) return null

  const already = await affiliates.findAttributionByOrderId(scope, orderRecord.id)
  if (already) return null

  const link = await affiliates.findAffiliateLinkByCode(scope, referralCode)
  if (!link) return null

  const program = await affiliates.getAffiliateProgram(scope)
  const promoter = await affiliates.findAffiliateById(scope, link.affiliateId)
  const clickedAt = typeof meta?.['referralClickedAt'] === 'string' ? new Date(meta['referralClickedAt']) : null

  const decision = evaluateAttribution({
    programIsActive: program?.isActive ?? false,
    allowSelfReferral: program?.allowSelfReferral ?? false,
    cookieWindowDays: program?.cookieWindowDays ?? 30,
    defaultCommissionBps: program?.defaultCommissionBps ?? 2000,
    customCommissionBps: promoter?.customCommissionBps ?? null,
    affiliateStatus:
      (promoter?.status as 'pending' | 'approved' | 'suspended' | 'rejected' | undefined) ??
      'pending',
    affiliateEmail: promoter?.email ?? '',
    buyerEmail: orderRecord.customerEmail,
    saleAmountMinor: orderRecord.subtotalAmount,
    clickDate: clickedAt && !Number.isNaN(clickedAt.getTime()) ? clickedAt : null,
    orderDate: orderRecord.createdAt,
  })

  return { affiliateId: link.affiliateId, linkId: link.id, decision }
}

/**
 * Handles a payment failure for an order.
 */
export async function processPaymentFailure(
  scope: RepositoryScope,
  input: ProcessPaymentFailureInput,
): Promise<ProcessPaymentFailureResult> {
  const oId = orderId(input.orderId)
  const orderRecord = await orders.findOrderById(scope, oId)

  if (!orderRecord) {
    throw new Error(
      `Order '${input.orderId}' not found in workspace '${scope.context.workspaceId}'`,
    )
  }

  // Find payment attempt
  const existingPayments = await payments.listPaymentsForOrder(scope, orderRecord.id)
  let paymentRecord: PaymentRowRecord

  const matchPayment = existingPayments.find(
    (p) =>
      p.providerPaymentId === input.providerPaymentId ||
      (p.provider === input.provider && p.status === 'pending'),
  )

  if (matchPayment) {
    paymentRecord = await payments.updatePaymentStatus(scope, matchPayment.id, 'failed', {
      failedAt: input.failedAt ?? new Date(),
      failureReason: input.reason,
    })
  } else {
    paymentRecord = await payments.createPayment(scope, {
      orderId: orderRecord.id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      amount: orderRecord.totalAmount,
      currency: orderRecord.currency,
      status: 'failed',
      failedAt: input.failedAt ?? new Date(),
      failureReason: input.reason,
    })
  }

  // Update order status if currently in pending / requires_payment
  let updatedOrder = orderRecord
  if (orderRecord.status === 'pending' || orderRecord.status === 'requires_payment') {
    updatedOrder = await orders.updateOrderStatus(
      scope,
      orderRecord.id,
      'requires_payment',
      'failed',
    )

    await orders.recordOrderTransition(scope, {
      orderId: orderRecord.id,
      fromStatus: orderRecord.status,
      toStatus: 'requires_payment',
      actorType: 'system',
      reason: `Payment failed: ${input.reason}`,
      metadata: {
        providerPaymentId: input.providerPaymentId,
        failureReason: input.reason,
      },
    })
  }

  // Outbox event
  await outbox.writeOutboxEvent(scope, {
    workspaceId: scope.context.workspaceId,
    aggregateType: 'order',
    aggregateId: orderRecord.id,
    eventType: 'order.payment_failed',
    payload: {
      orderId: orderRecord.id,
      workspaceId: scope.context.workspaceId,
      customerEmail: orderRecord.customerEmail,
      failureReason: input.reason,
      providerPaymentId: input.providerPaymentId,
    },
  })

  return {
    success: true,
    order: updatedOrder,
    payment: paymentRecord,
  }
}
