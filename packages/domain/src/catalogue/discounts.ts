/**
 * Discount evaluation domain rules (Implementation Plan §3.6).
 *
 * Responsibilities:
 * Pure domain evaluation for discount coupon codes, usage constraints, validity windows,
 * subtotal thresholds, product restrictions, and exact savings calculation.
 *
 * Invariants:
 * 1. Percentage discounts calculate from basis points (1..10000) using integer math.
 * 2. Fixed amount discounts require matching currency with order subtotal.
 * 3. Discount amount can never exceed subtotal (order total cannot be negative).
 * 4. Inactive, expired, unstarted, or exhausted coupons are rejected with explicit reasons.
 */
import {
  type CurrencyCode,
  type DiscountRecord,
  type Money,
  type ProductId,
  money,
} from '@creatorhub/contracts'

export type DiscountEvaluationContext = {
  readonly now?: Date | undefined
  readonly subtotal: bigint
  readonly currency: CurrencyCode
  readonly productIds?: readonly ProductId[] | undefined
}

export type DiscountEvaluationSuccess = {
  readonly valid: true
  readonly discountAmount: Money
  readonly finalAmount: Money
}

export type DiscountEvaluationFailure = {
  readonly valid: false
  readonly reason: string
  readonly code:
    | 'INACTIVE'
    | 'NOT_STARTED'
    | 'EXPIRED'
    | 'USAGE_EXCEEDED'
    | 'MIN_ORDER_NOT_MET'
    | 'CURRENCY_MISMATCH'
    | 'PRODUCT_NOT_APPLICABLE'
}

export type DiscountEvaluationResult = DiscountEvaluationSuccess | DiscountEvaluationFailure

/**
 * Evaluates whether a discount applies to an order context and calculates exact amounts.
 */
export function evaluateDiscount(
  discount: DiscountRecord,
  context: DiscountEvaluationContext,
  applicableProductIds?: readonly ProductId[],
): DiscountEvaluationResult {
  const now = context.now ?? new Date()

  // 1. Active status check
  if (!discount.isActive) {
    return {
      valid: false,
      code: 'INACTIVE',
      reason: `Coupon code '${discount.code}' is currently inactive.`,
    }
  }

  // 2. Start date check
  if (discount.startsAt && now < discount.startsAt) {
    return {
      valid: false,
      code: 'NOT_STARTED',
      reason: `Coupon code '${discount.code}' is not active yet.`,
    }
  }

  // 3. Expiration check
  if (discount.expiresAt && now > discount.expiresAt) {
    return {
      valid: false,
      code: 'EXPIRED',
      reason: `Coupon code '${discount.code}' has expired.`,
    }
  }

  // 4. Usage limit check
  if (discount.maxUses !== null && discount.usesCount >= discount.maxUses) {
    return {
      valid: false,
      code: 'USAGE_EXCEEDED',
      reason: `Coupon code '${discount.code}' has reached its maximum usage limit.`,
    }
  }

  // 5. Minimum order subtotal check
  if (discount.minOrderAmount !== null && context.subtotal < discount.minOrderAmount) {
    return {
      valid: false,
      code: 'MIN_ORDER_NOT_MET',
      reason: `Minimum order subtotal of ${discount.minOrderAmount.toString()} minor units required for coupon '${discount.code}'.`,
    }
  }

  // 6. Product scope restrictions
  if (applicableProductIds && applicableProductIds.length > 0) {
    const cartProductIds = context.productIds ?? []
    const hasApplicableProduct = cartProductIds.some((cartId) =>
      applicableProductIds.includes(cartId),
    )

    if (!hasApplicableProduct) {
      return {
        valid: false,
        code: 'PRODUCT_NOT_APPLICABLE',
        reason: `Coupon code '${discount.code}' is not applicable to any items in the cart.`,
      }
    }
  }

  // 7. Calculate discount amount
  let discountAmountMinor: bigint

  if (discount.discountType === 'fixed_amount') {
    if (discount.currency && discount.currency !== context.currency) {
      return {
        valid: false,
        code: 'CURRENCY_MISMATCH',
        reason: `Discount currency (${discount.currency}) does not match order currency (${context.currency}).`,
      }
    }

    discountAmountMinor =
      discount.discountValue > context.subtotal ? context.subtotal : discount.discountValue
  } else {
    // Percentage in basis points (e.g. 2000 for 20%)
    const rawDiscount = (context.subtotal * discount.discountValue) / 10_000n
    discountAmountMinor = rawDiscount > context.subtotal ? context.subtotal : rawDiscount
  }

  const finalAmountMinor = context.subtotal - discountAmountMinor

  return {
    valid: true,
    discountAmount: money(discountAmountMinor, context.currency),
    finalAmount: money(finalAmountMinor, context.currency),
  }
}
