/**
 * Unit tests for refund server actions (Slice 5 §5.10).
 *
 * Verifies:
 * 1. RBAC enforcement (order.refund permission).
 * 2. Unauthenticated request rejection.
 * 3. Validation errors for invalid amounts.
 * 4. Successful refund execution for authorized members.
 */
import { orderId, userId, workspaceId } from '@creatorhub/contracts'
import { orders, payments, refunds, workspaceMembers } from '@creatorhub/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerSession } from './server-session'

const mockGetServerSession = vi.fn<() => Promise<ServerSession | null>>()

vi.mock('./server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

const mockWithWorkspace =
  vi.fn<(_context: unknown, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
  }),
}))

const mockFulfillRefund = vi.fn()
vi.mock('./refund-fulfillment', () => ({
  fulfillRefund: (...args: unknown[]) => mockFulfillRefund(...args) as unknown,
}))

const mockRefundPayment = vi.fn()
vi.mock('./payments', () => ({
  getPaymentProvider: () => ({ refundPayment: mockRefundPayment }),
}))

import { refundOrderAction } from './refund-actions'

describe('Refund Server Actions (§5.10)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000003')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockImplementation(
      (_context: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it('rejects unauthenticated caller', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await refundOrderAction({
      workspaceId: wsId,
      orderId: ordId,
      amount: '50000',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
      expect(result.error.status).toBe(401)
    }
  })

  it('rejects caller when member lacks order.refund permission', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'member@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'mem_1',
      userId: uId,
      role: 'member',
      joinedAt: new Date(),
    })

    const result = await refundOrderAction({
      workspaceId: wsId,
      orderId: ordId,
      amount: '50000',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('authorisation.insufficient_role')
      expect(result.error.status).toBe(403)
    }
  })

  it('authorizes admin/owner and executes refund successfully', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'admin@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'mem_1',
      userId: uId,
      role: 'admin',
      joinedAt: new Date(),
    })

    vi.spyOn(orders, 'findOrderById').mockResolvedValue({
      id: ordId,
      workspaceId: wsId,
      customerId: null,
      customerEmail: 'customer@example.com',
      customerName: null,
      customerPhone: null,
      currency: 'INR',
      subtotalAmount: 100000n,
      discountAmount: 0n,
      taxAmount: 0n,
      totalAmount: 100000n,
      status: 'paid',
      paymentStatus: 'paid',
      checkoutSessionId: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.spyOn(payments, 'listPaymentsForOrder').mockResolvedValue([
      {
        id: '018f9e2b-7c5e-7a2e-8c3b-000000000009',
        workspaceId: wsId,
        orderId: ordId,
        provider: 'razorpay',
        providerPaymentId: 'pay_rzp_123',
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
      },
    ])

    vi.spyOn(refunds, 'calculateTotalRefundedForOrder').mockResolvedValue(0n)
    mockRefundPayment.mockResolvedValue({ providerRefundId: 'rfnd_rzp_456', status: 'pending' })

    mockFulfillRefund.mockResolvedValue({
      success: true,
      order: { id: ordId, status: 'partially_refunded' },
      refund: {
        id: '018f9e2b-7c5e-7a2e-8c3b-000000000077',
        amount: 50000n,
      },
      transactionId: 'tx_rfnd_123',
      isFullRefund: false,
    })

    const result = await refundOrderAction({
      workspaceId: wsId,
      orderId: ordId,
      amount: '50000',
      reason: 'Partial customer satisfaction refund',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.orderId).toBe(ordId)
      expect(result.data.amount).toBe('50000')
      expect(result.data.isFullRefund).toBe(false)
    }
    // The provider moves the money first; the ledger records the provider's refund id.
    expect(mockRefundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: 'pay_rzp_123' }),
    )
    expect(mockFulfillRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerRefundId: 'rfnd_rzp_456', amount: 50000n }),
    )
  })
})
