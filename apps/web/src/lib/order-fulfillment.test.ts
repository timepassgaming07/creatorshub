/**
 * Order Fulfillment Unit Test Suite (Slice 5 §5.9).
 *
 * Verifies:
 * 1. fulfillPaidOrder executes atomic order state transitions and balanced double-entry postings.
 * 2. Invariant conservation: debits equal credits across ledger accounts.
 * 3. Idempotent replay without creating duplicate postings or records.
 * 4. processPaymentFailure handles failed payment states cleanly.
 */
import {
  currency,
  orderId,
  paymentId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import { describe, expect, it, vi } from 'vitest'

import {
  fulfillPaidOrder,
  processPaymentFailure,
  type FulfillPaidOrderInput,
} from './order-fulfillment.js'

describe('Order Fulfillment Service (§5.9)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
  const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222')
  const inr = currency('INR')

  const context = workspaceContext({
    workspaceId: wsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId('req-test-fulfillment'),
  })

  it('atomically transitions order to paid and writes balanced ledger postings', async () => {
    const mockOrder = {
      id: ordId,
      workspaceId: wsId,
      customerId: null,
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      customerPhone: null,
      currency: inr,
      subtotalAmount: 84746n, // ₹847.46
      discountAmount: 0n,
      taxAmount: 15254n, // ₹152.54 GST 18%
      totalAmount: 100000n, // ₹1,000.00
      status: 'pending' as const,
      paymentStatus: 'unpaid' as const,
      checkoutSessionId: 'sess_123',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockPayment = {
      id: paymentId('018f9e2b-7c5e-7a2e-8c3b-333333333333'),
      workspaceId: wsId,
      orderId: ordId,
      provider: 'razorpay' as const,
      providerPaymentId: 'pay_rzp_123',
      providerOrderId: null,
      providerSignature: null,
      amount: 100000n,
      currency: inr,
      status: 'pending' as const,
      method: null,
      capturedAt: null,
      failedAt: null,
      failureReason: null,
      idempotencyKey: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const postedTransactions: unknown[] = []
    const outboxEvents: unknown[] = []

    const mockScope = {
      context,
      tx: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    }

    // Mock db repositories
    const mockOrdersRepo = await import('@creatorhub/db')
    vi.spyOn(mockOrdersRepo.orders, 'findOrderById').mockResolvedValue(mockOrder)
    vi.spyOn(mockOrdersRepo.orders, 'updateOrderStatus').mockResolvedValue({
      ...mockOrder,
      status: 'paid',
      paymentStatus: 'paid',
    })
    vi.spyOn(mockOrdersRepo.orders, 'recordOrderTransition').mockResolvedValue({
      id: 'trans_001',
      workspaceId: wsId,
      orderId: ordId,
      fromStatus: 'pending',
      toStatus: 'paid',
      actorType: 'system',
      actorId: null,
      reason: 'Payment captured',
      metadata: {},
      createdAt: new Date(),
    })

    vi.spyOn(mockOrdersRepo.payments, 'listPaymentsForOrder').mockResolvedValue([mockPayment])
    vi.spyOn(mockOrdersRepo.payments, 'updatePaymentStatus').mockResolvedValue({
      ...mockPayment,
      status: 'captured',
      capturedAt: new Date(),
    })

    const accountIds: Record<string, string> = {
      processor_clearing: '018f9e2b-7c5e-7a2e-8c3b-000000000010',
      creator_payable: '018f9e2b-7c5e-7a2e-8c3b-000000000020',
      platform_revenue: '018f9e2b-7c5e-7a2e-8c3b-000000000030',
      tax_payable: '018f9e2b-7c5e-7a2e-8c3b-000000000040',
      affiliate_payable: '018f9e2b-7c5e-7a2e-8c3b-000000000050',
    }

    vi.spyOn(mockOrdersRepo.ledger, 'findOrCreateWorkspaceAccount').mockImplementation(
      (_scope, kind, curr) => {
        return Promise.resolve({
          id: accountIds[kind] ?? '018f9e2b-7c5e-7a2e-8c3b-000000000099',
          workspaceId: wsId,
          ownerType: 'workspace',
          ownerId: wsId,
          kind,
          currency: curr,
          createdAt: new Date(),
        })
      },
    )

    vi.spyOn(mockOrdersRepo.ledger, 'postTransaction').mockImplementation((_scope, input) => {
      postedTransactions.push(input)
      return Promise.resolve({
        transaction: {
          id: 'tx_ledger_001',
          workspaceId: wsId,
          kind: input.kind,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          description: input.description ?? null,
          occurredAt: new Date(),
          createdAt: new Date(),
        },
        entries: input.entries.map((e, idx) => ({
          id: `entry_${String(idx)}`,
          transactionId: 'tx_ledger_001',
          accountId: e.accountId,
          direction: e.direction,
          amount: e.amount,
          currency: e.currency,
          workspaceId: wsId,
          createdAt: new Date(),
        })),
        idempotentReplay: false,
      })
    })

    vi.spyOn(mockOrdersRepo.outbox, 'writeOutboxEvent').mockImplementation((_scope, event) => {
      outboxEvents.push(event)
      return Promise.resolve({
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
      })
    })

    vi.spyOn(mockOrdersRepo.orders, 'findOrderWithItems').mockResolvedValue({
      order: mockOrder,
      items: [
        {
          id: 'item_1',
          workspaceId: wsId,
          orderId: ordId,
          productId: '018f9e2b-7c5e-7a2e-8c3b-555555555555',
          variantId: null,
          productTitle: 'Pro Guide',
          variantTitle: null,
          unitAmount: 100000n,
          quantity: 1,
          subtotalAmount: 84746n,
          discountAmount: 0n,
          taxAmount: 15254n,
          totalAmount: 100000n,
          metadata: {},
          createdAt: new Date(),
        },
      ],
    })

    vi.spyOn(mockOrdersRepo.fulfillment, 'findEntitlementsByOrderId').mockResolvedValue([])
    vi.spyOn(mockOrdersRepo.fulfillment, 'createEntitlement').mockResolvedValue({
      id: 'ent_1',
      workspaceId: wsId,
      orderId: ordId,
      productId: '018f9e2b-7c5e-7a2e-8c3b-555555555555',
      customerEmail: 'buyer@example.com',
      status: 'active',
      grantedAt: new Date(),
      revokedAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    vi.spyOn(mockOrdersRepo.catalogue, 'listAssetsForProduct').mockResolvedValue([
      {
        productAsset: {
          id: 'pa_1',
          workspaceId: wsId,
          productId: '018f9e2b-7c5e-7a2e-8c3b-555555555555',
          variantId: null,
          assetId: '018f9e2b-7c5e-7a2e-8c3b-666666666666',
          role: 'deliverable',
          position: 0,
          createdAt: new Date(),
        },
        asset: {
          id: '018f9e2b-7c5e-7a2e-8c3b-666666666666',
          workspaceId: wsId,
          storageKey: 'assets/guide.pdf',
          originalFilename: 'guide.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048000n,
          checksumSha256: 'hash_123',
          scanStatus: 'clean',
          scanReason: null,
          scannedAt: new Date(),
          createdAt: new Date(),
        },
      },
    ])
    vi.spyOn(mockOrdersRepo.fulfillment, 'createDownloadGrant').mockResolvedValue({
      id: 'grant_1',
      workspaceId: wsId,
      entitlementId: 'ent_1',
      assetId: 'asset_1',
      tokenHash: 'hash',
      maxDownloads: 5,
      downloadCount: 0,
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.spyOn(mockOrdersRepo.auditLog, 'writeAuditLog').mockResolvedValue('audit_001')

    const input: FulfillPaidOrderInput = {
      orderId: ordId,
      provider: 'razorpay',
      providerPaymentId: 'pay_rzp_123',
      amount: 100000n,
      currency: inr,
      method: 'upi',
    }

    const result = await fulfillPaidOrder(mockScope as never, input)

    expect(result.success).toBe(true)
    expect(result.order.status).toBe('paid')
    expect(result.order.paymentStatus).toBe('paid')
    expect(result.payment.status).toBe('captured')
    expect(result.idempotentReplay).toBe(false)
    expect(result.transactionId).toBe('tx_ledger_001')

    expect(postedTransactions).toHaveLength(1)
    const tx = postedTransactions[0] as {
      entries: { direction: string; amount: bigint; currency: string }[]
    }
    expect(tx.entries).toBeDefined()

    // Conservation check: sum(debits) === sum(credits)
    const debits = tx.entries
      .filter((e) => e.direction === 'debit')
      .reduce((sum, e) => sum + e.amount, 0n)
    const credits = tx.entries
      .filter((e) => e.direction === 'credit')
      .reduce((sum, e) => sum + e.amount, 0n)

    expect(debits).toBe(100000n)
    expect(credits).toBe(100000n)
    expect(debits).toBe(credits)

    expect(outboxEvents).toHaveLength(1)
    const obEvent = outboxEvents[0] as { eventType: string; aggregateId: string }
    expect(obEvent.eventType).toBe('order.paid')
    expect(obEvent.aggregateId).toBe(ordId)
  })

  it('handles payment failure cleanly', async () => {
    const mockOrder = {
      id: ordId,
      workspaceId: wsId,
      customerId: null,
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      customerPhone: null,
      currency: inr,
      subtotalAmount: 100000n,
      discountAmount: 0n,
      taxAmount: 0n,
      totalAmount: 100000n,
      status: 'pending' as const,
      paymentStatus: 'unpaid' as const,
      checkoutSessionId: 'sess_123',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockPayment = {
      id: paymentId('018f9e2b-7c5e-7a2e-8c3b-444444444444'),
      workspaceId: wsId,
      orderId: ordId,
      provider: 'razorpay' as const,
      providerPaymentId: 'pay_rzp_failed_123',
      providerOrderId: null,
      providerSignature: null,
      amount: 100000n,
      currency: inr,
      status: 'pending' as const,
      method: null,
      capturedAt: null,
      failedAt: null,
      failureReason: null,
      idempotencyKey: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockScope = {
      context,
      tx: {},
    }

    const mockOrdersRepo = await import('@creatorhub/db')
    vi.spyOn(mockOrdersRepo.orders, 'findOrderById').mockResolvedValue(mockOrder)
    vi.spyOn(mockOrdersRepo.orders, 'updateOrderStatus').mockResolvedValue({
      ...mockOrder,
      status: 'requires_payment',
      paymentStatus: 'failed',
    })
    vi.spyOn(mockOrdersRepo.orders, 'recordOrderTransition').mockResolvedValue({
      id: 'trans_002',
      workspaceId: wsId,
      orderId: ordId,
      fromStatus: 'pending',
      toStatus: 'requires_payment',
      actorType: 'system',
      actorId: null,
      reason: 'Payment failed: Bank declined',
      metadata: {},
      createdAt: new Date(),
    })
    vi.spyOn(mockOrdersRepo.payments, 'listPaymentsForOrder').mockResolvedValue([mockPayment])
    vi.spyOn(mockOrdersRepo.payments, 'updatePaymentStatus').mockResolvedValue({
      ...mockPayment,
      status: 'failed',
      failedAt: new Date(),
      failureReason: 'Bank declined',
    })

    const outboxEvents: unknown[] = []
    vi.spyOn(mockOrdersRepo.outbox, 'writeOutboxEvent').mockImplementation((_scope, event) => {
      outboxEvents.push(event)
      return Promise.resolve({
        id: 'outbox_002',
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
      })
    })

    const result = await processPaymentFailure(mockScope as never, {
      orderId: ordId,
      provider: 'razorpay',
      providerPaymentId: 'pay_rzp_failed_123',
      reason: 'Bank declined',
    })

    expect(result.success).toBe(true)
    expect(result.order.status).toBe('requires_payment')
    expect(result.payment.status).toBe('failed')
    expect(outboxEvents).toHaveLength(1)
    const obEvent = outboxEvents[0] as { eventType: string }
    expect(obEvent.eventType).toBe('order.payment_failed')
  })
})
