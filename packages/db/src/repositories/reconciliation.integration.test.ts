/**
 * Reconciliation repository integration tests (Item 2.9).
 *
 * Verifies against PostgreSQL 18:
 * 1. Initial reconciliation produces correct live derived balance and writes rollup (reconciled_initial).
 * 2. Unchanged subsequent reconciliation returns status 'matched' with 0 variance.
 * 3. Detecting variance / data drift if a materialised rollup is tampered with or desynchronized.
 * 4. System-wide workspace reconciliation verifies zero-sum debit=credit conservation.
 * 5. Job runner execution.
 */
import {
  currency,
  ledgerAccountId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as ledgerRepo from './ledger.js'
import * as reconciliationRepo from './reconciliation.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname
const INR = currency('INR')

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let u1Id: string

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({
    migrationUrl: container.migrationUrl,
    migrationsFolder: MIGRATIONS,
  })

  control = postgres(container.superuserUrl, { max: 10, onnotice: () => undefined })
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '10',
    }),
  )
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

describe('Ledger Reconciliation Repository (Item 2.9)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE ledger_balance_rollups, ledger_entries, ledger_transactions, ledger_accounts, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Reconciliation WS', 'ws-recon') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('recon-user@example.com') RETURNING id
    `
    u1Id = u1?.id ?? ''

    await control`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${ws1Id}, ${u1Id}, 'owner')
    `
  })

  async function inScope<T>(wId: string, work: (scope: RepositoryScope) => Promise<T>): Promise<T> {
    const context = workspaceContext({
      workspaceId: workspaceId(wId),
      actorId: userId(u1Id),
      requestId: requestId('req-test-recon'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('performs initial reconciliation and subsequent matched check', async () => {
    // 1. Setup accounts: processor clearing and creator payable
    const { clearingAcc, payableAcc } = await inScope(ws1Id, async (scope) => {
      const clearing = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'processor_clearing',
        INR,
        'stripe-in',
      )
      const payable = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'creator_payable', INR)
      return { clearingAcc: clearing, payableAcc: payable }
    })

    // 2. Post balanced transaction: Debit Clearing 50000, Credit Creator Payable 50000
    await inScope(ws1Id, async (scope) => {
      await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_recon_1',
        idempotencyKey: 'tx_recon_1',
        description: 'Product sale',
        entries: [
          {
            accountId: ledgerAccountId(clearingAcc.id),
            direction: 'debit',
            amount: 50000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(payableAcc.id),
            direction: 'credit',
            amount: 50000n,
            currency: INR,
          },
        ],
      })
    })

    // 3. Initial reconciliation
    const initClearing = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileAccount(scope, ledgerAccountId(clearingAcc.id)),
    )

    expect(initClearing.status).toBe('reconciled_initial')
    expect(initClearing.liveDerivedBalance.amount).toBe(50000n)
    expect(initClearing.varianceAmount).toBe(0n)
    expect(initClearing.totalEntries).toBe(1)

    // 4. Verify rollup table recorded values
    const rollup = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.getRollupForAccount(scope, ledgerAccountId(clearingAcc.id)),
    )
    expect(rollup).not.toBeNull()
    expect(rollup?.derivedBalance).toBe(50000n)
    expect(rollup?.entryCount).toBe(1)

    // 5. Subsequent reconciliation with no changes should be 'matched'
    const subClearing = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileAccount(scope, ledgerAccountId(clearingAcc.id)),
    )
    expect(subClearing.status).toBe('matched')
    expect(subClearing.liveDerivedBalance.amount).toBe(50000n)
    expect(subClearing.previousRollupBalance?.amount).toBe(50000n)
    expect(subClearing.varianceAmount).toBe(0n)
  })

  it('detects discrepancy if materialised rollup has drifted or is corrupted', async () => {
    // 1. Setup accounts
    const { clearingAcc, payableAcc } = await inScope(ws1Id, async (scope) => {
      const clearing = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'processor_clearing',
        INR,
        'stripe-in',
      )
      const payable = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'creator_payable', INR)
      return { clearingAcc: clearing, payableAcc: payable }
    })

    // 2. Post transaction
    await inScope(ws1Id, async (scope) => {
      await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_drift_1',
        idempotencyKey: 'tx_recon_drift',
        entries: [
          {
            accountId: ledgerAccountId(clearingAcc.id),
            direction: 'debit',
            amount: 100000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(payableAcc.id),
            direction: 'credit',
            amount: 100000n,
            currency: INR,
          },
        ],
      })
    })

    // 3. Initial reconciliation
    await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileAccount(scope, ledgerAccountId(clearingAcc.id)),
    )

    // 4. Simulate silent data corruption in the rollup table (e.g. 70000 instead of 100000)
    await control`
      UPDATE ledger_balance_rollups
      SET derived_balance = 70000
      WHERE account_id = ${clearingAcc.id}
    `

    // 5. Reconcile: must detect discrepancy of 30000 INR
    const driftedResult = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileAccount(scope, ledgerAccountId(clearingAcc.id)),
    )

    expect(driftedResult.status).toBe('discrepancy')
    expect(driftedResult.liveDerivedBalance.amount).toBe(100000n)
    expect(driftedResult.previousRollupBalance?.amount).toBe(70000n)
    expect(driftedResult.varianceAmount).toBe(30000n)

    // 6. Next reconciliation is matched because the rollup was self-healed
    const healedResult = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileAccount(scope, ledgerAccountId(clearingAcc.id)),
    )
    expect(healedResult.status).toBe('matched')
    expect(healedResult.varianceAmount).toBe(0n)
  })

  it('reconciles entire workspace and proves system-wide zero-sum balance', async () => {
    // 1. Setup multi-account topology in workspace
    const { clearingAcc, feeAcc, creatorAcc, taxAcc } = await inScope(ws1Id, async (scope) => {
      const clearing = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'processor_clearing',
        INR,
        'stripe-in',
      )
      const fee = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'fees_expense',
        INR,
        'platform-fee',
      )
      const creator = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'creator_payable', INR)
      const tax = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'tax_payable',
        INR,
        'gst-tax',
      )
      return { clearingAcc: clearing, feeAcc: fee, creatorAcc: creator, taxAcc: tax }
    })

    // 2. Post multi-leg transaction:
    // Order 10000 INR: Clearing +9000 (debit), Fee +1000 (debit) = Creator +8200 (credit) + Tax +1800 (credit)
    await inScope(ws1Id, async (scope) => {
      await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_multi_1',
        idempotencyKey: 'tx_multi_recon',
        entries: [
          {
            accountId: ledgerAccountId(clearingAcc.id),
            direction: 'debit',
            amount: 9000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(feeAcc.id),
            direction: 'debit',
            amount: 1000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAcc.id),
            direction: 'credit',
            amount: 8200n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(taxAcc.id),
            direction: 'credit',
            amount: 1800n,
            currency: INR,
          },
        ],
      })
    })

    // 3. Workspace reconciliation
    const summary = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.reconcileWorkspace(scope),
    )

    expect(summary.totalAccountsReconciled).toBe(4)
    expect(summary.discrepancyCount).toBe(0)
    expect(summary.isSystemBalanced).toBe(true)
    expect(summary.systemNetBalance.amount).toBe(0n)

    // 4. Test runReconciliationJob
    const jobResult = await inScope(ws1Id, async (scope) =>
      reconciliationRepo.runReconciliationJob(scope),
    )
    expect(jobResult.totalAccountsReconciled).toBe(4)
    expect(jobResult.discrepancies).toBe(0)
  })
})
