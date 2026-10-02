/**
 * Payouts, Beneficiary Accounts & Settlements Schema (Slice 11 §11.1, §11.4).
 *
 * Responsibilities:
 * 1. Define `beneficiary_accounts` table for bank accounts and UPI IDs.
 * 2. Define `payouts` table for maker-checker disbursement tracking and ledger linkages.
 * 3. Define `payout_items` table itemizing the source revenue/commissions settled.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { users, workspaces } from './identity.js'
import { ledgerTransactions } from './ledger.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const beneficiaryAccounts = pgTable(
  'beneficiary_accounts',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    payeeType: varchar('payee_type', { length: 32 }).notNull().default('workspace'),
    payeeId: text('payee_id').notNull(),
    accountHolderName: text('account_holder_name').notNull(),
    accountType: varchar('account_type', { length: 32 }).notNull(), // 'bank_account' | 'vpa'
    accountNumber: text('account_number'),
    maskedAccountNumber: text('masked_account_number'),
    ifscCode: varchar('ifsc_code', { length: 16 }),
    vpa: text('vpa'),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    isDefault: boolean('is_default').notNull().default(false),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_beneficiary_ws_payee').on(table.workspaceId, table.payeeType, table.payeeId),
    index('idx_beneficiary_ws_created').on(table.workspaceId, table.createdAt),
  ],
)

export type BeneficiaryAccount = typeof beneficiaryAccounts.$inferSelect
export type NewBeneficiaryAccount = typeof beneficiaryAccounts.$inferInsert

export const payouts = pgTable(
  'payouts',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    payeeType: varchar('payee_type', { length: 32 }).notNull().default('workspace'),
    payeeId: text('payee_id').notNull(),
    beneficiaryAccountId: uuid('beneficiary_account_id')
      .notNull()
      .references(() => beneficiaryAccounts.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    status: varchar('status', { length: 32 }).notNull().default('requested'),
    provider: varchar('provider', { length: 32 }).notNull().default('razorpay'),
    providerPayoutId: varchar('provider_payout_id', { length: 128 }),
    ledgerTransactionId: uuid('ledger_transaction_id').references(() => ledgerTransactions.id, {
      onDelete: 'restrict',
    }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payouts_ws_status').on(table.workspaceId, table.status),
    index('idx_payouts_ws_created').on(table.workspaceId, table.createdAt),
    index('idx_payouts_ws_payee').on(table.workspaceId, table.payeeType, table.payeeId),
    uniqueIndex('idx_payouts_provider_id').on(table.providerPayoutId),
  ],
)

export type Payout = typeof payouts.$inferSelect
export type NewPayout = typeof payouts.$inferInsert

export const payoutItems = pgTable(
  'payout_items',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    payoutId: uuid('payout_id')
      .notNull()
      .references(() => payouts.id, { onDelete: 'cascade' }),
    sourceType: varchar('source_type', { length: 32 }).notNull(), // 'order' | 'commission'
    sourceId: text('source_id').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_payout_items_payout').on(table.payoutId),
    index('idx_payout_items_ws_source').on(table.workspaceId, table.sourceType, table.sourceId),
  ],
)

export type PayoutItem = typeof payoutItems.$inferSelect
export type NewPayoutItem = typeof payoutItems.$inferInsert
