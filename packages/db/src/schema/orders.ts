/**
 * Orders and Order State Machine Schema (Slice 5 §5.2, §5.3).
 *
 * Responsibilities:
 * - Define `orders`, `order_items`, and `order_transitions` tables.
 * - Enforce multi-tenancy: Every table carries a non-null `workspace_id` referencing `workspaces(id)`.
 * - Enforce exact integer minor unit monetary values (zero-float rule).
 * - Maintain an immutable audit log of order transitions.
 */
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  ORDER_TRANSITION_ACTOR_TYPES,
} from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { products, productVariants } from './catalogue.js'
import { users, workspaces } from './identity.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orderStatus = pgEnum('order_status', ORDER_STATUSES)
export const orderPaymentStatus = pgEnum('order_payment_status', ORDER_PAYMENT_STATUSES)
export const orderTransitionActorType = pgEnum(
  'order_transition_actor_type',
  ORDER_TRANSITION_ACTOR_TYPES,
)

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------

export const orders = pgTable(
  'orders',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    customerId: uuid('customer_id').references(() => users.id, { onDelete: 'set null' }),

    customerEmail: citext('customer_email').notNull(),
    customerName: varchar('customer_name', { length: 255 }),
    customerPhone: varchar('customer_phone', { length: 50 }),

    currency: varchar('currency', { length: 3 }).notNull(),

    subtotalAmount: bigint('subtotal_amount', { mode: 'bigint' }).notNull(),
    discountAmount: bigint('discount_amount', { mode: 'bigint' }).notNull().default(0n),
    taxAmount: bigint('tax_amount', { mode: 'bigint' }).notNull().default(0n),
    totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),

    status: orderStatus('status').notNull().default('pending'),
    paymentStatus: orderPaymentStatus('payment_status').notNull().default('unpaid'),

    checkoutSessionId: text('checkout_session_id'),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('orders_workspace_status_idx').on(table.workspaceId, table.status),
    index('orders_workspace_customer_email_idx').on(table.workspaceId, table.customerEmail),
    index('orders_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
    index('orders_checkout_session_id_idx').on(table.checkoutSessionId),
  ],
)

// ---------------------------------------------------------------------------
// order_items
// ---------------------------------------------------------------------------

export const orderItems = pgTable(
  'order_items',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'restrict' }),

    productTitle: varchar('product_title', { length: 255 }).notNull(),
    variantTitle: varchar('variant_title', { length: 255 }),

    unitAmount: bigint('unit_amount', { mode: 'bigint' }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    subtotalAmount: bigint('subtotal_amount', { mode: 'bigint' }).notNull(),
    discountAmount: bigint('discount_amount', { mode: 'bigint' }).notNull().default(0n),
    taxAmount: bigint('tax_amount', { mode: 'bigint' }).notNull().default(0n),
    totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_items_workspace_order_idx').on(table.workspaceId, table.orderId),
    index('order_items_workspace_product_idx').on(table.workspaceId, table.productId),
  ],
)

// ---------------------------------------------------------------------------
// order_transitions
// ---------------------------------------------------------------------------

export const orderTransitions = pgTable(
  'order_transitions',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fromStatus: orderStatus('from_status').notNull(),
    toStatus: orderStatus('to_status').notNull(),
    reason: text('reason'),

    actorType: orderTransitionActorType('actor_type').notNull(),
    actorId: text('actor_id'),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_transitions_workspace_order_created_idx').on(
      table.workspaceId,
      table.orderId,
      table.createdAt,
    ),
  ],
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderRecord = typeof orders.$inferSelect
export type NewOrderRecord = typeof orders.$inferInsert

export type OrderItemRecord = typeof orderItems.$inferSelect
export type NewOrderItemRecord = typeof orderItems.$inferInsert

export type OrderTransitionRecord = typeof orderTransitions.$inferSelect
export type NewOrderTransitionRecord = typeof orderTransitions.$inferInsert
