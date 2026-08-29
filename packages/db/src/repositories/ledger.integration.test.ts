/**
 * Double-entry ledger repository integration tests (Item 2.4).
 *
 * Verifies repository operations with tenant isolation, live derived balances,
 * idempotency replay, and database transaction atomicity against real PostgreSQL 18.
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

  control = postgres(container.superuserUrl, { max: 5, onnotice: () => undefined })
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '5',
    }),
  )
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

describe('Ledger Repository (Item 2.4)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE ledger_entries, ledger_transactions, ledger_accounts, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('creator1@example.com') RETURNING id
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
      requestId: requestId('req-test-ledger'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('finds or creates workspace accounts idempotently', async () => {
    await inScope(ws1Id, async (scope) => {
      const acc1 = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'creator_payable', INR)
      expect(acc1.id).toBeDefined()
      expect(acc1.kind).toBe('creator_payable')
      expect(acc1.currency).toBe('INR')

      // Second call returns the exact same account
      const acc2 = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'creator_payable', INR)
      expect(acc2.id).toBe(acc1.id)

      const accounts = await ledgerRepo.listAccounts(scope)
      expect(accounts).toHaveLength(1)
      expect(accounts[0]?.id).toBe(acc1.id)
    })
  })

  it('posts a balanced transaction and supports idempotent replay', async () => {
    await inScope(ws1Id, async (scope) => {
      const creatorAccount = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'creator_payable',
        INR,
      )

      // Seed a processor account manually for the test
      const [procAcc] = await control<{ id: string }[]>`
        INSERT INTO ledger_accounts (owner_type, owner_id, kind, currency)
        VALUES ('processor', NULL, 'processor_clearing', 'INR') RETURNING id
      `
      const processorAccountId = procAcc?.id ?? ''

      const postInput = {
        workspaceId: workspaceId(ws1Id),
        kind: 'order_payment' as const,
        referenceType: 'order',
        referenceId: 'ord_repo_001',
        idempotencyKey: 'idemp_key_repo_001',
        entries: [
          {
            accountId: ledgerAccountId(processorAccountId),
            direction: 'debit' as const,
            amount: 10_000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAccount.id),
            direction: 'credit' as const,
            amount: 10_000n,
            currency: INR,
          },
        ],
      }

      // 1. Post transaction
      const result1 = await ledgerRepo.postTransaction(scope, postInput)
      expect(result1.idempotentReplay).toBe(false)
      expect(result1.entries).toHaveLength(2)

      // 2. Derive balance
      const creatorBalance1 = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(creatorAccount.id),
      )
      expect(creatorBalance1.amount).toBe(10_000n)
      expect(creatorBalance1.currency).toBe('INR')

      // 3. Post again with identical idempotencyKey
      const result2 = await ledgerRepo.postTransaction(scope, postInput)
      expect(result2.idempotentReplay).toBe(true)
      expect(result2.transaction.id).toBe(result1.transaction.id)
      expect(result2.entries).toHaveLength(2)

      // Balance must remain strictly 10,000n (no duplicate posting)
      const creatorBalance2 = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(creatorAccount.id),
      )
      expect(creatorBalance2.amount).toBe(10_000n)
    })
  })

  it('correctly derives live balances for multiple debits and credits', async () => {
    await inScope(ws1Id, async (scope) => {
      const creatorAccount = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'creator_payable',
        INR,
      )

      const [procAcc] = await control<{ id: string }[]>`
        INSERT INTO ledger_accounts (owner_type, owner_id, kind, currency)
        VALUES ('processor', NULL, 'processor_clearing', 'INR') RETURNING id
      `
      const processorAccountId = procAcc?.id ?? ''

      // 1. First order payment: +5,000 INR to creator
      await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_1',
        idempotencyKey: 'tx_1',
        entries: [
          {
            accountId: ledgerAccountId(processorAccountId),
            direction: 'debit',
            amount: 5000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAccount.id),
            direction: 'credit',
            amount: 5000n,
            currency: INR,
          },
        ],
      })

      // 2. Second order payment: +3,000 INR to creator
      await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_2',
        idempotencyKey: 'tx_2',
        entries: [
          {
            accountId: ledgerAccountId(processorAccountId),
            direction: 'debit',
            amount: 3000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAccount.id),
            direction: 'credit',
            amount: 3000n,
            currency: INR,
          },
        ],
      })

      // 3. Payout to creator: -2,000 INR
      await ledgerRepo.postTransaction(scope, {
        kind: 'payout',
        referenceType: 'payout',
        referenceId: 'pay_1',
        idempotencyKey: 'tx_3',
        entries: [
          {
            accountId: ledgerAccountId(creatorAccount.id),
            direction: 'debit',
            amount: 2000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(processorAccountId),
            direction: 'credit',
            amount: 2000n,
            currency: INR,
          },
        ],
      })

      // Creator balance = Credits (5000 + 3000) - Debits (2000) = 6000 INR
      const creatorBalance = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(creatorAccount.id),
      )
      expect(creatorBalance.amount).toBe(6000n)

      // Processor balance = Debits (5000 + 3000) - Credits (2000) = 6000 INR
      const procBalance = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(processorAccountId),
      )
      expect(procBalance.amount).toBe(6000n)

      // List entries
      const entries = await ledgerRepo.listEntriesForAccount(
        scope,
        ledgerAccountId(creatorAccount.id),
      )
      expect(entries).toHaveLength(3)
    })
  })

  it('rejects unbalanced transactions before database write', async () => {
    await inScope(ws1Id, async (scope) => {
      const creatorAccount = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'creator_payable',
        INR,
      )

      // Single entry rejected
      await expect(
        ledgerRepo.postTransaction(scope, {
          kind: 'order_payment',
          referenceType: 'order',
          referenceId: 'ord_bad1',
          idempotencyKey: 'tx_bad1',
          entries: [
            {
              accountId: ledgerAccountId(creatorAccount.id),
              direction: 'credit',
              amount: 1000n,
              currency: INR,
            },
          ],
        }),
      ).rejects.toThrow(/A transaction must contain at least two entries/i)

      // Unbalanced multi-entry rejected
      await expect(
        ledgerRepo.postTransaction(scope, {
          kind: 'order_payment',
          referenceType: 'order',
          referenceId: 'ord_bad2',
          idempotencyKey: 'tx_bad2',
          entries: [
            {
              accountId: ledgerAccountId(creatorAccount.id),
              direction: 'credit',
              amount: 1000n,
              currency: INR,
            },
            {
              accountId: ledgerAccountId('018f3a55-6b5c-7e82-8411-2e63973f9999'),
              direction: 'debit',
              amount: 2000n,
              currency: INR,
            },
          ],
        }),
      ).rejects.toThrow(/Cannot post unbalanced transaction/i)
    })
  })
})
