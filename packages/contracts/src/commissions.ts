/**
 * Commission, Holds, and Clawback Contracts (Slice 9 §9.1).
 *
 * Responsibilities:
 * 1. Define schemas, types, and DTOs for the commission lifecycle.
 * 2. Define state machine values for commissions and clawbacks.
 * 3. Guarantee zero-float financial representations for payouts and reversals.
 */
import { z } from 'zod'

import {
  type AffiliateId,
  type AttributionId,
  type CommissionId,
  type OrderId,
  type RefundId,
  affiliateIdSchema,
  attributionIdSchema,
  commissionIdSchema,
  orderIdSchema,
  refundIdSchema,
} from './identifiers.js'
import { type CurrencyCode } from './money.js'
import { currencySchema, moneyAmountSchema } from './catalogue.js'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const COMMISSION_STATUSES = ['pending', 'held', 'vested', 'paid', 'clawed_back'] as const
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number]
export const commissionStatusSchema = z.enum(COMMISSION_STATUSES)

export const CLAWBACK_STATUSES = ['applied', 'uncollectable'] as const
export type ClawbackStatus = (typeof CLAWBACK_STATUSES)[number]
export const clawbackStatusSchema = z.enum(CLAWBACK_STATUSES)

// ---------------------------------------------------------------------------
// Schemas & DTOs
// ---------------------------------------------------------------------------

export const createCommissionSchema = z.object({
  attributionId: attributionIdSchema,
  affiliateId: affiliateIdSchema,
  orderId: orderIdSchema,
  grossSaleAmount: moneyAmountSchema,
  commissionBps: z.number().int().min(0).max(10_000),
  grossAmount: moneyAmountSchema,
  heldUntil: z.date(),
  currency: currencySchema,
})

export type CreateCommissionInput = {
  readonly attributionId: AttributionId
  readonly affiliateId: AffiliateId
  readonly orderId: OrderId
  readonly grossSaleAmount: bigint
  readonly commissionBps: number
  readonly grossAmount: bigint
  readonly heldUntil: Date
  readonly currency: CurrencyCode
}

export const createClawbackSchema = z.object({
  commissionId: commissionIdSchema,
  refundId: refundIdSchema,
  amount: moneyAmountSchema,
  reason: z.string().min(1).max(500),
  status: clawbackStatusSchema.default('applied'),
})

export type CreateClawbackInput = {
  readonly commissionId: CommissionId
  readonly refundId: RefundId
  readonly amount: bigint
  readonly reason: string
  readonly status?: ClawbackStatus
}

export type CommissionDTO = {
  readonly id: string
  readonly workspaceId: string
  readonly attributionId: string
  readonly affiliateId: string
  readonly orderId: string
  readonly grossSaleAmount: string
  readonly commissionBps: number
  readonly grossAmount: string
  readonly netAmount: string
  readonly status: CommissionStatus
  readonly heldUntil: string
  readonly vestedAt: string | null
  readonly paidAt: string | null
  readonly clawedBackAt: string | null
  readonly clawbackReason: string | null
  readonly currency: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type ClawbackDTO = {
  readonly id: string
  readonly workspaceId: string
  readonly commissionId: string
  readonly refundId: string
  readonly amount: string
  readonly status: ClawbackStatus
  readonly reason: string
  readonly createdAt: string
}

export type AffiliateLedgerBreakdown = {
  readonly pendingMinor: bigint
  readonly heldMinor: bigint
  readonly vestedMinor: bigint
  readonly paidMinor: bigint
  readonly clawedBackMinor: bigint
  readonly totalEarnedMinor: bigint
}

export type AffiliateLedgerBreakdownDTO = {
  readonly pendingAmount: string
  readonly heldAmount: string
  readonly vestedAmount: string
  readonly paidAmount: string
  readonly clawedBackAmount: string
  readonly totalEarnedAmount: string
  readonly currency: string
}
