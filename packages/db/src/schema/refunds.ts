/**
 * Refunds Schema (Slice 5 §5.10).
 *
 * Responsibilities:
 * - Define `refunds` table and `refund_status` enum.
 * - Multi-tenant isolation: Bound to `workspaces(id)` via `workspace_id`.
 * - Relates to `orders` and `payments`.
 * - Exact minor units via `bigint` (zero-float rule).
 */
import { REFUND_STATUSES } from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { users, workspaces } from './identity.js'
import { orders } from './orders.js'
import { payments } from './payments.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const refundStatus = pgEnum('refund_status', REFUND_STATUSES)

export const refunds = pgTable(
  'refunds',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    providerRefundId: text('provider_refund_id').notNull(),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    reason: text('reason'),
    status: refundStatus('status').notNull().default('pending'),

    initiatedByUserId: uuid('initiated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    metadata: jsonb('metadata').notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_refunds_provider_refund').on(table.workspaceId, table.providerRefundId),
    index('idx_refunds_order').on(table.workspaceId, table.orderId),
    index('idx_refunds_payment').on(table.workspaceId, table.paymentId),
    index('idx_refunds_status').on(table.workspaceId, table.status),
  ],
)

export type RefundRecord = typeof refunds.$inferSelect
export type NewRefundRecord = typeof refunds.$inferInsert
