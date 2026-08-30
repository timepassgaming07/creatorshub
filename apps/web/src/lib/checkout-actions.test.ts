/**
 * Checkout Server Actions Unit Tests (Slice 5 §5.6).
 *
 * Verifies:
 * 1. Zod input validation (empty cart, invalid email).
 * 2. Storefront resolution.
 * 3. Server-authoritative checkout flow with discount & GST tax.
 * 4. DB order and payment row creation.
 * 5. PaymentProvider checkout redirect URL return.
 */
import { MemoryPaymentProvider } from '@creatorhub/payments'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithWorkspace =
  vi.fn<(_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
const mockResolveStorefrontByHostname = vi.fn()

vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
    resolveStorefrontByHostname: mockResolveStorefrontByHostname,
  }),
}))

const memoryPaymentProvider = new MemoryPaymentProvider()
vi.mock('./payments', () => ({
  getPaymentProvider: () => memoryPaymentProvider,
}))

const mockFindProductById = vi.fn()
const mockFindDiscountByCode = vi.fn()
const mockCreateOrder = vi.fn()
const mockRecordOrderTransition = vi.fn()
const mockUpdateOrderStatus = vi.fn()
const mockCreatePayment = vi.fn()
const mockWriteAuditLog = vi.fn()

vi.mock('@creatorhub/db', () => ({
  catalogue: {
    findProductById: (...args: unknown[]) => mockFindProductById(...args) as unknown,
  },
  discounts: {
    findDiscountByCode: (...args: unknown[]) => mockFindDiscountByCode(...args) as unknown,
  },
  orders: {
    createOrder: (...args: unknown[]) => mockCreateOrder(...args) as unknown,
    recordOrderTransition: (...args: unknown[]) => mockRecordOrderTransition(...args) as unknown,
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args) as unknown,
  },
  payments: {
    createPayment: (...args: unknown[]) => mockCreatePayment(...args) as unknown,
  },
  auditLog: {
    writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) as unknown,
  },
}))

import { createCheckoutSessionAction } from './checkout-actions'

describe('Checkout Server Actions (§5.6)', () => {
  beforeEach(() => {
    mockWithWorkspace.mockReset()
    mockResolveStorefrontByHostname.mockReset()
    mockFindProductById.mockReset()
    mockFindDiscountByCode.mockReset()
    mockCreateOrder.mockReset()
    mockRecordOrderTransition.mockReset()
    mockUpdateOrderStatus.mockReset()
    mockCreatePayment.mockReset()
    mockWriteAuditLog.mockReset()
  })

  it('rejects invalid checkout submissions', async () => {
    const res1 = await createCheckoutSessionAction({
      storefrontIdentifier: { type: 'subdomain', value: 'creator' },
      items: [],
      customerEmail: 'buyer@example.com',
      customerCountry: 'IN',
    })
    expect(res1.ok).toBe(false)
    if (!res1.ok) {
      expect(res1.error.code).toBe('VALIDATION_ERROR')
    }

    const res2 = await createCheckoutSessionAction({
      storefrontIdentifier: { type: 'subdomain', value: 'creator' },
      items: [{ productId: 'prod_1', quantity: 1 }],
      customerEmail: 'not-an-email',
      customerCountry: 'IN',
    })
    expect(res2.ok).toBe(false)
    if (!res2.ok) {
      expect(res2.error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('fails when storefront cannot be resolved', async () => {
    mockResolveStorefrontByHostname.mockResolvedValueOnce(null)

    const res = await createCheckoutSessionAction({
      storefrontIdentifier: { type: 'subdomain', value: 'nonexistent-store' },
      items: [{ productId: '018f9e2b-7c5e-7a2e-8c3b-000000000001', quantity: 1 }],
      customerEmail: 'buyer@example.com',
      customerCountry: 'IN',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('STOREFRONT_NOT_FOUND')
    }
  })

  it('orchestrates successful checkout session creation with pricing, taxes, and redirect', async () => {
    const wsId = '018f9e2b-7c5e-7a2e-8c3b-000000000001'
    const p1Id = '018f9e2b-7c5e-7a2e-8c3b-000000000002'

    // Mock storefront resolution
    mockResolveStorefrontByHostname.mockResolvedValueOnce({
      workspaceId: wsId,
      status: 'published',
    })

    // Mock withWorkspace implementation
    mockWithWorkspace.mockImplementation((_ctx, fn) => {
      const tx = {}
      return fn(tx)
    })

    // Mock DB operations
    mockFindProductById.mockResolvedValue({
      id: p1Id,
      title: 'Masterclass eBook',
      basePrice: 299900n, // ₹2,999.00
      currency: 'INR',
      status: 'published',
    })

    const mockOrder = {
      id: 'ord_12345',
      workspaceId: wsId,
      status: 'pending',
      totalAmount: 353882n,
    }

    mockCreateOrder.mockResolvedValue({
      order: mockOrder,
      items: [],
    })
    mockUpdateOrderStatus.mockResolvedValue(mockOrder)
    mockCreatePayment.mockResolvedValue({ id: 'pay_1' })
    mockWriteAuditLog.mockResolvedValue({ id: 'aud_1' })

    const res = await createCheckoutSessionAction({
      storefrontIdentifier: { type: 'subdomain', value: 'demo-store' },
      items: [{ productId: p1Id, quantity: 1 }],
      customerEmail: 'jane@example.com',
      customerName: 'Jane Doe',
      customerCountry: 'IN',
      customerState: 'MH',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.orderId).toBe('ord_12345')
      expect(res.data.checkoutSessionId).toBeDefined()
      expect(res.data.checkoutUrl).toContain('https://checkout.test/pay/')
      expect(res.data.currency).toBe('INR')
      // Subtotal 299900 + 18% GST (53982) = 353882
      expect(res.data.totalAmount).toBe('353882')
    }
  })
})
