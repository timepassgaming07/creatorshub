/**
 * Ledger balance rollups schema (ADR-0008, Implementation Plan §2.9).
 *
 * Responsibilities:
 * Materialised snapshots of ledger account balances used for continuous reconciliation.
 *
 * Invariants:
 * 1. Rollups are cached aggregations, never the source of truth.
 * 2. True balances are ALWAYS derived live from append-only `ledger_entries`.
 * 3. The reconciliation job sweeps accounts, compares live derived balances against rollups,
 *    and detects any variance or silent data drift down to the minor unit.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'
import { ledgerAccounts, ledgerEntries } from './ledger.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const ledgerBalanceRollups = pgTable(
  'ledger_balance_rollups',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'cascade' }),

    currency: varchar('currency', { length: 3 }).notNull(),

    totalDebits: bigint('total_debits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    totalCredits: bigint('total_credits', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    derivedBalance: bigint('derived_balance', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),

    entryCount: integer('entry_count').notNull().default(0),
    lastEntryId: uuid('last_entry_id').references(() => ledgerEntries.id),

    reconciledAt: timestamp('reconciled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ledger_balance_rollups_account_uq').on(table.accountId),
    index('ledger_balance_rollups_workspace_idx').on(table.workspaceId, table.reconciledAt),
  ],
)

export type LedgerBalanceRollupRecord = typeof ledgerBalanceRollups.$inferSelect
export type NewLedgerBalanceRollupRecord = typeof ledgerBalanceRollups.$inferInsert
