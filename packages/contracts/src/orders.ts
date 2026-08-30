/**
 * Order domain contracts and schemas (Slice 5 §5.2, §5.3).
 *
 * Responsibilities:
 * - Define order status enums, order item representations, and state transitions.
 * - Enforce Money minor unit schemas and branded identifiers.
 */
import { z } from 'zod'

import {
  orderIdSchema,
  orderItemIdSchema,
  orderTransitionIdSchema,
  productIdSchema,
  userIdSchema,
  variantIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import { moneySchema } from './money.js'

export const ORDER_STATUSES = [
  'pending',
  'requires_payment',
  'processing',
  'paid',
  'cancelled',
  'refunded',
  'partially_refunded',
  'failed',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const orderStatusSchema = z.enum(ORDER_STATUSES)

export const ORDER_PAYMENT_STATUSES = [
  'unpaid',
  'authorized',
  'paid',
  'refunded',
  'partially_refunded',
  'failed',
] as const
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number]
export const orderPaymentStatusSchema = z.enum(ORDER_PAYMENT_STATUSES)

export const ORDER_TRANSITION_ACTOR_TYPES = ['system', 'customer', 'member', 'webhook'] as const
export type OrderTransitionActorType = (typeof ORDER_TRANSITION_ACTOR_TYPES)[number]
export const orderTransitionActorTypeSchema = z.enum(ORDER_TRANSITION_ACTOR_TYPES)

export const orderItemSchema = z.object({
  id: orderItemIdSchema,
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  productId: productIdSchema,
  variantId: variantIdSchema.nullable().optional(),
  productTitle: z.string().min(1).max(255),
  variantTitle: z.string().max(255).nullable().optional(),
  unitAmount: moneySchema,
  quantity: z.number().int().positive(),
  subtotalAmount: moneySchema,
  discountAmount: moneySchema,
  taxAmount: moneySchema,
  totalAmount: moneySchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
})
export type OrderItem = z.infer<typeof orderItemSchema>

export const orderTransitionSchema = z.object({
  id: orderTransitionIdSchema,
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  fromStatus: orderStatusSchema,
  toStatus: orderStatusSchema,
  reason: z.string().nullable().optional(),
  actorType: orderTransitionActorTypeSchema,
  actorId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
})
export type OrderTransition = z.infer<typeof orderTransitionSchema>

export const orderSchema = z.object({
  id: orderIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: userIdSchema.nullable().optional(),
  customerEmail: z.email(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  currency: z.string().length(3),
  subtotalAmount: moneySchema,
  discountAmount: moneySchema,
  taxAmount: moneySchema,
  totalAmount: moneySchema,
  status: orderStatusSchema,
  paymentStatus: orderPaymentStatusSchema,
  checkoutSessionId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type Order = z.infer<typeof orderSchema>
