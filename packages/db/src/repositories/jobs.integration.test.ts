/**
 * Jobs repository integration tests (Item 2.7).
 *
 * Verifies against PostgreSQL 18:
 * 1. Transactional enqueueing: jobs commit with business writes and rollback cleanly.
 * 2. Concurrent worker claiming with `FOR UPDATE SKIP LOCKED` (zero duplicate claims).
 * 3. Successful job completion lifecycle.
 * 4. Exponential backoff rescheduling on transient failure.
 * 5. Dead-lettering on exhausted max_attempts or unknown job type.
 * 6. Idempotency key deduplication.
 */
import { randomUUID } from 'node:crypto'
import { requestId, userId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as jobsRepo from './jobs.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

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

describe('Postgres Jobs Queue (Item 2.7)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE jobs, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace Jobs', 'ws-jobs') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('jobs-user@example.com') RETURNING id
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
      requestId: requestId('req-test-jobs'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('enqueues jobs transactionally and rolls back when transaction fails', async () => {
    // 1. Successful commit
    await inScope(ws1Id, async (scope) => {
      const job = await jobsRepo.enqueueJob(scope, {
        queue: 'default',
        type: 'send_receipt',
        payload: { orderId: 'ord_123' },
      })
      expect(job.id).toBeDefined()
      expect(job.status).toBe('queued')
      expect(job.attempts).toBe(0)
    })

    const rows = await control<{ id: string }[]>`SELECT id FROM jobs WHERE type = 'send_receipt'`
    expect(rows).toHaveLength(1)

    // 2. Rollback case
    await expect(
      inScope(ws1Id, async (scope) => {
        await jobsRepo.enqueueJob(scope, {
          queue: 'default',
          type: 'send_receipt_fail',
          payload: { orderId: 'ord_fail' },
        })
        throw new Error('Business error aborting transaction')
      }),
    ).rejects.toThrow('Business error aborting transaction')

    const failRows = await control<
      { id: string }[]
    >`SELECT id FROM jobs WHERE type = 'send_receipt_fail'`
    expect(failRows).toHaveLength(0)
  })

  it('enforces idempotency key uniqueness', async () => {
    await inScope(ws1Id, async (scope) => {
      await jobsRepo.enqueueJob(scope, {
        queue: 'default',
        type: 'order_webhook',
        payload: { orderId: 'ord_unique' },
        idempotencyKey: 'idemp_job_unique_01',
      })
    })

    // Attempting to insert same idempotencyKey throws unique constraint violation
    await expect(
      inScope(ws1Id, async (scope) => {
        await jobsRepo.enqueueJob(scope, {
          queue: 'default',
          type: 'order_webhook',
          payload: { orderId: 'ord_unique' },
          idempotencyKey: 'idemp_job_unique_01',
        })
      }),
    ).rejects.toThrow()
  })

  it('claims queued jobs concurrently with FOR UPDATE SKIP LOCKED without duplicate claims', async () => {
    // Seed 20 jobs
    await inScope(ws1Id, async (scope) => {
      for (let i = 1; i <= 20; i++) {
        await jobsRepo.enqueueJob(scope, {
          queue: 'high_priority',
          type: 'process_file',
          payload: { fileIndex: i },
        })
      }
    })

    const claimedJobIds: string[] = []

    // 4 concurrent workers claim 5 jobs each
    const workers = Array.from({ length: 4 }).map((_, idx) =>
      inScope(ws1Id, async (scope) => {
        const claimed = await jobsRepo.claimJobs(scope, 'high_priority', `worker_${String(idx)}`, 5)
        for (const job of claimed) {
          claimedJobIds.push(job.id)
          expect(job.status).toBe('running')
          expect(job.lockedBy).toBe(`worker_${String(idx)}`)
          expect(job.lockedAt).not.toBeNull()
          expect(job.attempts).toBe(1)
        }
        return claimed.length
      }),
    )

    const results = await Promise.all(workers)
    expect(claimedJobIds).toHaveLength(20)

    const uniqueClaimed = new Set(claimedJobIds)
    expect(uniqueClaimed.size).toBe(20)

    for (const count of results) {
      expect(count).toBe(5)
    }
  })

  it('handles worker batch execution: success, retry with backoff, and dead-lettering', async () => {
    const queueName = `q_batch_${randomUUID().slice(0, 8)}`
    // Enqueue 3 jobs: 1 to succeed, 1 to fail and retry, 1 with no handler (dead-letter immediately)
    await inScope(ws1Id, async (scope) => {
      await jobsRepo.enqueueJob(scope, {
        queue: queueName,
        type: 'job_ok',
        payload: { name: 'ok' },
        maxAttempts: 3,
      })

      await jobsRepo.enqueueJob(scope, {
        queue: queueName,
        type: 'job_retry',
        payload: { name: 'retry' },
        maxAttempts: 3,
      })

      await jobsRepo.enqueueJob(scope, {
        queue: queueName,
        type: 'job_unhandled',
        payload: { name: 'unhandled' },
        maxAttempts: 3,
      })
    })

    // Run worker batch
    await inScope(ws1Id, async (scope) => {
      const result = await jobsRepo.runWorkerBatch(
        scope,
        queueName,
        'worker_test_1',
        {
          job_ok: async (_job) => {
            await Promise.resolve()
          },
          job_retry: async (_job) => {
            await Promise.resolve()
            throw new Error('Temporary gateway timeout')
          },
        },
        10,
        { baseMs: 5000, maxMs: 60_000, factor: 2, jitterRatio: 0 },
      )

      expect(result.processed).toBe(3)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(1)
      expect(result.dead).toBe(1)
    })

    // Assert status in database
    const [okRow] = await control<{ status: string; locked_by: string | null }[]>`
      SELECT status, locked_by FROM jobs WHERE queue = ${queueName} AND type = 'job_ok'
    `
    expect(okRow?.status).toBe('succeeded')
    expect(okRow?.locked_by).toBeNull()

    const [retryRow] = await control<
      { status: string; attempts: number; last_error: string; run_after: Date }[]
    >`
      SELECT status, attempts, last_error, run_after FROM jobs WHERE queue = ${queueName} AND type = 'job_retry'
    `
    expect(retryRow?.status).toBe('queued')
    expect(retryRow?.attempts).toBe(1)
    expect(retryRow?.last_error).toContain('Temporary gateway timeout')
    expect(new Date(retryRow?.run_after ?? 0).getTime()).toBeGreaterThan(Date.now())

    const [unhandledRow] = await control<
      { status: string; attempts: number; last_error: string }[]
    >`
      SELECT status, attempts, last_error FROM jobs WHERE queue = ${queueName} AND type = 'job_unhandled'
    `
    expect(unhandledRow?.status).toBe('dead')
    expect(unhandledRow?.last_error).toContain('No handler registered')
  })

  it('dead-letters a job when max_attempts is reached', async () => {
    const queueName = `q_exhaust_${randomUUID().slice(0, 8)}`
    let jobIdVal = ''
    await inScope(ws1Id, async (scope) => {
      const job = await jobsRepo.enqueueJob(scope, {
        queue: queueName,
        type: 'always_fail',
        payload: {},
        maxAttempts: 2,
      })
      jobIdVal = job.id
    })

    // Attempt 1: fails -> queued
    await inScope(ws1Id, async (scope) => {
      const res1 = await jobsRepo.runWorkerBatch(
        scope,
        queueName,
        'w1',
        {
          always_fail: async () => {
            await Promise.resolve()
            throw new Error('Failure 1')
          },
        },
        10,
        { baseMs: 1, maxMs: 10, factor: 1, jitterRatio: 0 },
      )
      expect(res1.failed).toBe(1)
      expect(res1.dead).toBe(0)
    })

    // Force run_after to past so it can be claimed for attempt 2
    await control`UPDATE jobs SET run_after = now() - interval '1 second' WHERE id = ${jobIdVal}`

    // Attempt 2: fails -> maxAttempts (2) reached -> dead
    await inScope(ws1Id, async (scope) => {
      const res2 = await jobsRepo.runWorkerBatch(
        scope,
        queueName,
        'w1',
        {
          always_fail: async () => {
            await Promise.resolve()
            throw new Error('Failure 2')
          },
        },
        10,
      )
      expect(res2.failed).toBe(0)
      expect(res2.dead).toBe(1)
    })

    const [deadRow] = await control<{ status: string; attempts: number; last_error: string }[]>`
      SELECT status, attempts, last_error FROM jobs WHERE id = ${jobIdVal}
    `
    expect(deadRow?.status).toBe('dead')
    expect(deadRow?.attempts).toBe(2)
    expect(deadRow?.last_error).toContain('Failure 2')
  })
})
