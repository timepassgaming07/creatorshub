/**
 * Webhook Events Schema (Slice 5 §5.7).
 *
 * Responsibilities:
 * - Define `webhook_events` table for webhook deduplication, signature verification, and exactly-once processing.
 * - Multi-tenant isolation: Every table carries a non-null `workspace_id` referencing `workspaces(id)`.
 */
import { WEBHOOK_EVENT_STATUSES } from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'
import { paymentProvider } from './payments.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const webhookEventStatus = pgEnum('webhook_event_status', WEBHOOK_EVENT_STATUSES)

// ---------------------------------------------------------------------------
// webhook_events
// ---------------------------------------------------------------------------

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    provider: paymentProvider('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type').notNull(),
    status: webhookEventStatus('status').notNull().default('received'),
    signatureVerified: boolean('signature_verified').notNull().default(false),
    payload: jsonb('payload').notNull(),
    error: text('error'),
    retryCount: integer('retry_count').notNull().default(0),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true, mode: 'date' }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_webhook_events_provider_event').on(
      table.workspaceId,
      table.provider,
      table.providerEventId,
    ),
    index('idx_webhook_events_status').on(table.workspaceId, table.status),
    index('idx_webhook_events_event_type').on(table.workspaceId, table.eventType),
  ],
)

export type WebhookEventRecord = typeof webhookEvents.$inferSelect
export type NewWebhookEventRecord = typeof webhookEvents.$inferInsert
