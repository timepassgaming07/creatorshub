/**
 * Public checkout actions: what they let through from the browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkout = {
  quoteCheckout: vi.fn(),
  startCheckout: vi.fn(),
  confirmPayment: vi.fn(),
  completeTestPayment: vi.fn(),
  resendBuyerLinks: vi.fn(),
}
vi.mock('./checkout', () => ({
  quoteCheckout: (...a: unknown[]) => checkout.quoteCheckout(...a) as unknown,
  startCheckout: (...a: unknown[]) => checkout.startCheckout(...a) as unknown,
  confirmPayment: (...a: unknown[]) => checkout.confirmPayment(...a) as unknown,
  completeTestPayment: (...a: unknown[]) => checkout.completeTestPayment(...a) as unknown,
  resendBuyerLinks: (...a: unknown[]) => checkout.resendBuyerLinks(...a) as unknown,
}))

let cookieValue: string | undefined
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}))

import { formatReferralCookie } from './referral'
import {
  confirmPaymentAction,
  getCheckoutQuoteAction,
  startCheckoutAction,
} from './checkout-actions'

const PRODUCT = '018f9e2b-7c5e-7a2e-8c3b-000000000005'
const ORDER = '018f9e2b-7c5e-7a2e-8c3b-000000000010'

const base = {
  host: 'priya',
  line: { productId: PRODUCT },
  buyer: { country: 'in', stateCode: '29' },
}

describe('checkout actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieValue = undefined
  })

  it('never passes a price from the browser to checkout', async () => {
    checkout.quoteCheckout.mockResolvedValue({ ok: true, quote: {} })
    await getCheckoutQuoteAction({ ...base, price: 1, amount: 1, totalAmount: 1 } as never)
    const passed = checkout.quoteCheckout.mock.calls[0]?.[0] as Record<string, unknown>
    expect(JSON.stringify(passed)).not.toMatch(/price|amount/i)
    expect(passed).toMatchObject({
      store: { host: 'priya' },
      buyer: { country: 'IN', stateCode: '29' },
    })
  })

  it('rejects malformed input before checkout runs', async () => {
    const badProduct = await getCheckoutQuoteAction({ ...base, line: { productId: 'not-a-uuid' } })
    const badEmail = await startCheckoutAction({ ...base, email: 'nope', name: 'Ravi' })
    const badGstin = await startCheckoutAction({
      ...base,
      email: 'ravi@example.com',
      name: 'Ravi',
      buyer: { country: 'IN', stateCode: '29', gstin: '12345' },
    })
    for (const result of [badProduct, badEmail, badGstin]) {
      expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
    }
    expect(checkout.quoteCheckout).not.toHaveBeenCalled()
    expect(checkout.startCheckout).not.toHaveBeenCalled()
  })

  it('carries the referral for this store only', async () => {
    checkout.startCheckout.mockResolvedValue({ ok: true })
    cookieValue = formatReferralCookie('priya', 'rohan', new Date('2026-10-01T10:00:00Z'))
    await startCheckoutAction({ ...base, email: 'Ravi@Example.com', name: 'Ravi' })
    expect(checkout.startCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: 'ravi@example.com',
        referral: { code: 'rohan', clickedAt: '2026-10-01T10:00:00.000Z' },
      }),
    )

    cookieValue = formatReferralCookie('another-store', 'rohan', new Date())
    await startCheckoutAction({ ...base, email: 'ravi@example.com', name: 'Ravi' })
    expect(checkout.startCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ referral: null }),
    )
  })

  it('says nothing was charged when checkout fails, without internal detail', async () => {
    checkout.startCheckout.mockRejectedValue(new Error('relation "orders" does not exist'))
    const result = await startCheckoutAction({ ...base, email: 'ravi@example.com', name: 'Ravi' })
    expect(result).toMatchObject({ ok: false, code: 'CHECKOUT_FAILED' })
    expect(JSON.stringify(result)).not.toContain('relation')
    expect(JSON.stringify(result)).toContain('Nothing was charged')
  })

  it('needs a payment id and signature to confirm', async () => {
    const result = await confirmPaymentAction({
      host: 'priya',
      orderId: ORDER,
      providerPaymentId: '',
      signature: '',
    })
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' })
    expect(checkout.confirmPayment).not.toHaveBeenCalled()
  })
})
