/**
 * Disputes Schema (Slice 5 §5.10).
 *
 * Responsibilities:
 * - Define `disputes` table and `dispute_status` enum.
 * - Multi-tenant isolation: Bound to `workspaces(id)` via `workspace_id`.
 * - Relates to `orders` and `payments`.
 * - Exact minor units via `bigint` (zero-float rule).
 */
import { DISPUTE_STATUSES } from '@creatorhub/contracts'
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

import { workspaces } from './identity.js'
import { orders } from './orders.js'
import { payments } from './payments.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const disputeStatus = pgEnum('dispute_status', DISPUTE_STATUSES)

export const disputes = pgTable(
  'disputes',
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

    providerDisputeId: text('provider_dispute_id').notNull(),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    reason: text('reason'),
    status: disputeStatus('status').notNull().default('needs_response'),

    feeAmount: bigint('fee_amount', { mode: 'bigint' }).notNull().default(0n),

    evidenceDueAt: timestamp('evidence_due_at', { withTimezone: true }),

    metadata: jsonb('metadata').notNull().default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_disputes_provider_dispute').on(table.workspaceId, table.providerDisputeId),
    index('idx_disputes_order').on(table.workspaceId, table.orderId),
    index('idx_disputes_payment').on(table.workspaceId, table.paymentId),
    index('idx_disputes_status').on(table.workspaceId, table.status),
  ],
)

export type DisputeRecord = typeof disputes.$inferSelect
export type NewDisputeRecord = typeof disputes.$inferInsert
