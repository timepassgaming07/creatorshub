/**
 * Pricing model and currency calculation rules (Implementation Plan §3.5).
 *
 * Responsibilities:
 * Pure domain rules for product and variant price resolution, compare-at pricing,
 * discount savings calculations, and workspace currency validation.
 *
 * Invariants:
 * 1. Prices are exact integer minor units (bigint) bound to an ISO 4217 CurrencyCode.
 * 2. Variant priceOverride, when present, supersedes product basePrice.
 * 3. Compare-at price must be greater than base price when set.
 * 4. Percentage savings are integer percentages (0..100).
 */
import { CurrencyMismatchError, type CurrencyCode, type Money, money } from '@creatorhub/contracts'

export class InvalidPricingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPricingError'
  }
}

export type DiscountSavings = {
  readonly percentage: number // e.g. 20 for 20% off
  readonly savedAmount: Money
}

export type ProductPriceInput = {
  readonly currency: CurrencyCode
  readonly basePrice: bigint
  readonly compareAtPrice?: bigint | null
}

export type VariantPriceInput = {
  readonly priceOverride?: bigint | null
}

/**
 * Validates product pricing fields before saving or publishing.
 */
export function validateProductPricing(
  currencyCode: CurrencyCode,
  basePrice: bigint,
  compareAtPrice?: bigint | null,
): void {
  if (basePrice < 0n) {
    throw new InvalidPricingError(
      `Product base price cannot be negative: received ${basePrice.toString()}`,
    )
  }

  if (compareAtPrice !== undefined && compareAtPrice !== null) {
    if (compareAtPrice < 0n) {
      throw new InvalidPricingError(
        `Compare-at price cannot be negative: received ${compareAtPrice.toString()}`,
      )
    }

    if (compareAtPrice <= basePrice) {
      throw new InvalidPricingError(
        `Compare-at price (${compareAtPrice.toString()}) must be strictly greater than base price (${basePrice.toString()}) to represent a valid discount.`,
      )
    }
  }
}

/**
 * Resolves the effective price for a product selection.
 * If the variant specifies a price override, that override is used.
 * Otherwise, the product base price is used.
 */
export function resolveEffectivePrice(
  product: ProductPriceInput,
  variant?: VariantPriceInput | null,
): Money {
  if (variant?.priceOverride !== undefined && variant.priceOverride !== null) {
    if (variant.priceOverride < 0n) {
      throw new InvalidPricingError(
        `Variant price override cannot be negative: received ${variant.priceOverride.toString()}`,
      )
    }
    return money(variant.priceOverride, product.currency)
  }

  return money(product.basePrice, product.currency)
}

/**
 * Computes the savings and percentage discount between a base price and a compare-at price.
 * Returns null if compareAtPrice is null, undefined, or less than or equal to base price.
 */
export function calculateSavings(
  basePrice: Money,
  compareAtPrice?: Money | null,
): DiscountSavings | null {
  if (!compareAtPrice) {
    return null
  }

  if (basePrice.currency !== compareAtPrice.currency) {
    throw new CurrencyMismatchError(basePrice.currency, compareAtPrice.currency)
  }

  if (compareAtPrice.amount <= basePrice.amount) {
    return null
  }

  const saved = compareAtPrice.amount - basePrice.amount
  // Integer percentage: (saved * 100) / compareAtPrice
  const percentage = Number((saved * 100n) / compareAtPrice.amount)

  return {
    percentage,
    savedAmount: money(saved, basePrice.currency),
  }
}
