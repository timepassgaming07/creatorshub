/**
 * Payments and Payment Accounts Schema (Slice 5 §5.2).
 *
 * Responsibilities:
 * - Define `payment_accounts` and `payments` tables.
 * - Multi-tenant isolation: Every table carries a non-null `workspace_id` referencing `workspaces(id)`.
 * - Provider-agnostic representation of connected accounts and payment attempts.
 * - Exact minor units via `bigint` (zero-float rule).
 */
import {
  PAYMENT_ACCOUNT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
} from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
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

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const paymentProvider = pgEnum('payment_provider', PAYMENT_PROVIDERS)
export const paymentStatus = pgEnum('payment_status', PAYMENT_STATUSES)
export const paymentAccountStatus = pgEnum('payment_account_status', PAYMENT_ACCOUNT_STATUSES)

// ---------------------------------------------------------------------------
// payment_accounts
// ---------------------------------------------------------------------------

export const paymentAccounts = pgTable(
  'payment_accounts',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    provider: paymentProvider('provider').notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),

    country: varchar('country', { length: 2 }).notNull(),
    defaultCurrency: varchar('default_currency', { length: 3 }).notNull(),

    status: paymentAccountStatus('status').notNull().default('created'),
    chargesEnabled: boolean('charges_enabled').notNull().default(false),
    payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
    detailsSubmitted: boolean('details_submitted').notNull().default(false),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_accounts_workspace_provider_account_uidx').on(
      table.workspaceId,
      table.provider,
      table.providerAccountId,
    ),
    index('payment_accounts_workspace_status_idx').on(table.workspaceId, table.status),
  ],
)

// ---------------------------------------------------------------------------
// payments
// ---------------------------------------------------------------------------

export const payments = pgTable(
  'payments',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    provider: paymentProvider('provider').notNull(),
    providerPaymentId: varchar('provider_payment_id', { length: 255 }).notNull(),
    providerOrderId: varchar('provider_order_id', { length: 255 }),
    providerSignature: text('provider_signature'),

    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    status: paymentStatus('status').notNull().default('pending'),
    method: varchar('method', { length: 50 }),

    capturedAt: timestamp('captured_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),

    idempotencyKey: text('idempotency_key'),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_workspace_order_idx').on(table.workspaceId, table.orderId),
    index('payments_workspace_provider_payment_idx').on(
      table.workspaceId,
      table.provider,
      table.providerPaymentId,
    ),
    index('payments_workspace_status_idx').on(table.workspaceId, table.status),
    index('payments_idempotency_key_idx').on(table.idempotencyKey),
  ],
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentAccountRecord = typeof paymentAccounts.$inferSelect
export type NewPaymentAccountRecord = typeof paymentAccounts.$inferInsert

export type PaymentRowRecord = typeof payments.$inferSelect
export type NewPaymentRowRecord = typeof payments.$inferInsert
