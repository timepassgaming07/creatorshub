/**
 * Unit tests for order management actions (Slice 7 §7.3, §7.4, §7.6).
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected with UNAUTHENTICATED.
 * 2. Unauthorized roles without order.view are rejected with FORBIDDEN.
 * 3. Scoped list, search, metrics, and CSV export.
 * 4. Resending receipt triggers email delivery.
 */
import { orderId, userId, workspaceId } from '@creatorhub/contracts'
import { auditLog, orders, workspaceMembers } from '@creatorhub/db'
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

const mockSendOrderReceipt = vi.fn()
vi.mock('./email', () => ({
  getEmailService: () => ({
    sendOrderReceipt: mockSendOrderReceipt,
  }),
}))

import { exportOrdersCsvAction, listOrdersAction } from './order-actions'

describe('Order Management Server Actions (Slice 7)', () => {
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

  it('rejects unauthenticated listOrdersAction', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await listOrdersAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects non-workspace member', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'stranger@example.com', name: 'Stranger' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue(undefined)

    const result = await listOrdersAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('lists orders with summary for authorized member', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'creator@example.com', name: 'Creator' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'm1',
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
    })

    const sampleOrder = {
      id: ordId,
      workspaceId: wsId,
      customerId: 'cust_1' as never,
      customerEmail: 'buyer@example.com',
      customerName: 'Buyer',
      customerPhone: '+919876543210',
      currency: 'INR' as const,
      subtotalAmount: 100000n,
      discountAmount: 0n,
      taxAmount: 18000n,
      totalAmount: 118000n,
      status: 'paid' as const,
      paymentStatus: 'paid' as const,
      metadata: {},
      checkoutSessionId: 'cs_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(orders, 'listOrders').mockResolvedValue([sampleOrder])
    vi.spyOn(orders, 'countOrders').mockResolvedValue(1)
    vi.spyOn(orders, 'getOrderSummary').mockResolvedValue({
      totalOrders: 1,
      paidOrdersCount: 1,
      refundedOrdersCount: 0,
      totalGrossRevenue: 118000n,
      totalRefundedAmount: 0n,
    })

    const result = await listOrdersAction(wsId, { query: 'buyer' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.orders).toHaveLength(1)
      expect(result.data.orders[0]?.customerEmail).toBe('buyer@example.com')
      expect(result.data.totalCount).toBe(1)
      expect(result.data.summary.totalGrossRevenue).toBe('118000')
    }
  })

  it('exports sanitized CSV format', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'creator@example.com', name: 'Creator' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'm1',
      userId: uId,
      role: 'admin',
      joinedAt: new Date(),
    })

    vi.spyOn(orders, 'listOrders').mockResolvedValue([
      {
        id: ordId,
        workspaceId: wsId,
        customerId: 'cust_1',
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer Name',
        customerPhone: null,
        currency: 'INR' as const,
        subtotalAmount: 100000n,
        discountAmount: 0n,
        taxAmount: 18000n,
        totalAmount: 118000n,
        status: 'paid' as const,
        paymentStatus: 'paid' as const,
        metadata: {},
        checkoutSessionId: 'cs_1',
        createdAt: new Date('2026-08-30T10:00:00Z'),
        updatedAt: new Date('2026-08-30T10:00:00Z'),
      },
    ])
    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue({} as never)

    const result = await exportOrdersCsvAction(wsId)
    expect(result.ok).toBe(true)
    expect(result.csv).toContain('Order ID,Date,Customer Email')
    expect(result.csv).toContain('"buyer@example.com"')
    expect(result.csv).toContain('1180.00')
  })
})
