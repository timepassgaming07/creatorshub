/**
 * Server-Authoritative Order Pricing (Slice 5 §5.4).
 *
 * Responsibilities:
 * 1. Compute order totals strictly from server-resolved state.
 * 2. Prevent client price/amount tampering.
 * 3. Proportional discount allocation and exact integer rounding.
 * 4. Exact zero-float minor unit arithmetic (`bigint`).
 *
 * Invariants:
 * - Line item subtotal = quantity * unitPrice.
 * - Total discount <= subtotal.
 * - Total amount = subtotal - discount + tax.
 * - Sum of item totals equals order total.
 */
import type { CurrencyCode, Money, ProductId, VariantId } from '@creatorhub/contracts'

import type { DiscountEvaluationSuccess } from '../catalogue/discounts.js'
import { domainError, err, ok, type Result } from '../result.js'

export const EMPTY_ORDER = 'EMPTY_ORDER'
export const INVALID_ORDER_QUANTITY = 'INVALID_ORDER_QUANTITY'
export const PRODUCT_NOT_PURCHASABLE = 'PRODUCT_NOT_PURCHASABLE'
export const CURRENCY_MISMATCH = 'CURRENCY_MISMATCH'
export const PRICING_CALCULATION_ERROR = 'PRICING_CALCULATION_ERROR'

export type ServerProductPriceInfo = {
  readonly productId: ProductId
  readonly variantId?: VariantId | null | undefined
  readonly title: string
  readonly price: Money
  readonly isPublished: boolean
}

export type CheckoutItemInput = {
  readonly productId: ProductId
  readonly variantId?: VariantId | null | undefined
  readonly quantity: number
}

export type CalculateOrderPricingInput = {
  readonly items: readonly CheckoutItemInput[]
  readonly catalog: ReadonlyMap<string, ServerProductPriceInfo>
  readonly discount?: DiscountEvaluationSuccess | null | undefined
  readonly taxRateBasisPoints?: number | undefined // e.g. 1800 for 18.00%
}

export type CalculatedLineItem = {
  readonly productId: ProductId
  readonly variantId: VariantId | null
  readonly title: string
  readonly unitAmount: bigint
  readonly quantity: number
  readonly subtotalAmount: bigint
  readonly discountAmount: bigint
  readonly taxAmount: bigint
  readonly totalAmount: bigint
}

export type CalculatedOrderPricing = {
  readonly currency: CurrencyCode
  readonly subtotalAmount: bigint
  readonly discountAmount: bigint
  readonly taxAmount: bigint
  readonly totalAmount: bigint
  readonly items: readonly CalculatedLineItem[]
}

/**
 * Calculates complete, verified server-authoritative order pricing.
 */
export function calculateServerOrderPricing(
  input: CalculateOrderPricingInput,
): Result<CalculatedOrderPricing> {
  if (input.items.length === 0) {
    return err(
      domainError({
        code: EMPTY_ORDER,
        title: 'Empty Order',
        detail: 'Cannot create an order with zero items.',
        action: 'Add at least one product to the cart.',
      }),
    )
  }

  let orderCurrency: CurrencyCode | null = null
  let runningSubtotal = 0n

  type ResolvedItem = {
    readonly input: CheckoutItemInput
    readonly info: ServerProductPriceInfo
    readonly lineSubtotal: bigint
  }

  const resolvedItems: ResolvedItem[] = []

  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return err(
        domainError({
          code: INVALID_ORDER_QUANTITY,
          title: 'Invalid Quantity',
          detail: `Quantity for product '${item.productId}' must be a positive integer.`,
          action: 'Select a quantity of at least 1.',
        }),
      )
    }

    const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId
    const product = input.catalog.get(key) ?? input.catalog.get(item.productId)

    if (!product?.isPublished) {
      return err(
        domainError({
          code: PRODUCT_NOT_PURCHASABLE,
          title: 'Product Not Available',
          detail: `Product '${item.productId}' is not available for purchase.`,
          action: 'Remove unavailable products from your cart.',
        }),
      )
    }

    if (orderCurrency === null) {
      orderCurrency = product.price.currency
    } else if (orderCurrency !== product.price.currency) {
      return err(
        domainError({
          code: CURRENCY_MISMATCH,
          title: 'Currency Mismatch',
          detail: `Product '${product.title}' has currency '${product.price.currency}', expected '${orderCurrency}'.`,
          action: 'All products in an order must be sold in the same currency.',
        }),
      )
    }

    const lineSubtotal = product.price.amount * BigInt(item.quantity)
    runningSubtotal += lineSubtotal

    resolvedItems.push({
      input: item,
      info: product,
      lineSubtotal,
    })
  }

  if (orderCurrency === null) {
    return err(
      domainError({
        code: PRICING_CALCULATION_ERROR,
        title: 'Pricing Error',
        detail: 'Failed to determine order currency.',
        action: 'Try again with valid items.',
      }),
    )
  }

  // Calculate discount
  let totalDiscount = 0n
  if (input.discount) {
    totalDiscount = input.discount.discountAmount.amount
    if (totalDiscount > runningSubtotal) {
      totalDiscount = runningSubtotal
    }
  }

  // Allocate discount across line items proportionally
  const taxRate = BigInt(input.taxRateBasisPoints ?? 0)
  const lineItems: CalculatedLineItem[] = []
  let allocatedDiscount = 0n
  let runningTax = 0n

  for (let i = 0; i < resolvedItems.length; i++) {
    const item = resolvedItems[i]
    if (!item) continue

    let itemDiscount = 0n
    if (totalDiscount > 0n && runningSubtotal > 0n) {
      if (i === resolvedItems.length - 1) {
        // Last item absorbs remainder to guarantee exact sum
        itemDiscount = totalDiscount - allocatedDiscount
      } else {
        itemDiscount = (item.lineSubtotal * totalDiscount) / runningSubtotal
        allocatedDiscount += itemDiscount
      }
    }

    const itemTaxableAmount = item.lineSubtotal - itemDiscount
    const itemTax = (itemTaxableAmount * taxRate) / 10000n
    runningTax += itemTax

    const itemTotal = itemTaxableAmount + itemTax

    lineItems.push({
      productId: item.info.productId,
      variantId: item.input.variantId ?? null,
      title: item.info.title,
      unitAmount: item.info.price.amount,
      quantity: item.input.quantity,
      subtotalAmount: item.lineSubtotal,
      discountAmount: itemDiscount,
      taxAmount: itemTax,
      totalAmount: itemTotal,
    })
  }

  const finalTotal = runningSubtotal - totalDiscount + runningTax

  return ok({
    currency: orderCurrency,
    subtotalAmount: runningSubtotal,
    discountAmount: totalDiscount,
    taxAmount: runningTax,
    totalAmount: finalTotal,
    items: lineItems,
  })
}
