/**
 * Transactional Outbox schema (ADR-0009).
 *
 * Responsibilities: define `outbox` table for atomic dual-write event publication.
 * Dependencies: drizzle-orm, identity schema.
 *
 * Invariants:
 * 1. Domain events are written inside the transaction that produced the state change.
 * 2. Unprocessed rows are polled and locked using `FOR UPDATE SKIP LOCKED`.
 * 3. Partial index on `published_at IS NULL` keeps the polling hot path fast.
 */
import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const createdAt = () => timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow()

export const outbox = pgTable(
  'outbox',
  {
    id: primaryKey(),

    /**
     * Nullable for platform-wide events (e.g. system adjustments or platform configuration).
     * Populated with workspace_id for tenant events.
     */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),

    payload: jsonb('payload').notNull(),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    occurredAt: createdAt(),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    index('outbox_unpublished_idx')
      .on(table.occurredAt)
      .where(sql`${table.publishedAt} IS NULL`),
    index('outbox_workspace_occurred_idx').on(table.workspaceId, table.occurredAt),
    index('outbox_aggregate_idx').on(table.aggregateType, table.aggregateId),
  ],
)

export type OutboxRecord = typeof outbox.$inferSelect
export type NewOutboxRecord = typeof outbox.$inferInsert
