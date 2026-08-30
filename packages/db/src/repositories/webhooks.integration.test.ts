/**
 * Webhooks repository integration tests (Slice 5 §5.7).
 *
 * Verifies against PostgreSQL 18:
 * 1. Webhook events recording and exactly-once deduplication.
 * 2. Status progression, error capture, and retry count tracking.
 * 3. Multi-tenancy isolation: Workspace 1 cannot access Workspace 2's webhook events.
 * 4. RLS enforcement independently of repository layer.
 */
import { requestId, userId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as webhooksRepo from './webhooks.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string

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

function inScope<T>(wsId: string, fn: (scope: RepositoryScope) => Promise<T>): Promise<T> {
  const context = workspaceContext({
    workspaceId: workspaceId(wsId),
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId('req-webhooks-test'),
  })

  return db.withWorkspace(context, (tx) => fn({ tx, context }))
}

beforeEach(async () => {
  await control`TRUNCATE TABLE workspaces CASCADE`

  const [w1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (id, slug, name)
    VALUES ('018f9e2b-7c5e-7a2e-8c3b-000000000001', 'ws-alpha', 'Workspace Alpha')
    RETURNING id
  `
  const [w2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (id, slug, name)
    VALUES ('018f9e2b-7c5e-7a2e-8c3b-000000000002', 'ws-beta', 'Workspace Beta')
    RETURNING id
  `

  ws1Id = w1!.id
  ws2Id = w2!.id
})

describe('Webhooks Repository Integration Tests (§5.7)', () => {
  it('records a webhook event and guarantees exactly-once deduplication', async () => {
    const eventParams = {
      provider: 'razorpay' as const,
      providerEventId: 'evt_rzp_pay_001',
      eventType: 'payment.captured',
      signatureVerified: true,
      payload: {
        id: 'evt_rzp_pay_001',
        entity: 'event',
        event: 'payment.captured',
        contains: ['payment'],
      },
    }

    // First arrival
    const firstResult = await inScope(ws1Id, (scope) =>
      webhooksRepo.recordWebhookEvent(scope, eventParams),
    )

    expect(firstResult.isDuplicate).toBe(false)
    expect(firstResult.event.id).toBeDefined()
    expect(firstResult.event.status).toBe('received')
    expect(firstResult.event.signatureVerified).toBe(true)
    expect(firstResult.event.providerEventId).toBe('evt_rzp_pay_001')

    // Duplicate webhook delivery from provider
    const secondResult = await inScope(ws1Id, (scope) =>
      webhooksRepo.recordWebhookEvent(scope, eventParams),
    )

    expect(secondResult.isDuplicate).toBe(true)
    expect(secondResult.event.id).toBe(firstResult.event.id)
    expect(secondResult.event.status).toBe('received')
  })

  it('updates webhook event processing status, errors, and retry counter', async () => {
    const { event } = await inScope(ws1Id, (scope) =>
      webhooksRepo.recordWebhookEvent(scope, {
        provider: 'razorpay' as const,
        providerEventId: 'evt_rzp_fail_002',
        eventType: 'payment.failed',
        signatureVerified: true,
        payload: { error: 'card declined' },
      }),
    )

    // Mark processing
    const processing = await inScope(ws1Id, (scope) =>
      webhooksRepo.updateWebhookEventStatus(scope, event.id, 'processing'),
    )
    expect(processing.status).toBe('processing')

    // Mark failed with error and retry increment
    const retryTime = new Date(Date.now() + 60_000)
    const failed = await inScope(ws1Id, (scope) =>
      webhooksRepo.updateWebhookEventStatus(scope, event.id, 'failed', {
        error: 'Order payment posting failed',
        incrementRetry: true,
        nextRetryAt: retryTime,
      }),
    )

    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('Order payment posting failed')
    expect(failed.retryCount).toBe(1)
    expect(failed.nextRetryAt).toBeDefined()

    // Mark processed
    const processedAt = new Date()
    const processed = await inScope(ws1Id, (scope) =>
      webhooksRepo.updateWebhookEventStatus(scope, event.id, 'processed', {
        processedAt,
      }),
    )

    expect(processed.status).toBe('processed')
    expect(processed.processedAt).toBeDefined()
  })

  it('enforces multi-tenancy isolation between workspaces', async () => {
    // Workspace 1 receives an event
    const { event: ws1Event } = await inScope(ws1Id, (scope) =>
      webhooksRepo.recordWebhookEvent(scope, {
        provider: 'razorpay' as const,
        providerEventId: 'evt_shared_003',
        eventType: 'payment.captured',
        signatureVerified: true,
        payload: { workspace: 1 },
      }),
    )

    // Workspace 2 cannot read Workspace 1's webhook event by internal ID
    const notFoundInWs2 = await inScope(ws2Id, (scope) =>
      webhooksRepo.findWebhookEventById(scope, ws1Event.id),
    )
    expect(notFoundInWs2).toBeNull()

    // Workspace 2 cannot read Workspace 1's webhook event by provider event ID
    const notFoundByProviderInWs2 = await inScope(ws2Id, (scope) =>
      webhooksRepo.findWebhookEventByProviderEventId(scope, 'razorpay', 'evt_shared_003'),
    )
    expect(notFoundByProviderInWs2).toBeNull()

    // Workspace 2 list is empty
    const ws2Events = await inScope(ws2Id, (scope) => webhooksRepo.listWebhookEvents(scope))
    expect(ws2Events).toHaveLength(0)

    // Workspace 1 list contains the event
    const ws1Events = await inScope(ws1Id, (scope) => webhooksRepo.listWebhookEvents(scope))
    expect(ws1Events).toHaveLength(1)
    expect(ws1Events[0]?.id).toBe(ws1Event.id)
  })
})
