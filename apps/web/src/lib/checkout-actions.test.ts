/**
 * Checkout Server Actions Unit Tests (Slice 5 §5.6, §5.11).
 *
 * Verifies:
 * 1. Zod input validation (empty cart, invalid email).
 * 2. Storefront resolution.
 * 3. Server-authoritative checkout flow with discount & GST tax.
 * 4. DB order and payment row creation.
 * 5. PaymentProvider checkout redirect URL return.
 * 6. Real-time estimate calculation with dynamic discount and GST states.
 * 7. Order summary fetching for success/fulfillment.
 * 8. Payment retry flow.
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

const mockFulfillPaidOrder = vi.fn().mockResolvedValue({
  success: true,
  order: { id: 'ord_12345', status: 'paid', paymentStatus: 'paid' },
})
vi.mock('./order-fulfillment', () => ({
  fulfillPaidOrder: (...args: unknown[]) => mockFulfillPaidOrder(...args) as unknown,
}))

const mockFindProductById = vi.fn()
const mockListAssetsForProduct = vi.fn()
const mockFindDiscountByCode = vi.fn()
const mockCreateOrder = vi.fn()
const mockFindOrderById = vi.fn()
const mockFindOrderWithItems = vi.fn()
const mockRecordOrderTransition = vi.fn()
const mockUpdateOrderStatus = vi.fn()
const mockCreatePayment = vi.fn()
const mockListPaymentsForOrder = vi.fn()
const mockWriteAuditLog = vi.fn()
const mockFindStorefrontByWorkspaceId = vi.fn()
const mockFindCurrentWorkspace = vi.fn()

vi.mock('@creatorhub/db', () => ({
  catalogue: {
    findProductById: (...args: unknown[]) => mockFindProductById(...args) as unknown,
    listAssetsForProduct: (...args: unknown[]) => mockListAssetsForProduct(...args) as unknown,
  },
  discounts: {
    findDiscountByCode: (...args: unknown[]) => mockFindDiscountByCode(...args) as unknown,
  },
  orders: {
    createOrder: (...args: unknown[]) => mockCreateOrder(...args) as unknown,
    findOrderById: (...args: unknown[]) => mockFindOrderById(...args) as unknown,
    findOrderWithItems: (...args: unknown[]) => mockFindOrderWithItems(...args) as unknown,
    recordOrderTransition: (...args: unknown[]) => mockRecordOrderTransition(...args) as unknown,
    updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args) as unknown,
  },
  payments: {
    createPayment: (...args: unknown[]) => mockCreatePayment(...args) as unknown,
    listPaymentsForOrder: (...args: unknown[]) => mockListPaymentsForOrder(...args) as unknown,
  },
  storefronts: {
    findStorefrontByWorkspaceId: (...args: unknown[]) =>
      mockFindStorefrontByWorkspaceId(...args) as unknown,
  },
  workspaces: {
    findCurrentWorkspace: (...args: unknown[]) => mockFindCurrentWorkspace(...args) as unknown,
  },
  auditLog: {
    writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) as unknown,
  },
}))

import {
  calculateCheckoutEstimateAction,
  createCheckoutSessionAction,
  getPublicCheckoutProductData,
  getPublicOrderSummaryAction,
  retryPaymentAction,
} from './checkout-actions'

describe('Checkout Server Actions (§5.6, §5.11)', () => {
  beforeEach(() => {
    mockWithWorkspace.mockReset()
    mockResolveStorefrontByHostname.mockReset()
    mockFindProductById.mockReset()
    mockListAssetsForProduct.mockReset()
    mockFindDiscountByCode.mockReset()
    mockCreateOrder.mockReset()
    mockFindOrderById.mockReset()
    mockFindOrderWithItems.mockReset()
    mockRecordOrderTransition.mockReset()
    mockUpdateOrderStatus.mockReset()
    mockCreatePayment.mockReset()
    mockListPaymentsForOrder.mockReset()
    mockWriteAuditLog.mockReset()
    mockFindStorefrontByWorkspaceId.mockReset()
    mockFindCurrentWorkspace.mockReset()
    mockFulfillPaidOrder.mockReset()
    mockFulfillPaidOrder.mockResolvedValue({
      success: true,
      order: { id: 'ord_12345', status: 'paid', paymentStatus: 'paid' },
    })

    mockWithWorkspace.mockImplementation((_ctx, fn) => {
      const tx = {}
      return fn(tx)
    })
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

    mockResolveStorefrontByHostname.mockResolvedValueOnce({
      workspaceId: wsId,
      status: 'published',
    })

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
      expect(res.data.totalAmount).toBe('353882')
    }
  })

  it('orchestrates instant free order creation and fulfillment without payment gateway redirect', async () => {
    const wsId = '018f9e2b-7c5e-7a2e-8c3b-000000000001'
    const freeProdId = '018f9e2b-7c5e-7a2e-8c3b-000000000099'

    mockResolveStorefrontByHostname.mockResolvedValueOnce({
      workspaceId: wsId,
      status: 'published',
    })

    mockFindProductById.mockResolvedValue({
      id: freeProdId,
      title: 'Free Lead Magnet Guide',
      basePrice: 0n, // ₹0.00 Free download
      currency: 'INR',
      status: 'published',
    })

    const mockFreeOrder = {
      id: 'ord_free_123',
      workspaceId: wsId,
      status: 'pending',
      totalAmount: 0n,
    }

    mockCreateOrder.mockResolvedValue({
      order: mockFreeOrder,
      items: [],
    })

    const res = await createCheckoutSessionAction({
      storefrontIdentifier: { type: 'subdomain', value: 'demo-store' },
      items: [{ productId: freeProdId, quantity: 1 }],
      customerEmail: 'lead@example.com',
      customerName: 'Lead Magnet Subscriber',
      customerCountry: 'IN',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.orderId).toBe('ord_free_123')
      expect(res.data.totalAmount).toBe('0')
      expect(res.data.checkoutUrl).toBe('/checkout/ord_free_123')
      expect(res.data.checkoutSessionId).toContain('free_sess_')
    }

    expect(mockFulfillPaidOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'ord_free_123',
        provider: 'memory',
        amount: 0n,
        method: 'free_claim',
      }),
    )
  })

  it('calculates live checkout estimate with GST breakdown', async () => {
    const p1Id = '018f9e2b-7c5e-7a2e-8c3b-000000000002'

    mockFindProductById.mockResolvedValue({
      id: p1Id,
      title: 'UI Kit Pro',
      basePrice: 100000n, // ₹1,000.00
      currency: 'INR',
      status: 'published',
    })

    const res = await calculateCheckoutEstimateAction({
      workspaceId: '018f9e2b-7c5e-7a2e-8c3b-000000000001',
      productId: p1Id,
      quantity: 1,
      customerCountry: 'IN',
      customerState: 'Maharashtra',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.subtotalAmount).toBe('100000')
      expect(res.data.discountAmount).toBe('0')
      expect(res.data.taxAmount).toBe('18000') // 18% GST = ₹180.00
      expect(res.data.totalAmount).toBe('118000')
      expect(res.data.currency).toBe('INR')
      expect(res.data.taxBreakdown.length).toBeGreaterThan(0)
    }
  })

  it('fetches public checkout product data', async () => {
    const p1Id = '018f9e2b-7c5e-7a2e-8c3b-000000000002'

    mockFindProductById.mockResolvedValue({
      id: p1Id,
      title: 'Full Stack Course',
      slug: 'full-stack-course',
      description: 'Learn modern web engineering.',
      basePrice: 499900n,
      compareAtPrice: 999900n,
      currency: 'INR',
      status: 'published',
    })

    mockListAssetsForProduct.mockResolvedValue([
      {
        asset: { id: 'ast_1', originalFilename: 'course.zip', byteSize: 1048576n },
        productAsset: { role: 'deliverable' },
      },
    ])

    mockFindStorefrontByWorkspaceId.mockResolvedValue({
      id: 'sf_1',
      title: 'Dev Academy',
      subdomain: 'devacademy',
      customDomain: null,
      themeConfig: { accentColor: '#4f46e5', fontPreset: 'sans', layoutPreset: 'showcase' },
    })

    mockFindCurrentWorkspace.mockResolvedValue({
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000001',
      name: 'Dev Workspace',
      defaultCurrency: 'INR',
    })

    const res = await getPublicCheckoutProductData({
      productId: p1Id,
      workspaceId: '018f9e2b-7c5e-7a2e-8c3b-000000000001',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.product.title).toBe('Full Stack Course')
      expect(res.data.product.deliverableAssets.length).toBe(1)
      expect(res.data.storefront.title).toBe('Dev Academy')
    }
  })

  it('retrieves public order summary for paid orders including digital deliverables', async () => {
    const ordId = '018f9e2b-7c5e-7a2e-8c3b-000000000099'

    mockFindOrderWithItems.mockResolvedValue({
      order: {
        id: ordId,
        status: 'paid',
        paymentStatus: 'paid',
        customerEmail: 'customer@example.com',
        customerName: 'Jane Customer',
        subtotalAmount: 100000n,
        discountAmount: 0n,
        taxAmount: 18000n,
        totalAmount: 118000n,
        currency: 'INR',
        checkoutSessionId: 'sess_123',
        createdAt: new Date('2026-08-30T10:00:00Z'),
      },
      items: [
        {
          id: '018f9e2b-7c5e-7a2e-8c3b-000000000088',
          productId: '018f9e2b-7c5e-7a2e-8c3b-000000000002',
          productTitle: 'Pro Design Kit',
          quantity: 1,
          unitAmount: 100000n,
          totalAmount: 118000n,
        },
      ],
    })

    mockListAssetsForProduct.mockResolvedValue([
      {
        asset: { id: 'ast_1', originalFilename: 'design-kit.fig', byteSize: 2048576n },
        productAsset: { role: 'deliverable' },
      },
    ])

    const res = await getPublicOrderSummaryAction(ordId)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.orderId).toBe(ordId)
      expect(res.data.status).toBe('paid')
      expect(res.data.deliverables.length).toBe(1)
      expect(res.data.deliverables[0]?.originalFilename).toBe('design-kit.fig')
    }
  })

  it('handles payment retry for unpaid orders', async () => {
    const ordId = '018f9e2b-7c5e-7a2e-8c3b-000000000099'

    mockFindOrderById.mockResolvedValue({
      id: ordId,
      status: 'requires_payment',
      customerEmail: 'customer@example.com',
      totalAmount: 118000n,
      currency: 'INR',
    })

    mockCreatePayment.mockResolvedValue({ id: 'pay_retry_1' })
    mockWriteAuditLog.mockResolvedValue({ id: 'aud_retry_1' })

    const res = await retryPaymentAction(ordId)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.orderId).toBe(ordId)
      expect(res.data.checkoutUrl).toBeDefined()
    }
  })
})
