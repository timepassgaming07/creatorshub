/**
 * Ledger contracts — shared schemas and types for double-entry financial core.
 *
 * Responsibilities: define schemas and types for ledger accounts, transactions,
 * and entries across domain and persistence boundaries.
 * Dependencies: zod, ./identifiers.js, ./money.js.
 */
import { z } from 'zod'

import { type LedgerAccountId, ledgerAccountIdSchema, workspaceIdSchema } from './identifiers.js'
import { currency, type Money } from './money.js'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const LEDGER_ACCOUNT_OWNER_TYPES = [
  'platform',
  'workspace',
  'affiliate',
  'processor',
  'tax_authority',
] as const
export type LedgerAccountOwnerType = (typeof LEDGER_ACCOUNT_OWNER_TYPES)[number]
export const ledgerAccountOwnerTypeSchema = z.enum(LEDGER_ACCOUNT_OWNER_TYPES)

export const LEDGER_ACCOUNT_KINDS = [
  'processor_clearing',
  'creator_payable',
  'affiliate_payable',
  'platform_revenue',
  'tax_payable',
  'refunds_payable',
  'fees_expense',
] as const
export type LedgerAccountKind = (typeof LEDGER_ACCOUNT_KINDS)[number]
export const ledgerAccountKindSchema = z.enum(LEDGER_ACCOUNT_KINDS)

export const LEDGER_TRANSACTION_KINDS = [
  'order_payment',
  'refund',
  'dispute',
  'commission_accrual',
  'commission_clawback',
  'payout',
  'fee_adjustment',
] as const
export type LedgerTransactionKind = (typeof LEDGER_TRANSACTION_KINDS)[number]
export const ledgerTransactionKindSchema = z.enum(LEDGER_TRANSACTION_KINDS)

export const LEDGER_ENTRY_DIRECTIONS = ['debit', 'credit'] as const
export type LedgerEntryDirection = (typeof LEDGER_ENTRY_DIRECTIONS)[number]
export const ledgerEntryDirectionSchema = z.enum(LEDGER_ENTRY_DIRECTIONS)

// ---------------------------------------------------------------------------
// Account Classification
//
// Normal balances in standard double-entry bookkeeping:
// Assets and Expenses are DEBIT-normal: Balance = Sum(Debits) - Sum(Credits)
// Liabilities, Equity, and Revenue are CREDIT-normal: Balance = Sum(Credits) - Sum(Debits)
// ---------------------------------------------------------------------------

export type AccountNormalBalance = 'debit' | 'credit'

export function getAccountNormalBalance(kind: LedgerAccountKind): AccountNormalBalance {
  switch (kind) {
    case 'processor_clearing':
    case 'fees_expense':
      return 'debit'
    case 'creator_payable':
    case 'affiliate_payable':
    case 'platform_revenue':
    case 'tax_payable':
    case 'refunds_payable':
      return 'credit'
  }
}

// ---------------------------------------------------------------------------
// Schemas for Posting and Reporting
// ---------------------------------------------------------------------------

export const ledgerEntryProposalSchema = z.object({
  accountId: ledgerAccountIdSchema,
  direction: ledgerEntryDirectionSchema,
  amount: z.bigint().positive('Ledger entry amount must be positive.'),
  currency: z.string().transform((c) => currency(c)),
})

export type LedgerEntryProposal = z.infer<typeof ledgerEntryProposalSchema>

export const postTransactionInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  kind: ledgerTransactionKindSchema,
  referenceType: z.string().min(1).max(64),
  referenceId: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  occurredAt: z.date().optional(),
  entries: z
    .array(ledgerEntryProposalSchema)
    .min(2, 'A balanced transaction must have at least two entries.'),
})

export type PostTransactionInput = z.infer<typeof postTransactionInputSchema>

export type AccountBalance = {
  readonly accountId: LedgerAccountId
  readonly balance: Money
  readonly normalBalance: AccountNormalBalance
}
