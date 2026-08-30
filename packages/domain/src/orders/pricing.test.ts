/**
 * Server-Authoritative Pricing unit tests (Slice 5 §5.4).
 *
 * Verifies:
 * 1. Exact integer arithmetic with minor units (`bigint`).
 * 2. Multi-item subtotal and total calculations.
 * 3. Proportional discount allocation with remainder absorption.
 * 4. Tax calculation via basis points.
 * 5. Rejection of unpurchasable, currency-mismatched, or empty orders.
 * 6. Invariant: Sum of line item totals exactly matches order total.
 */
import { currency, money, productId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import type { DiscountEvaluationSuccess } from '../catalogue/discounts.js'
import { isErr, isOk } from '../result.js'
import {
  CURRENCY_MISMATCH,
  EMPTY_ORDER,
  INVALID_ORDER_QUANTITY,
  PRODUCT_NOT_PURCHASABLE,
  type ServerProductPriceInfo,
  calculateServerOrderPricing,
} from './pricing.js'

const P1_ID = productId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
const P2_ID = productId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
const P3_ID = productId('018f9e2b-7c5e-7a2e-8c3b-000000000003')

const catalog = new Map<string, ServerProductPriceInfo>([
  [
    P1_ID,
    {
      productId: P1_ID,
      title: 'Design Kit Pro',
      price: money(499900n, currency('INR')), // ₹4,999.00
      isPublished: true,
    },
  ],
  [
    P2_ID,
    {
      productId: P2_ID,
      title: 'Icon Pack',
      price: money(150000n, currency('INR')), // ₹1,500.00
      isPublished: true,
    },
  ],
  [
    P3_ID,
    {
      productId: P3_ID,
      title: 'Draft Product',
      price: money(100000n, currency('INR')),
      isPublished: false,
    },
  ],
])

describe('Server-Authoritative Order Pricing (§5.4)', () => {
  it('calculates totals correctly for single-item order without discount or tax', () => {
    const result = calculateServerOrderPricing({
      items: [{ productId: P1_ID, quantity: 2 }],
      catalog,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.currency).toBe('INR')
      expect(result.value.subtotalAmount).toBe(999800n)
      expect(result.value.discountAmount).toBe(0n)
      expect(result.value.taxAmount).toBe(0n)
      expect(result.value.totalAmount).toBe(999800n)
      expect(result.value.items).toHaveLength(1)
      expect(result.value.items[0]?.unitAmount).toBe(499900n)
      expect(result.value.items[0]?.quantity).toBe(2)
      expect(result.value.items[0]?.totalAmount).toBe(999800n)
    }
  })

  it('calculates multi-item order with discount and 18% GST tax', () => {
    const mockDiscount: DiscountEvaluationSuccess = {
      valid: true,
      discountAmount: money(100000n, currency('INR')), // ₹1,000.00 discount
      finalAmount: money(699900n, currency('INR')),
    }

    const result = calculateServerOrderPricing({
      items: [
        { productId: P1_ID, quantity: 1 }, // 499900n
        { productId: P2_ID, quantity: 2 }, // 300000n
      ],
      catalog,
      discount: mockDiscount,
      taxRateBasisPoints: 1800, // 18.00%
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { subtotalAmount, discountAmount, taxAmount, totalAmount, items } = result.value

      // Subtotal: 499900 + 300000 = 799900n
      expect(subtotalAmount).toBe(799900n)
      expect(discountAmount).toBe(100000n)

      // Verify proportional discount allocation:
      // Item 1 discount: (499900 * 100000) / 799900 = 62495n
      // Item 2 discount: 100000 - 62495 = 37505n (absorbs remainder)
      expect(items[0]?.discountAmount).toBe(62495n)
      expect(items[1]?.discountAmount).toBe(37505n)
      expect(items[0]!.discountAmount + items[1]!.discountAmount).toBe(100000n)

      // Item 1 taxable: 499900 - 62495 = 437405n. Tax: (437405 * 1800) / 10000 = 78732n
      // Item 2 taxable: 300000 - 37505 = 262495n. Tax: (262495 * 1800) / 10000 = 47249n
      // Total Tax: 78732 + 47249 = 125981n
      expect(items[0]?.taxAmount).toBe(78732n)
      expect(items[1]?.taxAmount).toBe(47249n)
      expect(taxAmount).toBe(125981n)

      // Total: 799900 - 100000 + 125981 = 825881n
      expect(totalAmount).toBe(825881n)

      // Invariant: sum of item totals equals order total
      const sumOfItemTotals = items.reduce((acc, it) => acc + it.totalAmount, 0n)
      expect(sumOfItemTotals).toBe(totalAmount)
    }
  })

  it('caps discount amount at subtotal to prevent negative totals', () => {
    const hugeDiscount: DiscountEvaluationSuccess = {
      valid: true,
      discountAmount: money(10000000n, currency('INR')), // ₹100,000.00
      finalAmount: money(0n, currency('INR')),
    }

    const result = calculateServerOrderPricing({
      items: [{ productId: P2_ID, quantity: 1 }], // 150000n
      catalog,
      discount: hugeDiscount,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.subtotalAmount).toBe(150000n)
      expect(result.value.discountAmount).toBe(150000n)
      expect(result.value.totalAmount).toBe(0n)
      expect(result.value.items[0]?.totalAmount).toBe(0n)
    }
  })

  it('rejects unpurchasable or draft products', () => {
    const result = calculateServerOrderPricing({
      items: [{ productId: P3_ID, quantity: 1 }],
      catalog,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe(PRODUCT_NOT_PURCHASABLE)
    }
  })

  it('rejects currency mismatch between products', () => {
    const usdProductId = productId('018f9e2b-7c5e-7a2e-8c3b-000000000099')
    const usdCatalog = new Map<string, ServerProductPriceInfo>([
      ...catalog,
      [
        usdProductId,
        {
          productId: usdProductId,
          title: 'USD Product',
          price: money(5000n, currency('USD')),
          isPublished: true,
        },
      ],
    ])

    const result = calculateServerOrderPricing({
      items: [
        { productId: P1_ID, quantity: 1 },
        { productId: usdProductId, quantity: 1 },
      ],
      catalog: usdCatalog,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe(CURRENCY_MISMATCH)
    }
  })

  it('rejects invalid quantities and empty orders', () => {
    const emptyResult = calculateServerOrderPricing({
      items: [],
      catalog,
    })
    expect(isErr(emptyResult)).toBe(true)
    if (isErr(emptyResult)) {
      expect(emptyResult.error.code).toBe(EMPTY_ORDER)
    }

    const zeroQuantityResult = calculateServerOrderPricing({
      items: [{ productId: P1_ID, quantity: 0 }],
      catalog,
    })
    expect(isErr(zeroQuantityResult)).toBe(true)
    if (isErr(zeroQuantityResult)) {
      expect(zeroQuantityResult.error.code).toBe(INVALID_ORDER_QUANTITY)
    }

    const floatQuantityResult = calculateServerOrderPricing({
      items: [{ productId: P1_ID, quantity: 2.5 }],
      catalog,
    })
    expect(isErr(floatQuantityResult)).toBe(true)
    if (isErr(floatQuantityResult)) {
      expect(floatQuantityResult.error.code).toBe(INVALID_ORDER_QUANTITY)
    }
  })
})
