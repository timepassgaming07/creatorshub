/**
 * Postgres-backed jobs schema (ADR-0009).
 *
 * Responsibilities: define `jobs` table and `job_status` enum for asynchronous work queue.
 * Dependencies: drizzle-orm, identity schema.
 *
 * Invariants:
 * 1. Jobs can be enqueued inside business transactions atomically.
 * 2. Partial index on `(queue, status, run_after) WHERE status = 'queued'` keeps the polling hot path fast.
 * 3. Atomic claiming via `FOR UPDATE SKIP LOCKED`.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const jobStatus = pgEnum('job_status', ['queued', 'running', 'succeeded', 'failed', 'dead'])

export const jobs = pgTable(
  'jobs',
  {
    id: primaryKey(),

    /**
     * Nullable for platform-wide background jobs (e.g. partition creation, reconciliation).
     * Populated for tenant-scoped jobs.
     */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    queue: varchar('queue', { length: 64 }).notNull().default('default'),
    type: varchar('type', { length: 128 }).notNull(),
    payload: jsonb('payload').notNull(),

    status: jobStatus('status').notNull().default('queued'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),

    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),

    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 128 }),

    lastError: text('last_error'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('jobs_queued_idx')
      .on(table.queue, table.status, table.runAfter)
      .where(sql`${table.status} = 'queued'`),
    index('jobs_workspace_created_idx').on(table.workspaceId, table.createdAt),
    uniqueIndex('jobs_idempotency_key_idx')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
)

export type JobTableRecord = typeof jobs.$inferSelect
export type NewJobTableRecord = typeof jobs.$inferInsert
