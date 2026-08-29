/**
 * Ledger repository — tenant-scoped double-entry financial operations.
 *
 * Responsibilities:
 * 1. Post balanced double-entry transactions with idempotency guarantees.
 * 2. Find and create accounts (workspace-scoped, platform, processor).
 * 3. Derive account balances on the fly by aggregating immutable entries (never store a mutable balance).
 * 4. List transaction history and account entries.
 *
 * Dependencies: @creatorhub/contracts, drizzle-orm, schema.
 */
import {
  type CurrencyCode,
  type LedgerAccountId,
  type LedgerAccountKind,
  type LedgerEntryProposal,
  type Money,
  type PostTransactionInput,
  add,
  currency,
  getAccountNormalBalance,
  money,
  subtract,
  zero,
} from '@creatorhub/contracts'
import { and, asc, eq, isNull, or } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type LedgerAccount,
  type LedgerEntry,
  type LedgerTransaction,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
} from '../schema/index.js'

export type PostTransactionResult = {
  readonly transaction: LedgerTransaction
  readonly entries: LedgerEntry[]
  readonly idempotentReplay: boolean
}

/**
 * Validates balance conservation before executing a transaction write.
 */
function assertBalancedTransaction(entries: readonly LedgerEntryProposal[]): void {
  if (entries.length < 2) {
    throw new Error('A transaction must contain at least two entries.')
  }

  for (const entry of entries) {
    if (entry.amount <= 0n) {
      throw new Error(`Ledger entry amount must be positive, received ${entry.amount.toString()}.`)
    }
  }

  const totals = new Map<
    CurrencyCode,
    { debits: bigint; credits: bigint; hasDebit: boolean; hasCredit: boolean }
  >()

  for (const entry of entries) {
    const existing = totals.get(entry.currency) ?? {
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

    totals.set(entry.currency, existing)
  }

  for (const [code, t] of totals.entries()) {
    if (!t.hasDebit || !t.hasCredit) {
      throw new Error(`Transaction in currency ${code} must have both debits and credits.`)
    }
    if (t.debits !== t.credits) {
      throw new Error(
        `Cannot post unbalanced transaction: total debits (${t.debits.toString()}) != total credits (${t.credits.toString()}) for currency ${code}.`,
      )
    }
  }
}

/**
 * Finds an account by ID, ensuring it is either accessible to the current tenant
 * or is a platform-level account.
 */
export async function findAccountById(
  scope: RepositoryScope,
  accountId: LedgerAccountId,
): Promise<LedgerAccount | undefined> {
  const [account] = await scope.tx
    .select()
    .from(ledgerAccounts)
    .where(
      or(
        scoped(scope, ledgerAccounts, eq(ledgerAccounts.id, accountId)),
        and(isNull(ledgerAccounts.workspaceId), eq(ledgerAccounts.id, accountId)),
      ),
    )
    .limit(1)

  return account
}

/**
 * Finds or creates a tenant-scoped ledger account (e.g. creator payable or affiliate payable).
 */
export async function findOrCreateWorkspaceAccount(
  scope: RepositoryScope,
  kind: LedgerAccountKind,
  code: CurrencyCode,
  ownerId?: string,
): Promise<LedgerAccount> {
  const targetOwnerId = ownerId ?? scope.context.workspaceId

  const [existing] = await scope.tx
    .select()
    .from(ledgerAccounts)
    .where(
      scoped(
        scope,
        ledgerAccounts,
        eq(ledgerAccounts.kind, kind),
        eq(ledgerAccounts.currency, code),
        eq(ledgerAccounts.ownerType, 'workspace'),
        eq(ledgerAccounts.ownerId, targetOwnerId),
      ),
    )
    .limit(1)

  if (existing) {
    return existing
  }

  const [created] = await scope.tx
    .insert(ledgerAccounts)
    .values(
      insertValues<typeof ledgerAccounts.$inferInsert>(scope, {
        ownerType: 'workspace',
        ownerId: targetOwnerId,
        kind,
        currency: code,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create ledger account for workspace ${scope.context.workspaceId}`)
  }

  return created
}

/**
 * Lists all ledger accounts belonging to the current workspace.
 */
export async function listAccounts(scope: RepositoryScope): Promise<LedgerAccount[]> {
  return scope.tx
    .select()
    .from(ledgerAccounts)
    .where(scoped(scope, ledgerAccounts))
    .orderBy(asc(ledgerAccounts.createdAt))
}

/**
 * Posts a double-entry financial transaction atomically.
 *
 * Enforces:
 * 1. Mathematical balance validation before write (sum debits = sum credits per currency).
 * 2. Idempotency by idempotency_key: returns existing transaction if already executed.
 * 3. Atomic insertion of transaction header and all entries within scope.tx.
 */
export async function postTransaction(
  scope: RepositoryScope,
  input: PostTransactionInput,
): Promise<PostTransactionResult> {
  // Validate invariants
  assertBalancedTransaction(input.entries)

  // Idempotency check: see if transaction with this key already exists
  const [existingTx] = await scope.tx
    .select()
    .from(ledgerTransactions)
    .where(eq(ledgerTransactions.idempotencyKey, input.idempotencyKey))
    .limit(1)

  if (existingTx) {
    const entries = await scope.tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, existingTx.id))
      .orderBy(asc(ledgerEntries.createdAt))

    return {
      transaction: existingTx,
      entries,
      idempotentReplay: true,
    }
  }

  // Insert transaction
  const [txRecord] = await scope.tx
    .insert(ledgerTransactions)
    .values({
      workspaceId: input.workspaceId ?? scope.context.workspaceId,
      kind: input.kind,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning()

  if (!txRecord) {
    throw new Error(`Failed to insert ledger transaction header for key ${input.idempotencyKey}`)
  }

  // Insert all entries
  const entryRows = input.entries.map((entry) => ({
    transactionId: txRecord.id,
    accountId: entry.accountId,
    direction: entry.direction,
    amount: entry.amount,
    currency: entry.currency,
    workspaceId: input.workspaceId ?? scope.context.workspaceId,
  }))

  const insertedEntries = await scope.tx.insert(ledgerEntries).values(entryRows).returning()

  return {
    transaction: txRecord,
    entries: insertedEntries,
    idempotentReplay: false,
  }
}

/**
 * Derives an account's live balance by aggregating its ledger entries.
 * Never reads from a mutable balance field (ADR-0008).
 */
export async function getAccountBalance(
  scope: RepositoryScope,
  accountId: LedgerAccountId,
): Promise<Money> {
  const account = await findAccountById(scope, accountId)
  if (!account) {
    throw new Error(`Ledger account ${accountId} not found or not accessible to tenant.`)
  }

  const entries = await scope.tx
    .select({
      direction: ledgerEntries.direction,
      amount: ledgerEntries.amount,
      currency: ledgerEntries.currency,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId))

  const code = currency(account.currency)
  let totalDebits = zero(code)
  let totalCredits = zero(code)

  for (const entry of entries) {
    if (entry.currency !== account.currency) continue
    const item = money(entry.amount, code)
    if (entry.direction === 'debit') {
      totalDebits = add(totalDebits, item)
    } else {
      totalCredits = add(totalCredits, item)
    }
  }

  const normal = getAccountNormalBalance(account.kind)
  return normal === 'debit'
    ? subtract(totalDebits, totalCredits)
    : subtract(totalCredits, totalDebits)
}

/**
 * Lists chronological ledger entries for an account.
 */
export async function listEntriesForAccount(
  scope: RepositoryScope,
  accountId: LedgerAccountId,
  limit = 100,
): Promise<LedgerEntry[]> {
  const account = await findAccountById(scope, accountId)
  if (!account) {
    throw new Error(`Ledger account ${accountId} not found or not accessible to tenant.`)
  }

  return scope.tx
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId))
    .orderBy(asc(ledgerEntries.createdAt))
    .limit(limit)
}
