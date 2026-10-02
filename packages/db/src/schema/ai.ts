/**
 * AI Usage & Cost Accounting Schema (Slice 10 §10.6).
 *
 * Responsibilities:
 * 1. Store individual AI generation invocations per workspace and user.
 * 2. Token counts (prompt, completion, total) and calculated cost in micro-cents.
 * 3. Enforce multi-tenant RLS isolation.
 */
import { bigint, index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { users, workspaces } from './identity.js'

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    promptId: varchar('prompt_id', { length: 64 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 16 }).notNull().default('1.0.0'),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 64 }).notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    costMicroCents: bigint('cost_micro_cents', { mode: 'bigint' }).notNull().default(0n),
    status: varchar('status', { length: 32 }).notNull().default('success'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_usage_ws_created').on(table.workspaceId, table.createdAt),
    index('idx_ai_usage_ws_prompt').on(table.workspaceId, table.promptId),
    index('idx_ai_usage_ws_user').on(table.workspaceId, table.userId),
  ],
)

export type AiUsageRow = typeof aiUsage.$inferSelect
export type InsertAiUsageRow = typeof aiUsage.$inferInsert
