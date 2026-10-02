/**
 * Affiliate Programme & Multi-Tier Attribution Schema (Slice 8 §8.1-§8.5).
 *
 * Responsibilities:
 * - Define `affiliate_programs`, `affiliates`, `affiliate_links`, `affiliate_clicks`, and `attributions`.
 * - Zero-float basis points and minor units.
 * - Multi-tenant RLS isolation on workspace_id.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users, workspaces } from './identity.js'
import { orders } from './orders.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

/**
 * Affiliate Programs Table:
 * Workspace-level settings.
 */
export const affiliatePrograms = pgTable(
  'affiliate_programs',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' })
      .unique(),
    isActive: boolean('is_active').notNull().default(false),
    defaultCommissionBps: integer('default_commission_bps').notNull().default(2000),
    cookieWindowDays: integer('cookie_window_days').notNull().default(30),
    allowSelfReferral: boolean('allow_self_referral').notNull().default(false),
    autoApproveAffiliates: boolean('auto_approve_affiliates').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [index('idx_affiliate_programs_ws').on(table.workspaceId)],
)

export type AffiliateProgramRow = typeof affiliatePrograms.$inferSelect
export type NewAffiliateProgramRow = typeof affiliatePrograms.$inferInsert

/**
 * Affiliates (Promoters) Table:
 * Scoped by workspace_id.
 */
export const affiliates = pgTable(
  'affiliates',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: citext('email').notNull(),
    name: text('name'),
    status: text('status').notNull().default('pending'),
    customCommissionBps: integer('custom_commission_bps'),
    payoutAccount: jsonb('payout_account')
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),
    totalEarnings: bigint('total_earnings', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    totalConversions: integer('total_conversions').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('affiliates_workspace_email_unique').on(table.workspaceId, table.email),
    index('idx_affiliates_ws_status').on(table.workspaceId, table.status),
    index('idx_affiliates_ws_email').on(table.workspaceId, table.email),
  ],
)

export type AffiliateRow = typeof affiliates.$inferSelect
export type NewAffiliateRow = typeof affiliates.$inferInsert

/**
 * Affiliate Links Table:
 * Unique referral codes per workspace.
 */
export const affiliateLinks = pgTable(
  'affiliate_links',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'restrict' }),
    code: citext('code').notNull(),
    destinationUrl: text('destination_url'),
    clicksCount: integer('clicks_count').notNull().default(0),
    conversionsCount: integer('conversions_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('affiliate_links_workspace_code_unique').on(table.workspaceId, table.code),
    index('idx_affiliate_links_ws_code').on(table.workspaceId, table.code),
    index('idx_affiliate_links_ws_affiliate').on(table.workspaceId, table.affiliateId),
  ],
)

export type AffiliateLinkRow = typeof affiliateLinks.$inferSelect
export type NewAffiliateLinkRow = typeof affiliateLinks.$inferInsert

/**
 * Affiliate Clicks Table:
 * Salted IP hash and bot tracking.
 */
export const affiliateClicks = pgTable(
  'affiliate_clicks',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    affiliateLinkId: uuid('affiliate_link_id')
      .notNull()
      .references(() => affiliateLinks.id, { onDelete: 'restrict' }),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'restrict' }),
    visitorToken: text('visitor_token').notNull(),
    ipHash: text('ip_hash').notNull(),
    userAgent: text('user_agent'),
    referer: text('referer'),
    isBot: boolean('is_bot').notNull().default(false),
    clickedAt: timestamp('clicked_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    index('idx_affiliate_clicks_ws_link').on(
      table.workspaceId,
      table.affiliateLinkId,
      table.clickedAt,
    ),
  ],
)

export type AffiliateClickRow = typeof affiliateClicks.$inferSelect
export type NewAffiliateClickRow = typeof affiliateClicks.$inferInsert

/**
 * Order Attributions Table:
 * Permanent immutable record of order-to-affiliate attribution decisions.
 */
export const attributions = pgTable(
  'attributions',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    affiliateId: uuid('affiliate_id')
      .notNull()
      .references(() => affiliates.id, { onDelete: 'restrict' }),
    affiliateLinkId: uuid('affiliate_link_id')
      .notNull()
      .references(() => affiliateLinks.id, { onDelete: 'restrict' }),
    affiliateClickId: uuid('affiliate_click_id').references(() => affiliateClicks.id, {
      onDelete: 'set null',
    }),
    commissionBps: integer('commission_bps').notNull(),
    commissionAmount: bigint('commission_amount', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    status: text('status').notNull(),
    rejectionReason: text('rejection_reason'),
    attributedAt: timestamp('attributed_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    uniqueIndex('attributions_workspace_order_unique').on(table.workspaceId, table.orderId),
    index('idx_attributions_ws_order').on(table.workspaceId, table.orderId),
    index('idx_attributions_ws_affiliate').on(table.workspaceId, table.affiliateId, table.status),
  ],
)

export type AttributionRow = typeof attributions.$inferSelect
export type NewAttributionRow = typeof attributions.$inferInsert
