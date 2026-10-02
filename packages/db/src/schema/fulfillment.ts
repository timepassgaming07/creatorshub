/**
 * Digital Fulfillment Schema (Slice 6 §6.1, §6.3).
 *
 * Responsibilities:
 * - Define `entitlements`, `download_grants`, and `download_events` tables.
 * - Multi-tenant isolation: Every table is bound to `workspaces(id)` via `workspace_id`.
 * - Entitlement is the durable authority for product access, independent of order status.
 * - Download grants store SHA-256 hashed tokens (`token_hash`) with use caps and expirations.
 */
import { ENTITLEMENT_STATUSES } from '@creatorhub/contracts'
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
import { orders } from './orders.js'
import { assets, products } from './catalogue.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const entitlementStatus = pgEnum('entitlement_status', ENTITLEMENT_STATUSES)

/**
 * Entitlements Table:
 * Durable proof of purchase granting customer access to digital assets.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    customerEmail: text('customer_email').notNull(),

    status: entitlementStatus('status').notNull().default('active'),

    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),

    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_entitlements_order').on(table.workspaceId, table.orderId),
    index('idx_entitlements_email').on(table.workspaceId, table.customerEmail),
    index('idx_entitlements_status').on(table.workspaceId, table.status),
  ],
)

/**
 * Download Grants Table:
 * Time-limited and count-limited access token grants for specific digital assets.
 * Raw token is never stored in DB: only SHA-256 tokenHash.
 */
export const downloadGrants = pgTable(
  'download_grants',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => entitlements.id, { onDelete: 'cascade' }),

    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),

    tokenHash: varchar('token_hash', { length: 64 }).notNull(),

    maxDownloads: integer('max_downloads').notNull().default(5),
    downloadCount: integer('download_count').notNull().default(0),

    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_download_grants_entitlement').on(table.workspaceId, table.entitlementId),
    index('idx_download_grants_asset').on(table.workspaceId, table.assetId),
    uniqueIndex('idx_download_grants_token_hash').on(table.tokenHash),
  ],
)

/**
 * Download Events Table:
 * Audit log of every file download attempt for security & abuse detection.
 */
export const downloadEvents = pgTable(
  'download_events',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    downloadGrantId: uuid('download_grant_id')
      .notNull()
      .references(() => downloadGrants.id, { onDelete: 'cascade' }),

    ipHash: varchar('ip_hash', { length: 64 }),
    userAgent: text('user_agent'),

    downloadedAt: timestamp('downloaded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_download_events_grant').on(table.workspaceId, table.downloadGrantId)],
)
