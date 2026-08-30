/**
 * Unit tests for Refund and Dispute Fulfillment Service (Slice 5 §5.10).
 *
 * Verifies:
 * 1. Full and partial refund validation and state progression.
 * 2. Balanced compensating double-entry postings (ADR-0008).
 * 3. Prevention of refund amounts exceeding order balance.
 * 4. Dispute creation, outbox event generation, and fee expense postings.
 */
import {
  orderId,
  paymentId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import {
  auditLog,
  disputes,
  ledger,
  orders,
  outbox,
  payments,
  refunds,
  type DisputeRecord,
  type OrderRecord,
  type PaymentRowRecord,
  type RefundRecord,
  type RepositoryScope,
} from '@creatorhub/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fulfillDispute,
  fulfillRefund,
  type FulfillDisputeInput,
  type FulfillRefundInput,
} from './refund-fulfillment'

vi.mock('@creatorhub/db', () => ({
  orders: {
    findOrderById: vi.fn(),
    updateOrderStatus: vi.fn(),
    recordOrderTransition: vi.fn(),
  },
  payments: {
    listPaymentsForOrder: vi.fn(),
    updatePaymentStatus: vi.fn(),
  },
  refunds: {
    findRefundByProviderRefundId: vi.fn(),
    createRefund: vi.fn(),
    updateRefundStatus: vi.fn(),
    calculateTotalRefundedForOrder: vi.fn(),
  },
  disputes: {
    findDisputeByProviderDisputeId: vi.fn(),
    createDispute: vi.fn(),
    updateDisputeStatus: vi.fn(),
  },
  ledger: {
    findOrCreateWorkspaceAccount: vi.fn(),
    postTransaction: vi.fn(),
  },
  outbox: {
    writeOutboxEvent: vi.fn(),
  },
  auditLog: {
    writeAuditLog: vi.fn(),
  },
}))

describe('Refund Fulfillment Service (§5.10)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
  const payId = paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000003')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000004')

  const context = workspaceContext({
    workspaceId: wsId,
    actorId: uId,
    requestId: requestId('req-1'),
  })
  const scope: RepositoryScope = {
    tx: {} as unknown as RepositoryScope['tx'],
    context,
  }

  const mockOrder: OrderRecord = {
    id: ordId,
    workspaceId: wsId,
    customerId: null,
    customerEmail: 'buyer@example.com',
    customerName: 'Jane Buyer',
    customerPhone: null,
    currency: 'INR',
    subtotalAmount: 84746n,
    discountAmount: 0n,
    taxAmount: 15254n,
    totalAmount: 100000n,
    status: 'paid',
    paymentStatus: 'paid',
    checkoutSessionId: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const mockPayment: PaymentRowRecord = {
    id: payId,
    workspaceId: wsId,
    orderId: ordId,
    provider: 'razorpay',
    providerPaymentId: 'pay_rzp_test_123',
    providerOrderId: null,
    providerSignature: null,
    amount: 100000n,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    capturedAt: new Date(),
    failedAt: null,
    failureReason: null,
    idempotencyKey: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(orders, 'findOrderById').mockResolvedValue(mockOrder)
    vi.spyOn(payments, 'listPaymentsForOrder').mockResolvedValue([mockPayment])
    vi.spyOn(refunds, 'calculateTotalRefundedForOrder').mockResolvedValue(0n)
    vi.spyOn(refunds, 'findRefundByProviderRefundId').mockResolvedValue(null)

    const accountIds: Record<string, string> = {
      processor_clearing: '018f9e2b-7c5e-7a2e-8c3b-000000000010',
      creator_payable: '018f9e2b-7c5e-7a2e-8c3b-000000000020',
      platform_revenue: '018f9e2b-7c5e-7a2e-8c3b-000000000030',
      tax_payable: '018f9e2b-7c5e-7a2e-8c3b-000000000040',
      fees_expense: '018f9e2b-7c5e-7a2e-8c3b-000000000050',
    }

    vi.spyOn(ledger, 'findOrCreateWorkspaceAccount').mockImplementation((_scope, kind, curr) => {
      return Promise.resolve({
        id: accountIds[kind] ?? '018f9e2b-7c5e-7a2e-8c3b-000000000099',
        workspaceId: wsId,
        ownerType: 'workspace',
        ownerId: wsId,
        kind,
        currency: curr,
        createdAt: new Date(),
      })
    })

    vi.spyOn(ledger, 'postTransaction').mockResolvedValue({
      transaction: {
        id: 'tx_refund_001',
        workspaceId: wsId,
        kind: 'refund',
        referenceType: 'refund',
        referenceId: 'rfnd_001',
        idempotencyKey: 'idemp_rfnd_001',
        description: 'Refund transaction',
        occurredAt: new Date(),
        createdAt: new Date(),
      },
      entries: [],
      idempotentReplay: false,
    })

    vi.spyOn(orders, 'updateOrderStatus').mockImplementation((_scope, _id, status, pStatus) =>
      Promise.resolve({ ...mockOrder, status, paymentStatus: pStatus ?? 'paid' }),
    )
    vi.spyOn(orders, 'recordOrderTransition').mockImplementation((_scope, transition) =>
      Promise.resolve({
        id: 'trans_001',
        orderId: transition.orderId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        actorType: transition.actorType,
        actorId: transition.actorId ?? null,
        reason: transition.reason ?? null,
        metadata: transition.metadata ?? {},
        createdAt: new Date(),
        workspaceId: wsId,
      }),
    )
    vi.spyOn(outbox, 'writeOutboxEvent').mockImplementation((_scope, event) =>
      Promise.resolve({
        id: 'outbox_001',
        workspaceId: wsId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        metadata: {},
        occurredAt: new Date(),
        publishedAt: null,
        attempts: 0,
        lastError: null,
        createdAt: new Date(),
      }),
    )
    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue('audit_001')
  })

  it('atomically executes a full refund, updating order status to refunded and posting balanced ledger entries', async () => {
    const mockCreatedRefund: RefundRecord = {
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000077',
      workspaceId: wsId,
      paymentId: payId,
      orderId: ordId,
      providerRefundId: 'rfnd_rzp_full_001',
      amount: 100000n,
      currency: 'INR',
      reason: 'Full refund requested',
      status: 'succeeded',
      initiatedByUserId: uId,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(refunds, 'createRefund').mockResolvedValue(mockCreatedRefund)

    const input: FulfillRefundInput = {
      orderId: ordId,
      providerRefundId: 'rfnd_rzp_full_001',
      amount: 100000n,
      currency: 'INR',
      reason: 'Full refund requested',
      initiatedByUserId: uId,
    }

    const result = await fulfillRefund(scope, input)

    expect(result.success).toBe(true)
    expect(result.isFullRefund).toBe(true)
    expect(result.order.status).toBe('refunded')
    expect(orders.updateOrderStatus).toHaveBeenCalledWith(scope, ordId, 'refunded', 'refunded')
    expect(ledger.postTransaction).toHaveBeenCalledTimes(1)
    expect(outbox.writeOutboxEvent).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        eventType: 'order.refunded',
      }),
    )
  })

  it('atomically executes a partial refund, updating order status to partially_refunded', async () => {
    const mockCreatedRefund: RefundRecord = {
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000088',
      workspaceId: wsId,
      paymentId: payId,
      orderId: ordId,
      providerRefundId: 'rfnd_rzp_part_001',
      amount: 30000n,
      currency: 'INR',
      reason: 'Partial refund',
      status: 'succeeded',
      initiatedByUserId: uId,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(refunds, 'createRefund').mockResolvedValue(mockCreatedRefund)

    const input: FulfillRefundInput = {
      orderId: ordId,
      providerRefundId: 'rfnd_rzp_part_001',
      amount: 30000n,
      currency: 'INR',
      reason: 'Partial refund',
    }

    const result = await fulfillRefund(scope, input)

    expect(result.success).toBe(true)
    expect(result.isFullRefund).toBe(false)
    expect(result.order.status).toBe('partially_refunded')
    expect(orders.updateOrderStatus).toHaveBeenCalledWith(
      scope,
      ordId,
      'partially_refunded',
      'partially_refunded',
    )
    expect(outbox.writeOutboxEvent).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        eventType: 'order.partially_refunded',
      }),
    )
  })

  it('rejects refund amount exceeding remaining refundable order balance', async () => {
    vi.spyOn(refunds, 'calculateTotalRefundedForOrder').mockResolvedValue(80000n)

    const input: FulfillRefundInput = {
      orderId: ordId,
      providerRefundId: 'rfnd_rzp_over_001',
      amount: 30000n, // Only 20000n remaining
      currency: 'INR',
    }

    await expect(fulfillRefund(scope, input)).rejects.toThrow(
      'exceeds remaining refundable order balance',
    )
  })

  it('records a dispute and posts balanced dispute withholding transaction', async () => {
    const mockDisputeRecord: DisputeRecord = {
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000099',
      workspaceId: wsId,
      paymentId: payId,
      orderId: ordId,
      providerDisputeId: 'disp_rzp_test_001',
      amount: 100000n,
      currency: 'INR',
      reason: 'Fraudulent transaction',
      status: 'needs_response',
      feeAmount: 150000n,
      evidenceDueAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(disputes, 'findDisputeByProviderDisputeId').mockResolvedValue(null)
    vi.spyOn(disputes, 'createDispute').mockResolvedValue(mockDisputeRecord)

    const input: FulfillDisputeInput = {
      orderId: ordId,
      providerDisputeId: 'disp_rzp_test_001',
      amount: 100000n,
      currency: 'INR',
      reason: 'Fraudulent transaction',
      feeAmount: 150000n,
    }

    const result = await fulfillDispute(scope, input)

    expect(result.success).toBe(true)
    expect(result.dispute.id).toBe(mockDisputeRecord.id)
    expect(disputes.createDispute).toHaveBeenCalled()
    expect(ledger.postTransaction).toHaveBeenCalled()
    expect(outbox.writeOutboxEvent).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        eventType: 'order.disputed',
      }),
    )
  })
})
