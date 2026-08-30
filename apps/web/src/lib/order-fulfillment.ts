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
import { createHash, randomBytes } from 'node:crypto'
import {
  basisPoints,
  currency,
  ledgerAccountId,
  money,
  orderId,
  paymentId,
  percentage,
  productId,
  type CurrencyCode,
  type PaymentProviderType,
} from '@creatorhub/contracts'
import {
  auditLog,
  catalogue,
  fulfillment,
  ledger,
  orders,
  outbox,
  payments,
  type OrderRecord,
  type PaymentRowRecord,
  type RepositoryScope,
} from '@creatorhub/db'
import { canTransitionOrderStatus, createOrderPaymentPosting } from '@creatorhub/domain'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

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
  readonly downloadGrants?: readonly {
    readonly rawToken: string
    readonly productTitle: string
    readonly originalFilename: string
    readonly maxDownloads: number
    readonly expiresAt: Date
  }[]
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

  // Idempotency check: if order is already paid, check if ledger transaction already posted
  if (orderRecord.status === 'paid' && orderRecord.paymentStatus === 'paid') {
    const existingPayments = await payments.listPaymentsForOrder(scope, orderRecord.id)
    const capturedPayment =
      existingPayments.find(
        (p) => p.status === 'captured' && p.providerPaymentId === input.providerPaymentId,
      ) ?? existingPayments[0]

    return {
      success: true,
      order: orderRecord,
      payment: capturedPayment ?? {
        id: paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        workspaceId: scope.context.workspaceId,
        orderId: orderRecord.id,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        providerOrderId: null,
        providerSignature: null,
        amount: orderRecord.totalAmount,
        currency: orderRecord.currency,
        status: 'captured',
        method: input.method ?? 'card',
        capturedAt: input.capturedAt ?? new Date(),
        failedAt: null,
        failureReason: null,
        idempotencyKey: ledgerIdempotencyKey,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      idempotentReplay: true,
    }
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
    })
  } else {
    paymentRecord = await payments.createPayment(scope, {
      orderId: orderRecord.id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      amount: input.amount > 0n ? input.amount : orderRecord.totalAmount,
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
  if (input.affiliateCommission && input.affiliateCommission > 0n) {
    const affAcc = await ledger.findOrCreateWorkspaceAccount(scope, 'affiliate_payable', curr)
    affiliatePayableAccId = ledgerAccountId(affAcc.id)
  }

  // 5. Calculate platform fee & double-entry posting proposal
  const grossMoney = money(orderRecord.totalAmount, curr)
  const taxMoney = money(orderRecord.taxAmount, curr)
  const feeBps = basisPoints(input.platformFeeBps ?? 500) // Default 5.00%
  // Platform fee computed on subtotal amount (pre-tax base)
  const baseMoney = money(orderRecord.subtotalAmount, curr)
  const platformFeeMoney = percentage(baseMoney, feeBps)

  const affiliateMoney = input.affiliateCommission
    ? money(input.affiliateCommission, curr)
    : undefined

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
  const ledgerTxResult = await ledger.postTransaction(scope, postingResult.value)

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
      transactionId: ledgerTxResult.transaction.id,
    },
  })

  // 8. Audit log entry
  await auditLog.writeAuditLog(scope, auditOptions, {
    action: 'order.payment_captured',
    targetType: 'order',
    targetId: orderRecord.id,
    actorType: 'system',
    metadata: {
      orderId: orderRecord.id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      totalAmount: orderRecord.totalAmount.toString(),
      currency: orderRecord.currency,
      ledgerTransactionId: ledgerTxResult.transaction.id,
    },
  })

  // 9. Digital Asset Fulfillment: Issue entitlements & download grants (Slice 6)
  const orderWithItems = await orders.findOrderWithItems(scope, orderRecord.id)
  const issuedDownloadGrants: {
    readonly rawToken: string
    readonly productTitle: string
    readonly originalFilename: string
    readonly maxDownloads: number
    readonly expiresAt: Date
  }[] = []

  if (orderWithItems && orderWithItems.items.length > 0) {
    for (const item of orderWithItems.items) {
      // Check existing entitlements to prevent duplicates on idempotent retries
      const existing = await fulfillment.findEntitlementsByOrderId(scope, orderRecord.id)
      const matchingEntitlement = existing.find((e) => e.productId === item.productId)

      const ent =
        matchingEntitlement ??
        (await fulfillment.createEntitlement(scope, {
          orderId: orderRecord.id,
          productId: item.productId,
          customerEmail: orderRecord.customerEmail,
          metadata: {
            productTitle: item.productTitle,
            quantity: item.quantity,
            unitAmount: item.unitAmount.toString(),
          },
        }))

      // Fetch attached digital assets for this product
      const productAssets = await catalogue.listAssetsForProduct(
        scope,
        productId(item.productId),
      )
      for (const pa of productAssets) {
        const rawToken = randomBytes(32).toString('hex')
        const tokenHash = createHash('sha256').update(rawToken).digest('hex')
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        await fulfillment.createDownloadGrant(scope, {
          entitlementId: ent.id,
          assetId: pa.productAsset.assetId,
          tokenHash,
          maxDownloads: 5,
          expiresAt,
        })

        issuedDownloadGrants.push({
          rawToken,
          productTitle: item.productTitle,
          originalFilename: pa.asset.originalFilename,
          maxDownloads: 5,
          expiresAt,
        })
      }
    }
  }

  return {
    success: true,
    order: updatedOrder,
    payment: paymentRecord,
    idempotentReplay: ledgerTxResult.idempotentReplay,
    transactionId: ledgerTxResult.transaction.id,
    downloadGrants: issuedDownloadGrants,
  }
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
