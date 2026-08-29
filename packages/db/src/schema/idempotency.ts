/**
 * Idempotency keys schema (ADR-0004, ADR-0009).
 *
 * Responsibilities: define `idempotency_keys` table for deduplicating mutating
 * HTTP requests, payment intents, ledger postings, and job executions.
 *
 * Invariants:
 * 1. Scope + Key is strictly unique across the database.
 * 2. Uncompleted requests have `response_status IS NULL`.
 * 3. Expired keys are safe to sweep or overwrite.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
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

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: primaryKey(),

    /**
     * Nullable for platform-wide operations or unauthenticated checkout endpoints.
     * Populated for authenticated tenant requests.
     */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),

    scope: varchar('scope', { length: 128 }).notNull(),
    key: varchar('key', { length: 255 }).notNull(),

    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),

    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_keys_scope_key_uq').on(table.scope, table.key),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
    index('idempotency_keys_workspace_idx').on(table.workspaceId, table.createdAt),
  ],
)

export type IdempotencyKeyRecord = typeof idempotencyKeys.$inferSelect
export type NewIdempotencyKeyRecord = typeof idempotencyKeys.$inferInsert
