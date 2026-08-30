/**
 * Customers Schema (Slice 7 §7.1).
 *
 * Responsibilities:
 * - Define the `customers` table with workspace-scoped tenancy.
 * - Confine customer PII (email, name, phone) to this single table.
 * - Track customer lifecycle metrics: total spend, order count, first and last purchase dates.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

/**
 * Customers Table:
 * Scoped by workspace_id. Unique per (workspace_id, email).
 */
export const customers = pgTable(
  'customers',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    email: citext('email').notNull(),

    name: text('name'),

    phone: text('phone'),

    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),

    totalSpend: bigint('total_spend', { mode: 'bigint' }).notNull().default(sql`0`),

    ordersCount: integer('orders_count').notNull().default(0),

    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),

    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('customers_workspace_email_unique').on(table.workspaceId, table.email),
    index('customers_workspace_id_idx').on(table.workspaceId),
    index('customers_workspace_last_seen_idx').on(table.workspaceId, table.lastSeenAt),
    index('customers_workspace_total_spend_idx').on(table.workspaceId, table.totalSpend),
    index('customers_workspace_email_idx').on(table.workspaceId, table.email),
  ],
)

export type CustomerRecord = typeof customers.$inferSelect
export type NewCustomerRecord = typeof customers.$inferInsert
