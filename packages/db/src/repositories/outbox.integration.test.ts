/**
 * Transactional outbox repository integration tests (Item 2.6).
 *
 * Verifies against real PostgreSQL 18:
 * 1. Transactional atomicity: outbox events commit with business writes and rollback cleanly.
 * 2. Concurrent worker claiming with `FOR UPDATE SKIP LOCKED` (zero duplicate processing).
 * 3. Batch publisher lifecycle (success stamps `published_at`, failure records `attempts` and `last_error`).
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
import * as outboxRepo from './outbox.js'

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

describe('Transactional Outbox (Item 2.6)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE outbox, ledger_entries, ledger_transactions, ledger_accounts, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace Outbox', 'ws-outbox') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('outbox-user@example.com') RETURNING id
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
      requestId: requestId('req-test-outbox'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('writes outbox events atomically alongside business transactions', async () => {
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

      // 1. Business transaction: Post ledger payment
      const postResult = await ledgerRepo.postTransaction(scope, {
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: 'ord_outbox_01',
        idempotencyKey: 'idemp_outbox_01',
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

      // 2. Write outbox event in the same transaction
      const outboxRecord = await outboxRepo.writeOutboxEvent(scope, {
        aggregateType: 'order',
        aggregateId: 'ord_outbox_01',
        eventType: 'order.paid',
        payload: {
          orderId: 'ord_outbox_01',
          transactionId: postResult.transaction.id,
          amount: '5000',
          currency: 'INR',
        },
      })

      expect(outboxRecord.id).toBeDefined()
      expect(outboxRecord.publishedAt).toBeNull()
      expect(outboxRecord.attempts).toBe(0)
    })

    // Verify row exists in database after commit
    const rows = await control<
      { event_type: string }[]
    >`SELECT * FROM outbox WHERE aggregate_id = 'ord_outbox_01'`
    expect(rows).toHaveLength(1)
    expect(rows[0]?.event_type).toBe('order.paid')
  })

  it('rolls back outbox events when the business transaction fails', async () => {
    await expect(
      inScope(ws1Id, async (scope) => {
        await outboxRepo.writeOutboxEvent(scope, {
          aggregateType: 'order',
          aggregateId: 'ord_failed',
          eventType: 'order.paid',
          payload: { orderId: 'ord_failed' },
        })

        // Force a transaction failure
        throw new Error('Simulated business logic failure')
      }),
    ).rejects.toThrow('Simulated business logic failure')

    // Proves outbox event was not written
    const rows = await control`SELECT * FROM outbox WHERE aggregate_id = 'ord_failed'`
    expect(rows).toHaveLength(0)
  })

  it('guarantees mutually exclusive claiming across concurrent workers via FOR UPDATE SKIP LOCKED', async () => {
    // Seed 20 outbox events
    await inScope(ws1Id, async (scope) => {
      for (let i = 1; i <= 20; i++) {
        await outboxRepo.writeOutboxEvent(scope, {
          aggregateType: 'order',
          aggregateId: `ord_concurrent_${String(i)}`,
          eventType: 'order.created',
          payload: { index: i },
        })
      }
    })

    const claimedEventIds: string[] = []

    // Run 4 concurrent workers claiming 5 events each
    const workerPromises = Array.from({ length: 4 }).map((_, workerIdx) =>
      inScope(ws1Id, async (scope) => {
        const events = await outboxRepo.claimUnpublishedEvents(scope, 5)
        for (const ev of events) {
          claimedEventIds.push(ev.id)
          // Simulate some processing delay
          await new Promise((r) => setTimeout(r, 10))
          await outboxRepo.markPublished(scope, ev.id)
        }
        return { worker: workerIdx, count: events.length }
      }),
    )

    const results = await Promise.all(workerPromises)

    // Total claimed must equal 20
    expect(claimedEventIds).toHaveLength(20)

    // Distinct set of claimed IDs must equal 20 (zero duplicates / zero overlap)
    const uniqueClaimedIds = new Set(claimedEventIds)
    expect(uniqueClaimedIds.size).toBe(20)

    for (const res of results) {
      expect(res.count).toBe(5)
    }

    // Verify all 20 are now marked published
    const remaining = await control`SELECT * FROM outbox WHERE published_at IS NULL`
    expect(remaining).toHaveLength(0)
  })

  it('handles batch publishing with partial failures, updating attempts and errors', async () => {
    await inScope(ws1Id, async (scope) => {
      await outboxRepo.writeOutboxEvent(scope, {
        aggregateType: 'order',
        aggregateId: 'ord_success',
        eventType: 'order.paid',
        payload: { status: 'ok' },
      })

      await outboxRepo.writeOutboxEvent(scope, {
        aggregateType: 'order',
        aggregateId: 'ord_fail',
        eventType: 'order.paid',
        payload: { status: 'throw' },
      })
    })

    await inScope(ws1Id, async (scope) => {
      const result = await outboxRepo.publishOutboxBatch(
        scope,
        async (event) => {
          await Promise.resolve()
          const payload = event.payload as { status: string }
          if (payload.status === 'throw') {
            throw new Error('Downstream email provider timeout')
          }
        },
        10,
      )

      expect(result.processed).toBe(2)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(1)
    })

    // Succeeded event has published_at timestamp
    const [successRow] = await control<{ published_at: Date | null }[]>`
      SELECT published_at FROM outbox WHERE aggregate_id = 'ord_success'
    `
    expect(successRow?.published_at).not.toBeNull()

    // Failed event has attempts = 1, last_error recorded, and published_at is null
    const [failedRow] = await control<
      { published_at: Date | null; attempts: number; last_error: string }[]
    >`
      SELECT published_at, attempts, last_error FROM outbox WHERE aggregate_id = 'ord_fail'
    `
    expect(failedRow?.published_at).toBeNull()
    expect(failedRow?.attempts).toBe(1)
    expect(failedRow?.last_error).toContain('Downstream email provider timeout')
  })
})
