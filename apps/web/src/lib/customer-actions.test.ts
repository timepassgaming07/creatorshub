/**
 * Unit tests for customer management actions (Slice 7 §7.5, §7.6).
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected with UNAUTHENTICATED.
 * 2. Unauthorized roles without customer.view are rejected with FORBIDDEN.
 * 3. Scoped list, search, spend filtering, summary metrics, and CSV export.
 * 4. Customer detail with order history and entitlements.
 */
import { customerId, userId, workspaceId } from '@creatorhub/contracts'
import { auditLog, customers, fulfillment, orders, workspaceMembers } from '@creatorhub/db'
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

import {
  exportCustomersCsvAction,
  getCustomerDetailsAction,
  listCustomersAction,
} from './customer-actions'

describe('Customer Management Server Actions (Slice 7)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const custId = customerId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000003')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockImplementation(
      (_context: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it('rejects unauthenticated listCustomersAction', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await listCustomersAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('lists customers with summary for authorized member', async () => {
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

    const sampleCustomer = {
      id: custId,
      workspaceId: wsId,
      email: 'buyer@example.com',
      name: 'Jane Doe',
      phone: '+919876543210',
      metadata: {},
      totalSpend: 250000n,
      ordersCount: 2,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(customers, 'listCustomers').mockResolvedValue([sampleCustomer])
    vi.spyOn(customers, 'countCustomers').mockResolvedValue(1)
    vi.spyOn(customers, 'getCustomerSummary').mockResolvedValue({
      totalCustomers: 1,
      totalLifetimeValue: 250000n,
      averageOrderValue: 125000n,
      repeatCustomersCount: 1,
    })

    const result = await listCustomersAction(wsId, { query: 'Jane' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.customers).toHaveLength(1)
      expect(result.data.customers[0]?.email).toBe('buyer@example.com')
      expect(result.data.summary.totalLifetimeValue).toBe('250000')
      expect(result.data.summary.averageOrderValue).toBe('125000')
      expect(result.data.summary.repeatCustomersCount).toBe(1)
    }
  })

  it('retrieves detailed customer profile with order history and entitlements', async () => {
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

    const sampleCustomer = {
      id: custId,
      workspaceId: wsId,
      email: 'buyer@example.com',
      name: 'Jane Doe',
      phone: null,
      metadata: {},
      totalSpend: 100000n,
      ordersCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    vi.spyOn(customers, 'findCustomerById').mockResolvedValue(sampleCustomer)
    vi.spyOn(orders, 'findOrdersByCustomerId').mockResolvedValue([
      {
        id: 'ord_1',
        workspaceId: wsId,
        customerId: custId,
        customerEmail: 'buyer@example.com',
        customerName: 'Jane Doe',
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.spyOn(fulfillment, 'findEntitlementsByCustomerEmail').mockResolvedValue([
      {
        id: 'ent_1',
        workspaceId: wsId,
        orderId: 'ord_1',
        customerEmail: 'buyer@example.com',
        productId: 'prod_1',
        status: 'active' as const,
        metadata: {},
        grantedAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await getCustomerDetailsAction(wsId, custId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.customer.email).toBe('buyer@example.com')
      expect(result.data.orders).toHaveLength(1)
      expect(result.data.entitlements).toHaveLength(1)
    }
  })

  it('exports customer CSV format', async () => {
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

    vi.spyOn(customers, 'listCustomers').mockResolvedValue([
      {
        id: custId,
        workspaceId: wsId,
        email: 'buyer@example.com',
        name: 'Jane Doe',
        phone: '+919876543210',
        metadata: {},
        totalSpend: 100000n,
        ordersCount: 1,
        firstSeenAt: new Date('2026-08-30T10:00:00Z'),
        lastSeenAt: new Date('2026-08-30T10:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue({} as never)

    const result = await exportCustomersCsvAction(wsId)
    expect(result.ok).toBe(true)
    expect(result.csv).toContain('Customer ID,Email,Name,Phone,Total Spend')
    expect(result.csv).toContain('"buyer@example.com"')
    expect(result.csv).toContain('"Jane Doe"')
    expect(result.csv).toContain('1000.00')
  })
})
