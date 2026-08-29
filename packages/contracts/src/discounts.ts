/**
 * Discount contracts and shared types (Implementation Plan §3.6).
 *
 * Responsibilities:
 * Define schemas, types, and validation for multi-tenant discounts and coupon codes.
 *
 * Invariants:
 * 1. Percentage discounts use basis points (1..10000) representing 0.01% to 100%.
 * 2. Fixed amount discounts are non-negative minor units (bigint) bound to a CurrencyCode.
 * 3. Coupon codes are uppercase alphanumeric strings (2..50 chars).
 */
import { z } from 'zod'

import {
  type DiscountId,
  type ProductId,
  type WorkspaceId,
  productIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import { type CurrencyCode, currency } from './money.js'

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

export const DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]
export const discountTypeSchema = z.enum(DISCOUNT_TYPES)

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{2,50}$/
export const couponCodeSchema = z
  .string()
  .min(2)
  .max(50)
  .transform((v) => v.trim().toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        COUPON_CODE_PATTERN,
        'Coupon code must be 2-50 uppercase letters, numbers, hyphens, or underscores.',
      ),
  )

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code.')
  .transform((v) => currency(v))

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const createDiscountInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  code: couponCodeSchema,
  discountType: discountTypeSchema,
  discountValue: z.bigint().min(1n),
  currency: currencyCodeSchema.nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  minOrderAmount: z.bigint().min(0n).nullable().optional(),
  productIds: z.array(productIdSchema).optional(),
  isActive: z.boolean().default(true),
})

export type CreateDiscountInput = {
  readonly workspaceId?: WorkspaceId | undefined
  readonly code: string
  readonly discountType: DiscountType
  readonly discountValue: bigint
  readonly currency?: CurrencyCode | null | undefined
  readonly maxUses?: number | null | undefined
  readonly startsAt?: Date | null | undefined
  readonly expiresAt?: Date | null | undefined
  readonly minOrderAmount?: bigint | null | undefined
  readonly productIds?: readonly ProductId[] | undefined
  readonly isActive?: boolean | undefined
}

export const discountEvaluationContextSchema = z.object({
  now: z.coerce.date().default(() => new Date()),
  subtotal: z.bigint().min(0n),
  currency: currencyCodeSchema,
  productIds: z.array(productIdSchema).optional(),
})

export type DiscountEvaluationContext = {
  readonly now?: Date | undefined
  readonly subtotal: bigint
  readonly currency: CurrencyCode
  readonly productIds?: readonly ProductId[] | undefined
}

export type DiscountRecord = {
  readonly id: DiscountId
  readonly workspaceId: WorkspaceId
  readonly code: string
  readonly discountType: DiscountType
  readonly discountValue: bigint
  readonly currency: CurrencyCode | null
  readonly maxUses: number | null
  readonly usesCount: number
  readonly startsAt: Date | null
  readonly expiresAt: Date | null
  readonly minOrderAmount: bigint | null
  readonly isActive: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}
