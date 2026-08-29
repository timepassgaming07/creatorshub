/**
 * Idempotency repository integration tests (Item 2.8).
 *
 * Verifies against PostgreSQL 18:
 * 1. Initial execution returns computed response and saves record.
 * 2. Replay with identical payload returns cached response (replayed=true) without re-executing.
 * 3. Replay with modified payload throws IdempotencyConflictError.
 * 4. Concurrent in-flight request with same key throws IdempotencyInProgressError.
 * 5. Failed execution releases in-flight reservation allowing subsequent retry.
 */
import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
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
import * as idempotencyRepo from './idempotency.js'

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

describe('Idempotency Keys Repository (Item 2.8)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE idempotency_keys, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace Idemp', 'ws-idemp') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('idemp-user@example.com') RETURNING id
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
      requestId: requestId('req-test-idemp'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('executes initially, then replays cached response without re-executing', async () => {
    let executionCount = 0

    const payload = { amount: 5000, currency: 'INR', orderId: 'ord_1' }

    // First execution
    const firstResult = await inScope(ws1Id, async (scope) =>
      idempotencyRepo.withIdempotency(
        scope,
        { scope: 'checkout', key: 'idemp_key_01', payload },
        async () => {
          await Promise.resolve()
          executionCount += 1
          return { status: 201, body: { orderId: 'ord_1', state: 'created' } }
        },
      ),
    )

    expect(firstResult.replayed).toBe(false)
    expect(firstResult.status).toBe(201)
    expect(firstResult.body).toEqual({ orderId: 'ord_1', state: 'created' })
    expect(executionCount).toBe(1)

    // Second execution with exact same payload
    const secondResult = await inScope(ws1Id, async (scope) =>
      idempotencyRepo.withIdempotency(
        scope,
        { scope: 'checkout', key: 'idemp_key_01', payload },
        async () => {
          await Promise.resolve()
          executionCount += 1
          return { status: 201, body: { orderId: 'ord_1', state: 'created' } }
        },
      ),
    )

    expect(secondResult.replayed).toBe(true)
    expect(secondResult.status).toBe(201)
    expect(secondResult.body).toEqual({ orderId: 'ord_1', state: 'created' })
    expect(executionCount).toBe(1) // Handler was not re-executed!
  })

  it('rejects replay attempt with modified payload via IdempotencyConflictError', async () => {
    const payloadA = { amount: 5000, currency: 'INR' }
    const payloadB = { amount: 9000, currency: 'INR' }

    // Initial execution with payload A
    await inScope(ws1Id, async (scope) =>
      idempotencyRepo.withIdempotency(
        scope,
        { scope: 'checkout', key: 'idemp_key_conflict', payload: payloadA },
        async () => {
          await Promise.resolve()
          return { status: 200, body: { success: true } }
        },
      ),
    )

    // Replay attempt with payload B for same key
    await expect(
      inScope(ws1Id, async (scope) =>
        idempotencyRepo.withIdempotency(
          scope,
          { scope: 'checkout', key: 'idemp_key_conflict', payload: payloadB },
          async () => {
            await Promise.resolve()
            return { status: 200, body: { success: true } }
          },
        ),
      ),
    ).rejects.toThrow(IdempotencyConflictError)
  })

  it('rejects concurrent in-flight requests with IdempotencyInProgressError', async () => {
    const payload = { test: true }

    // Step 1: Simulate in-flight reservation by acquiring key directly with matching hash
    await inScope(ws1Id, async (scope) => {
      const res = await idempotencyRepo.acquireIdempotencyKey(scope, {
        scope: 'payment',
        key: 'idemp_key_inflight',
        requestHash: idempotencyRepo.hashPayload(payload),
      })
      expect(res.state).toBe('new')
    })

    // Step 2: Attempt to execute with same in-flight key and matching payload
    await expect(
      inScope(ws1Id, async (scope) =>
        idempotencyRepo.withIdempotency(
          scope,
          { scope: 'payment', key: 'idemp_key_inflight', payload },
          async () => {
            await Promise.resolve()
            return { status: 200, body: {} }
          },
        ),
      ),
    ).rejects.toThrow(IdempotencyInProgressError)
  })

  it('releases key reservation when execution throws, allowing subsequent retry to succeed', async () => {
    const payload = { retryable: true }
    let attempts = 0

    // Execution fails on first attempt
    await expect(
      inScope(ws1Id, async (scope) =>
        idempotencyRepo.withIdempotency(
          scope,
          { scope: 'action', key: 'idemp_key_fail', payload },
          async () => {
            await Promise.resolve()
            attempts += 1
            throw new Error('Upstream network timeout')
          },
        ),
      ),
    ).rejects.toThrow('Upstream network timeout')

    expect(attempts).toBe(1)

    // Second attempt with same key succeeds because failed in-flight lock was released
    const retryResult = await inScope(ws1Id, async (scope) =>
      idempotencyRepo.withIdempotency(
        scope,
        { scope: 'action', key: 'idemp_key_fail', payload },
        async () => {
          await Promise.resolve()
          attempts += 1
          return { status: 200, body: { recovered: true } }
        },
      ),
    )

    expect(retryResult.replayed).toBe(false)
    expect(retryResult.body).toEqual({ recovered: true })
    expect(attempts).toBe(2)
  })
})
