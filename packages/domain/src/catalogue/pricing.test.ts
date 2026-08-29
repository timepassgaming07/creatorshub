/**
 * Pricing model and currency calculation tests (Item 3.5).
 */
import { CurrencyMismatchError, currency, money } from '@creatorhub/contracts'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  calculateSavings,
  InvalidPricingError,
  resolveEffectivePrice,
  validateProductPricing,
} from './pricing.js'

const INR = currency('INR')
const USD = currency('USD')

describe('Product Pricing Validation', () => {
  it('accepts valid base price and optional compare-at price', () => {
    expect(() => {
      validateProductPricing(INR, 49900n)
    }).not.toThrow()

    expect(() => {
      validateProductPricing(INR, 49900n, null)
    }).not.toThrow()

    expect(() => {
      validateProductPricing(INR, 49900n, 99900n)
    }).not.toThrow()
  })

  it('rejects negative base price', () => {
    expect(() => {
      validateProductPricing(INR, -100n)
    }).toThrow(InvalidPricingError)
  })

  it('rejects compare-at price less than or equal to base price', () => {
    expect(() => {
      validateProductPricing(INR, 50000n, 50000n)
    }).toThrow(InvalidPricingError)

    expect(() => {
      validateProductPricing(INR, 50000n, 40000n)
    }).toThrow(InvalidPricingError)

    expect(() => {
      validateProductPricing(INR, 50000n, -100n)
    }).toThrow(InvalidPricingError)
  })
})

describe('Effective Price Resolution', () => {
  it('returns base price when variant is null or has no override', () => {
    const prod = { currency: INR, basePrice: 299900n }

    expect(resolveEffectivePrice(prod)).toEqual(money(299900n, INR))
    expect(resolveEffectivePrice(prod, null)).toEqual(money(299900n, INR))
    expect(resolveEffectivePrice(prod, { priceOverride: null })).toEqual(money(299900n, INR))
  })

  it('returns variant price override when present', () => {
    const prod = { currency: INR, basePrice: 299900n }
    const variant = { priceOverride: 149900n }

    expect(resolveEffectivePrice(prod, variant)).toEqual(money(149900n, INR))
  })

  it('rejects negative variant price override', () => {
    const prod = { currency: INR, basePrice: 299900n }
    const variant = { priceOverride: -500n }

    expect(() => {
      resolveEffectivePrice(prod, variant)
    }).toThrow(InvalidPricingError)
  })
})

describe('Discount Savings Calculator', () => {
  it('calculates exact savings amount and integer percentage', () => {
    const base = money(499900n, INR) // 4,999.00
    const compare = money(999900n, INR) // 9,999.00

    const savings = calculateSavings(base, compare)
    expect(savings).not.toBeNull()
    expect(savings?.percentage).toBe(50)
    expect(savings?.savedAmount).toEqual(money(500000n, INR))
  })

  it('returns null when compare-at price is absent or not greater than base', () => {
    const base = money(50000n, INR)

    expect(calculateSavings(base, null)).toBeNull()
    expect(calculateSavings(base, money(50000n, INR))).toBeNull()
    expect(calculateSavings(base, money(40000n, INR))).toBeNull()
  })

  it('throws CurrencyMismatchError if currencies differ', () => {
    const inrPrice = money(100000n, INR)
    const usdPrice = money(200000n, USD)

    expect(() => {
      calculateSavings(inrPrice, usdPrice)
    }).toThrow(CurrencyMismatchError)
  })

  it('preserves conservation of money property across arbitrary positive amounts', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 1_000_000_000n }),
        fc.bigInt({ min: 1n, max: 1_000_000_000n }),
        (amount1, diff) => {
          const base = money(amount1, INR)
          const compare = money(amount1 + diff, INR)

          const savings = calculateSavings(base, compare)
          expect(savings).not.toBeNull()
          if (savings) {
            // Conservation of money: saved + base = compare
            expect(savings.savedAmount.amount + base.amount).toBe(compare.amount)
            expect(savings.percentage).toBeGreaterThanOrEqual(0)
            expect(savings.percentage).toBeLessThanOrEqual(100)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
