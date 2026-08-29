/**
 * Reconciliation contracts and types (ADR-0008, Implementation Plan §2.9).
 *
 * Responsibilities: define schemas and types for continuous ledger balance
 * reconciliation against materialised rollups and zero-sum conservation checks.
 *
 * Dependencies: zod, ./identifiers.js, ./money.js, ./ledger.js.
 */
import { z } from 'zod'

import type { LedgerAccountId } from './identifiers.js'
import type { LedgerAccountKind } from './ledger.js'
import type { CurrencyCode, Money } from './money.js'

export const reconciliationStatusSchema = z.enum(['matched', 'reconciled_initial', 'discrepancy'])
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>

export type AccountReconciliationResult = {
  readonly accountId: LedgerAccountId
  readonly kind: LedgerAccountKind
  readonly currency: CurrencyCode
  readonly liveDerivedBalance: Money
  readonly previousRollupBalance: Money | null
  readonly status: ReconciliationStatus
  readonly varianceAmount: bigint
  readonly totalEntries: number
}

export type WorkspaceReconciliationSummary = {
  readonly workspaceId: string | null
  readonly totalAccountsReconciled: number
  readonly matchedCount: number
  readonly discrepancyCount: number
  readonly accounts: readonly AccountReconciliationResult[]
  readonly isSystemBalanced: boolean
  readonly systemNetBalance: Money
}
