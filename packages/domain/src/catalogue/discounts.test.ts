/**
 * Discount evaluation domain rules tests (Item 3.6).
 */
import {
  currency,
  discountId,
  money,
  productId,
  workspaceId,
  type DiscountRecord,
} from '@creatorhub/contracts'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { evaluateDiscount } from './discounts.js'

const INR = currency('INR')
const USD = currency('USD')
const MOCK_WORKSPACE_ID = workspaceId('018f1a2b-3c4d-7e8f-9012-3456789abcde')
const MOCK_DISCOUNT_ID = discountId('018f1a2b-3c4d-7e8f-9012-3456789abcdf')
const PROD_1 = productId('018f1a2b-3c4d-7e8f-9012-3456789abce1')
const PROD_2 = productId('018f1a2b-3c4d-7e8f-9012-3456789abce2')

function createMockDiscount(overrides?: Partial<DiscountRecord>): DiscountRecord {
  return {
    id: MOCK_DISCOUNT_ID,
    workspaceId: MOCK_WORKSPACE_ID,
    code: 'SAVE20',
    discountType: 'percentage',
    discountValue: 2000n, // 20.00% (2000 basis points)
    currency: null,
    maxUses: 100,
    usesCount: 10,
    startsAt: new Date(Date.now() - 3600_000), // 1 hour ago
    expiresAt: new Date(Date.now() + 3600_000), // 1 hour in future
    minOrderAmount: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('Discount Evaluation - Percentage', () => {
  it('applies percentage discount accurately using basis points', () => {
    const discount = createMockDiscount({
      discountType: 'percentage',
      discountValue: 2000n, // 20%
    })

    const result = evaluateDiscount(discount, {
      subtotal: 1000000n, // 10,000.00 INR
      currency: INR,
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.discountAmount).toEqual(money(200000n, INR)) // 2,000.00 INR
      expect(result.finalAmount).toEqual(money(800000n, INR)) // 8,000.00 INR
    }
  })

  it('caps 100% discount at full subtotal (zero final amount)', () => {
    const discount = createMockDiscount({
      discountType: 'percentage',
      discountValue: 10000n, // 100%
    })

    const result = evaluateDiscount(discount, {
      subtotal: 500000n,
      currency: INR,
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.discountAmount).toEqual(money(500000n, INR))
      expect(result.finalAmount).toEqual(money(0n, INR))
    }
  })
})

describe('Discount Evaluation - Fixed Amount', () => {
  it('applies fixed amount discount in same currency', () => {
    const discount = createMockDiscount({
      discountType: 'fixed_amount',
      discountValue: 50000n, // 500.00 INR
      currency: INR,
    })

    const result = evaluateDiscount(discount, {
      subtotal: 200000n, // 2,000.00 INR
      currency: INR,
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.discountAmount).toEqual(money(50000n, INR))
      expect(result.finalAmount).toEqual(money(150000n, INR))
    }
  })

  it('caps fixed discount to subtotal if discount exceeds subtotal', () => {
    const discount = createMockDiscount({
      discountType: 'fixed_amount',
      discountValue: 500000n, // 5,000.00 INR
      currency: INR,
    })

    const result = evaluateDiscount(discount, {
      subtotal: 200000n, // 2,000.00 INR
      currency: INR,
    })

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.discountAmount).toEqual(money(200000n, INR))
      expect(result.finalAmount).toEqual(money(0n, INR))
    }
  })

  it('rejects fixed discount when currency mismatches order currency', () => {
    const discount = createMockDiscount({
      discountType: 'fixed_amount',
      discountValue: 1000n,
      currency: USD,
    })

    const result = evaluateDiscount(discount, {
      subtotal: 200000n,
      currency: INR,
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.code).toBe('CURRENCY_MISMATCH')
    }
  })
})

describe('Discount Evaluation - Constraints and Rules', () => {
  it('rejects inactive discount', () => {
    const discount = createMockDiscount({ isActive: false })
    const result = evaluateDiscount(discount, { subtotal: 100000n, currency: INR })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('INACTIVE')
  })

  it('rejects unstarted discount', () => {
    const discount = createMockDiscount({
      startsAt: new Date(Date.now() + 3600_000), // In 1 hour
    })
    const result = evaluateDiscount(discount, { subtotal: 100000n, currency: INR })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('NOT_STARTED')
  })

  it('rejects expired discount', () => {
    const discount = createMockDiscount({
      expiresAt: new Date(Date.now() - 3600_000), // 1 hour ago
    })
    const result = evaluateDiscount(discount, { subtotal: 100000n, currency: INR })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('EXPIRED')
  })

  it('rejects when max usage limit is reached', () => {
    const discount = createMockDiscount({
      maxUses: 5,
      usesCount: 5,
    })
    const result = evaluateDiscount(discount, { subtotal: 100000n, currency: INR })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('USAGE_EXCEEDED')
  })

  it('rejects when minimum order subtotal is not met', () => {
    const discount = createMockDiscount({
      minOrderAmount: 500000n, // 5,000.00 INR min
    })
    const result = evaluateDiscount(discount, {
      subtotal: 499900n, // 4,999.00 INR
      currency: INR,
    })

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.code).toBe('MIN_ORDER_NOT_MET')
  })

  it('enforces product scope restrictions', () => {
    const discount = createMockDiscount()

    // 1. Restriction exists, cart does NOT contain allowed product
    const failResult = evaluateDiscount(
      discount,
      { subtotal: 100000n, currency: INR, productIds: [PROD_2] },
      [PROD_1],
    )
    expect(failResult.valid).toBe(false)
    if (!failResult.valid) expect(failResult.code).toBe('PRODUCT_NOT_APPLICABLE')

    // 2. Restriction exists, cart DOES contain allowed product
    const passResult = evaluateDiscount(
      discount,
      { subtotal: 100000n, currency: INR, productIds: [PROD_1, PROD_2] },
      [PROD_1],
    )
    expect(passResult.valid).toBe(true)
  })

  it('conserves money property: discountAmount + finalAmount === subtotal', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 1_000_000_000n }),
        fc.bigInt({ min: 1n, max: 10_000n }),
        (subtotal, basisPoints) => {
          const discount = createMockDiscount({
            discountType: 'percentage',
            discountValue: basisPoints,
          })

          const result = evaluateDiscount(discount, {
            subtotal,
            currency: INR,
          })

          expect(result.valid).toBe(true)
          if (result.valid) {
            expect(result.discountAmount.amount + result.finalAmount.amount).toBe(subtotal)
            expect(result.finalAmount.amount).toBeGreaterThanOrEqual(0n)
            expect(result.discountAmount.amount).toBeGreaterThanOrEqual(0n)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
