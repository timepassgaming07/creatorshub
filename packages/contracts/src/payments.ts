/**
 * Payment and payment account domain contracts (Slice 5 §5.2).
 *
 * Responsibilities:
 * - Define payment records, provider names, and connected account schemas.
 */
import { z } from 'zod'

import {
  orderIdSchema,
  paymentAccountIdSchema,
  paymentIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import { moneySchema } from './money.js'

export const PAYMENT_PROVIDERS = ['razorpay', 'stripe', 'memory'] as const
export type PaymentProviderType = (typeof PAYMENT_PROVIDERS)[number]
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS)

export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
] as const
export type PaymentStatusType = (typeof PAYMENT_STATUSES)[number]
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES)

export const PAYMENT_ACCOUNT_STATUSES = [
  'created',
  'onboarding_pending',
  'under_review',
  'active',
  'restricted',
  'disabled',
] as const
export type PaymentAccountStatus = (typeof PAYMENT_ACCOUNT_STATUSES)[number]
export const paymentAccountStatusSchema = z.enum(PAYMENT_ACCOUNT_STATUSES)

export const paymentAccountSchema = z.object({
  id: paymentAccountIdSchema,
  workspaceId: workspaceIdSchema,
  provider: paymentProviderSchema,
  providerAccountId: z.string().min(1),
  country: z.string().length(2),
  defaultCurrency: z.string().length(3),
  status: paymentAccountStatusSchema,
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type PaymentAccount = z.infer<typeof paymentAccountSchema>

export const paymentRecordSchema = z.object({
  id: paymentIdSchema,
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  provider: paymentProviderSchema,
  providerPaymentId: z.string().min(1),
  providerOrderId: z.string().nullable().optional(),
  providerSignature: z.string().nullable().optional(),
  amount: moneySchema,
  status: paymentStatusSchema,
  method: z.string().nullable().optional(),
  capturedAt: z.date().nullable().optional(),
  failedAt: z.date().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type PaymentRecord = z.infer<typeof paymentRecordSchema>
