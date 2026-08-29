/**
 * Ledger schema — the double-entry immutable financial core (ADR-0008).
 *
 * Responsibilities: define `ledger_accounts`, `ledger_transactions`, and
 * `ledger_entries` exactly as `docs/architecture/data-model.md` section 9 and
 * `docs/adr/0008-double-entry-ledger.md` specify.
 * Dependencies: drizzle-orm, workspaces table.
 *
 * Database-enforced invariants:
 * 1. Balanced transactions: for every transaction and currency, sum of debits
 *    equals sum of credits (enforced by a deferred constraint trigger at commit).
 * 2. Immutability: UPDATE and DELETE on ledger_entries are revoked and blocked
 *    by trigger. Corrections are compensating transactions.
 * 3. Positive amounts only: direction carries the sign.
 * 4. Balances are always derived by aggregation, never stored in a mutable column.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'

// ---------------------------------------------------------------------------
// Shared column builders
// ---------------------------------------------------------------------------

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ledgerAccountOwnerType = pgEnum('ledger_account_owner_type', [
  'platform',
  'workspace',
  'affiliate',
  'processor',
  'tax_authority',
])

export const ledgerAccountKind = pgEnum('ledger_account_kind', [
  'processor_clearing',
  'creator_payable',
  'affiliate_payable',
  'platform_revenue',
  'tax_payable',
  'refunds_payable',
  'fees_expense',
])

export const ledgerTransactionKind = pgEnum('ledger_transaction_kind', [
  'order_payment',
  'refund',
  'dispute',
  'commission_accrual',
  'commission_clawback',
  'payout',
  'fee_adjustment',
])

export const ledgerEntryDirection = pgEnum('ledger_entry_direction', ['debit', 'credit'])

// ---------------------------------------------------------------------------
// ledger_accounts
// ---------------------------------------------------------------------------

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: primaryKey(),

    /**
     * Nullable because platform-level, processor, and tax authority accounts
     * belong to no workspace. Workspace accounts carry workspace_id.
     */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    ownerType: ledgerAccountOwnerType('owner_type').notNull(),
    ownerId: text('owner_id'),
    kind: ledgerAccountKind('kind').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('ledger_accounts_owner_kind_currency_uq').on(
      table.ownerType,
      table.ownerId,
      table.kind,
      table.currency,
    ),
    index('ledger_accounts_workspace_id_idx').on(table.workspaceId),
    index('ledger_accounts_kind_currency_idx').on(table.kind, table.currency),
  ],
)

export type LedgerAccount = typeof ledgerAccounts.$inferSelect
export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert

// ---------------------------------------------------------------------------
// ledger_transactions
// ---------------------------------------------------------------------------

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: primaryKey(),

    /**
     * Tenant scoping for reporting and RLS. Nullable for platform-wide events.
     */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    kind: ledgerTransactionKind('kind').notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: text('reference_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    description: text('description'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (table) => [
    index('ledger_transactions_reference_idx').on(table.referenceType, table.referenceId),
    index('ledger_transactions_workspace_id_idx').on(table.workspaceId),
    index('ledger_transactions_occurred_at_idx').on(table.occurredAt),
  ],
)

export type LedgerTransaction = typeof ledgerTransactions.$inferSelect
export type NewLedgerTransaction = typeof ledgerTransactions.$inferInsert

// ---------------------------------------------------------------------------
// ledger_entries
// ---------------------------------------------------------------------------

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: primaryKey(),

    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),

    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),

    direction: ledgerEntryDirection('direction').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),

    /** Denormalised for tenant-scoped reporting and RLS performance */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    createdAt: createdAt(),
  },
  (table) => [
    check('ledger_entries_amount_positive', sql`${table.amount} > 0`),
    index('ledger_entries_transaction_id_idx').on(table.transactionId),
    index('ledger_entries_account_id_idx').on(table.accountId),
    index('ledger_entries_workspace_id_idx').on(table.workspaceId),
    index('ledger_entries_account_created_at_idx').on(table.accountId, table.createdAt),
  ],
)

export type LedgerEntry = typeof ledgerEntries.$inferSelect
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert
