/**
 * Reconciliation repository — continuous financial balance verification (ADR-0008, §2.9).
 *
 * Responsibilities:
 * 1. Live derive account balances from append-only `ledger_entries`.
 * 2. Compare against materialised `ledger_balance_rollups`.
 * 3. Detect and report discrepancies or drift down to the minor unit.
 * 4. Upsert materialised rollups with verified live derived values.
 * 5. Verify system-wide zero-sum conservation across accounts.
 *
 * Dependencies: @creatorhub/contracts, drizzle-orm, schema, ledger repository.
 */
import {
  type AccountReconciliationResult,
  type CurrencyCode,
  type LedgerAccountId,
  type Money,
  type WorkspaceReconciliationSummary,
  currency,
  getAccountNormalBalance,
  ledgerAccountId,
  money,
  subtract,
  zero,
} from '@creatorhub/contracts'
import { desc, eq, isNull } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type LedgerBalanceRollupRecord,
  type NewLedgerBalanceRollupRecord,
  ledgerAccounts,
  ledgerBalanceRollups,
  ledgerEntries,
} from '../schema/index.js'
import { findAccountById } from './ledger.js'

/**
 * Retrieves the current materialised balance rollup for a ledger account if one exists.
 */
export async function getRollupForAccount(
  scope: RepositoryScope,
  accountId: LedgerAccountId,
): Promise<LedgerBalanceRollupRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(ledgerBalanceRollups)
    .where(eq(ledgerBalanceRollups.accountId, accountId))

  return row ?? null
}

/**
 * Reconciles a single ledger account:
 * 1. Aggregates live entries from `ledger_entries`.
 * 2. Compares live derived balance with existing materialised rollup.
 * 3. Flags discrepancies if live balance differs from rollup.
 * 4. Refreshes the materialised rollup with the authoritative live state.
 */
export async function reconcileAccount(
  scope: RepositoryScope,
  accountId: LedgerAccountId,
): Promise<AccountReconciliationResult> {
  const account = await findAccountById(scope, accountId)
  if (!account) {
    throw new Error(`Ledger account ${accountId} not found or not accessible to tenant.`)
  }

  // Fetch all entries for this account
  const entries = await scope.tx
    .select({
      id: ledgerEntries.id,
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
      createdAt: ledgerEntries.createdAt,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId))
    .orderBy(desc(ledgerEntries.createdAt))

  const code = currency(account.currency)
  let totalDebits = zero(code)
  let totalCredits = zero(code)
  const lastEntryId = entries[0]?.id ?? null

  for (const entry of entries) {
    if (entry.currency !== account.currency) continue
    const m = money(entry.amount, code)
    if (entry.direction === 'debit') {
      totalDebits = money(totalDebits.amount + m.amount, code)
    } else {
      totalCredits = money(totalCredits.amount + m.amount, code)
    }
  }

  const normal = getAccountNormalBalance(account.kind)
  const liveDerivedBalance: Money =
    normal === 'debit' ? subtract(totalDebits, totalCredits) : subtract(totalCredits, totalDebits)

  const existingRollup = await getRollupForAccount(scope, accountId)

  let status: 'matched' | 'reconciled_initial' | 'discrepancy'
  let varianceAmount = 0n
  let previousRollupBalance: Money | null = null

  if (existingRollup) {
    previousRollupBalance = money(existingRollup.derivedBalance, code)
    const matchesDerived = existingRollup.derivedBalance === liveDerivedBalance.amount
    const matchesEntries = existingRollup.entryCount === entries.length

    if (matchesDerived && matchesEntries) {
      status = 'matched'
      varianceAmount = 0n
    } else {
      status = 'discrepancy'
      varianceAmount = liveDerivedBalance.amount - existingRollup.derivedBalance
    }
  } else {
    status = 'reconciled_initial'
    varianceAmount = 0n
  }

  // Upsert rollup row with latest authoritative values
  const now = new Date()
  await scope.tx
    .insert(ledgerBalanceRollups)
    .values(
      insertValues<NewLedgerBalanceRollupRecord>(scope, {
        accountId: account.id,
        currency: account.currency,
        totalDebits: totalDebits.amount,
        totalCredits: totalCredits.amount,
        derivedBalance: liveDerivedBalance.amount,
        entryCount: entries.length,
        lastEntryId,
        reconciledAt: now,
      }),
    )
    .onConflictDoUpdate({
      target: ledgerBalanceRollups.accountId,
      set: {
        totalDebits: totalDebits.amount,
        totalCredits: totalCredits.amount,
        derivedBalance: liveDerivedBalance.amount,
        entryCount: entries.length,
        lastEntryId,
        reconciledAt: now,
      },
    })

  return {
    accountId,
    kind: account.kind,
    currency: code,
    liveDerivedBalance,
    previousRollupBalance,
    status,
    varianceAmount,
    totalEntries: entries.length,
  }
}

/**
 * Runs reconciliation across all accounts in a workspace (or across all platform accounts),
 * verifying individual account rollups and system-wide debit=credit conservation.
 */
export async function reconcileWorkspace(
  scope: RepositoryScope,
  workspaceIdFilter?: string | null,
): Promise<WorkspaceReconciliationSummary> {
  const targetWorkspaceId =
    workspaceIdFilter !== undefined ? workspaceIdFilter : scope.context.workspaceId

  const accountsQuery = targetWorkspaceId
    ? scope.tx.select().from(ledgerAccounts).where(scoped(scope, ledgerAccounts))
    : scope.tx.select().from(ledgerAccounts).where(isNull(ledgerAccounts.workspaceId))

  const accounts = await accountsQuery

  const results: AccountReconciliationResult[] = []
  let matchedCount = 0
  let discrepancyCount = 0

  let systemNetDebits = 0n
  let systemNetCredits = 0n
  const primaryCurrency: CurrencyCode = accounts[0]?.currency
    ? currency(accounts[0].currency)
    : currency('INR')

  for (const account of accounts) {
    const res = await reconcileAccount(scope, ledgerAccountId(account.id))
    results.push(res)

    if (res.status === 'matched' || res.status === 'reconciled_initial') {
      matchedCount += 1
    } else {
      discrepancyCount += 1
    }

    const normal = getAccountNormalBalance(account.kind)
    if (normal === 'debit') {
      systemNetDebits += res.liveDerivedBalance.amount
    } else {
      systemNetCredits += res.liveDerivedBalance.amount
    }
  }

  const isSystemBalanced = systemNetDebits === systemNetCredits
  const systemNetBalance = money(systemNetDebits - systemNetCredits, primaryCurrency)

  return {
    workspaceId: targetWorkspaceId,
    totalAccountsReconciled: accounts.length,
    matchedCount,
    discrepancyCount,
    accounts: results,
    isSystemBalanced,
    systemNetBalance,
  }
}

/**
 * Background worker task handler for continuous ledger reconciliation.
 */
export async function runReconciliationJob(
  scope: RepositoryScope,
): Promise<{ readonly totalAccountsReconciled: number; readonly discrepancies: number }> {
  const summary = await reconcileWorkspace(scope)
  return {
    totalAccountsReconciled: summary.totalAccountsReconciled,
    discrepancies: summary.discrepancyCount,
  }
}
