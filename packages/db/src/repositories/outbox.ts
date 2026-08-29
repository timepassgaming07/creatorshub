/**
 * Transactional outbox repository and publisher (ADR-0009).
 *
 * Responsibilities:
 * 1. Write domain events inside the business transaction (guaranteeing dual-write consistency).
 * 2. Concurrently claim unpublished events using `FOR UPDATE SKIP LOCKED`.
 * 3. Mark events as published or record attempt errors.
 *
 * Dependencies: @creatorhub/contracts, drizzle-orm, schema.
 */
import type { WorkspaceId } from '@creatorhub/contracts'
import { eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues } from '../repository.js'
import { type NewOutboxRecord, type OutboxRecord, outbox } from '../schema/index.js'

export type OutboxEventProposal = {
  readonly workspaceId?: WorkspaceId
  readonly aggregateType: string
  readonly aggregateId: string
  readonly eventType: string
  readonly payload: Record<string, unknown>
  readonly metadata?: Record<string, unknown>
  readonly occurredAt?: Date
}

export type OutboxPublishResult = {
  readonly processed: number
  readonly succeeded: number
  readonly failed: number
}

/**
 * Writes a domain event to the outbox table inside the active database transaction.
 */
export async function writeOutboxEvent(
  scope: RepositoryScope,
  event: OutboxEventProposal,
): Promise<OutboxRecord> {
  const metadata = {
    requestId: scope.context.requestId,
    actorId: scope.context.actorId,
    ...event.metadata,
  }

  const [record] = await scope.tx
    .insert(outbox)
    .values(
      insertValues<NewOutboxRecord>(scope, {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        metadata,
        occurredAt: event.occurredAt ?? new Date(),
        attempts: 0,
      }),
    )
    .returning()

  if (!record) {
    throw new Error(`Failed to write outbox event ${event.eventType} for ${event.aggregateId}`)
  }

  return record
}

/**
 * Claims a batch of unpublished events for execution using `FOR UPDATE SKIP LOCKED`.
 * Concurrent workers calling this function will receive non-overlapping sets of events.
 */
export async function claimUnpublishedEvents(
  scope: RepositoryScope,
  limit = 50,
): Promise<OutboxRecord[]> {
  const query = sql`
    SELECT *
    FROM ${outbox}
    WHERE ${outbox.publishedAt} IS NULL
    ORDER BY ${outbox.occurredAt} ASC
    LIMIT ${limit}
    FOR UPDATE SKIP LOCKED
  `

  const result = await scope.tx.execute<OutboxRecord>(query)
  return Array.from(result)
}

/**
 * Marks an outbox event as successfully published.
 */
export async function markPublished(scope: RepositoryScope, eventId: string): Promise<void> {
  await scope.tx
    .update(outbox)
    .set({
      publishedAt: new Date(),
    })
    .where(eq(outbox.id, eventId))
}

/**
 * Records a failed attempt to publish an outbox event.
 */
export async function recordPublishError(
  scope: RepositoryScope,
  eventId: string,
  errorMessage: string,
): Promise<void> {
  await scope.tx
    .update(outbox)
    .set({
      attempts: sql`${outbox.attempts} + 1`,
      lastError: errorMessage,
    })
    .where(eq(outbox.id, eventId))
}

/**
 * Polls, claims, and dispatches a batch of unpublished events.
 */
export async function publishOutboxBatch(
  scope: RepositoryScope,
  handler: (event: OutboxRecord) => Promise<void>,
  limit = 50,
): Promise<OutboxPublishResult> {
  const events = await claimUnpublishedEvents(scope, limit)
  let succeeded = 0
  let failed = 0

  for (const event of events) {
    try {
      await handler(event)
      await markPublished(scope, event.id)
      succeeded += 1
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await recordPublishError(scope, event.id, msg)
      failed += 1
    }
  }

  return {
    processed: events.length,
    succeeded,
    failed,
  }
}
