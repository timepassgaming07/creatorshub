/**
 * Commissions & Clawbacks Schema (Slice 9 §9.1).
 *
 * Responsibilities:
 * 1. Define `commissions` table representing the full commission lifecycle and hold periods.
 * 2. Define `commission_clawbacks` table recording pro-rated reversals on order refunds.
 * 3. Enforce tenant isolation via foreign keys and unique attribution indexes.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { affiliates, attributions } from './affiliates.js'
import { workspaces } from './identity.js'
import { orders } from './orders.js'
import { refunds } from './refunds.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

/**
 * Commissions Table:
 * Tracks commission holds, vesting dates, and payout readiness.
 */
export const commissions = pgTable(
  'commissions',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    attributionId: uuid('attribution_id')
      .notNull()
      .references(() => attributions.id, { onDelete: 'restrict' }),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    grossSaleAmount: bigint('gross_sale_amount', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    commissionBps: integer('commission_bps').notNull(),
    grossAmount: bigint('gross_amount', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    netAmount: bigint('net_amount', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    status: text('status').notNull().default('held'),
    heldUntil: timestamp('held_until', { withTimezone: true, mode: 'date' }).notNull(),
    vestedAt: timestamp('vested_at', { withTimezone: true, mode: 'date' }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    clawedBackAt: timestamp('clawed_back_at', { withTimezone: true, mode: 'date' }),
    clawbackReason: text('clawback_reason'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('commissions_workspace_attribution_unique').on(
      table.workspaceId,
      table.attributionId,
    ),
    index('idx_commissions_ws_order').on(table.workspaceId, table.orderId),
    index('idx_commissions_ws_affiliate').on(
      table.workspaceId,
      table.affiliateId,
      table.status,
    ),
    index('idx_commissions_ws_vesting').on(
      table.workspaceId,
      table.status,
      table.heldUntil,
    ),
  ],
)

export type CommissionRow = typeof commissions.$inferSelect
export type NewCommissionRow = typeof commissions.$inferInsert

/**
 * Commission Clawbacks Table:
 * Records full or pro-rated reversals on order refunds.
 */
export const commissionClawbacks = pgTable(
  'commission_clawbacks',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    commissionId: uuid('commission_id')
      .notNull()
      .references(() => commissions.id, { onDelete: 'restrict' }),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    status: text('status').notNull().default('applied'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index('idx_commission_clawbacks_ws_commission').on(
      table.workspaceId,
      table.commissionId,
    ),
    index('idx_commission_clawbacks_ws_refund').on(
      table.workspaceId,
      table.refundId,
    ),
  ],
)

export type CommissionClawbackRow = typeof commissionClawbacks.$inferSelect
export type NewCommissionClawbackRow = typeof commissionClawbacks.$inferInsert
