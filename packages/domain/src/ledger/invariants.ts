/**
 * Double-entry ledger invariants — domain rules for financial conservation.
 *
 * Responsibilities:
 * 1. Validate that any candidate transaction balances exactly (sum of debits equals
 *    sum of credits per currency, at least 2 entries, all amounts > 0n).
 * 2. Derive account balances purely by aggregation over entries, never from a stored column.
 *
 * Dependencies: @creatorhub/contracts, ../result.js.
 */
import {
  type CurrencyCode,
  type LedgerAccountKind,
  type LedgerEntryProposal,
  type Money,
  add,
  getAccountNormalBalance,
  money,
  subtract,
  zero,
} from '@creatorhub/contracts'

import { domainError, err, ok, type Result } from '../result.js'

/**
 * Validates that a set of proposed ledger entries satisfies all double-entry invariants:
 * 1. At least 2 entries.
 * 2. All amounts are strictly positive (positive minor units).
 * 3. Both debits and credits exist.
 * 4. For every currency present, total debits equal total credits.
 */
export function validateBalancedTransaction(entries: readonly LedgerEntryProposal[]): Result<void> {
  if (entries.length < 2) {
    return err(
      domainError({
        code: 'INVALID_TRANSACTION',
        title: 'Invalid transaction entries',
        detail: 'A double-entry transaction must contain at least two entries.',
        action: 'Include at least one debit and one credit entry.',
      }),
    )
  }

  for (const entry of entries) {
    if (entry.amount <= 0n) {
      return err(
        domainError({
          code: 'INVALID_ENTRY_AMOUNT',
          title: 'Invalid entry amount',
          detail: `Ledger entry amount must be strictly positive, received ${entry.amount.toString()}.`,
          action: 'Use a positive integer minor unit amount.',
        }),
      )
    }
  }

  // Group by currency and check that debits = credits > 0n
  const currencyTotals = new Map<
    CurrencyCode,
    { debits: bigint; credits: bigint; hasDebit: boolean; hasCredit: boolean }
  >()

  for (const entry of entries) {
    const existing = currencyTotals.get(entry.currency) ?? {
      debits: 0n,
      credits: 0n,
      hasDebit: false,
      hasCredit: false,
    }

    if (entry.direction === 'debit') {
      existing.debits += entry.amount
      existing.hasDebit = true
    } else {
      existing.credits += entry.amount
      existing.hasCredit = true
    }

    currencyTotals.set(entry.currency, existing)
  }

  for (const [code, totals] of currencyTotals.entries()) {
    if (!totals.hasDebit || !totals.hasCredit) {
      return err(
        domainError({
          code: 'ONE_SIDED_TRANSACTION',
          title: 'One-sided transaction',
          detail: `Transaction in currency ${code} must have both debits and credits.`,
          action:
            'Ensure both debit and credit entries exist for every currency in the transaction.',
        }),
      )
    }

    if (totals.debits !== totals.credits) {
      return err(
        domainError({
          code: 'UNBALANCED_TRANSACTION',
          title: 'Unbalanced transaction',
          detail: `Transaction does not balance for currency ${code}: total debits (${totals.debits.toString()}) != total credits (${totals.credits.toString()}).`,
          action: 'Ensure total debits equal total credits for every currency in the transaction.',
        }),
      )
    }
  }

  return ok(undefined)
}

/**
 * Derives an account's balance from its historical entries.
 *
 * Implements standard double-entry accounting normal balances:
 * - Debit-normal accounts (Assets, Expenses: processor_clearing, fees_expense):
 *   Balance = Sum(Debits) - Sum(Credits)
 * - Credit-normal accounts (Liabilities, Equity, Revenue: creator_payable, affiliate_payable, platform_revenue, tax_payable, refunds_payable):
 *   Balance = Sum(Credits) - Sum(Debits)
 *
 * Always computed dynamically; never read from or written to a mutable balance field.
 */
export function deriveAccountBalance(
  entries: readonly { direction: 'debit' | 'credit'; amount: bigint; currency: CurrencyCode }[],
  kind: LedgerAccountKind,
  code: CurrencyCode,
): Money {
  let totalDebits = zero(code)
  let totalCredits = zero(code)

  for (const entry of entries) {
    if (entry.currency !== code) {
      continue
    }

    const item = money(entry.amount, code)
    if (entry.direction === 'debit') {
      totalDebits = add(totalDebits, item)
    } else {
      totalCredits = add(totalCredits, item)
    }
  }

  const normal = getAccountNormalBalance(kind)
  if (normal === 'debit') {
    return subtract(totalDebits, totalCredits)
  } else {
    return subtract(totalCredits, totalDebits)
  }
}
