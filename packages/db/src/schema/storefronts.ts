/**
 * Storefront schema (Implementation Plan §4.1 & §4.7).
 *
 * Responsibilities:
 * Multi-tenant public storefront configuration, custom domain and subdomain bindings,
 * theme settings, publication lifecycle, and privacy-respecting telemetry events.
 *
 * Invariants:
 * 1. Multi-tenancy: Every storefront and event is tied to a non-null `workspace_id`.
 * 2. Uniqueness: Subdomains and custom domains are unique across the entire platform via `citext`.
 * 3. Isolation: Protected by PostgreSQL Row-Level Security with tenant policies.
 */
import {
  CUSTOM_DOMAIN_STATUSES,
  STOREFRONT_EVENT_TYPES,
  STOREFRONT_STATUSES,
  type StorefrontTheme,
} from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  customType,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { products } from './catalogue.js'
import { workspaces } from './identity.js'

export const storefrontStatus = pgEnum('storefront_status', STOREFRONT_STATUSES)
export const customDomainStatus = pgEnum('custom_domain_status', CUSTOM_DOMAIN_STATUSES)
export const storefrontEventType = pgEnum('storefront_event_type', STOREFRONT_EVENT_TYPES)

const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const storefronts = pgTable(
  'storefronts',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    subdomain: citext('subdomain').notNull(),
    customDomain: citext('custom_domain'),
    customDomainStatus: customDomainStatus('custom_domain_status').notNull().default('pending'),
    customDomainVerificationToken: text('custom_domain_verification_token'),
    customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
    title: text('title').notNull(),
    tagline: text('tagline'),
    description: text('description'),
    themeConfig: jsonb('theme_config')
      .$type<StorefrontTheme>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: storefrontStatus('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('storefronts_workspace_id_unique').on(table.workspaceId),
    uniqueIndex('storefronts_subdomain_unique').on(table.subdomain),
    uniqueIndex('storefronts_custom_domain_unique').on(table.customDomain),
    index('storefronts_workspace_id_idx').on(table.workspaceId),
    index('storefronts_status_idx').on(table.status),
  ],
)

export type StorefrontRecord = typeof storefronts.$inferSelect
export type NewStorefrontRecord = typeof storefronts.$inferInsert

export const storefrontEvents = pgTable(
  'storefront_events',
  {
    id: primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefronts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    eventType: storefrontEventType('event_type').notNull(),
    visitorSessionId: text('visitor_session_id'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('storefront_events_workspace_id_idx').on(table.workspaceId),
    index('storefront_events_storefront_id_idx').on(table.storefrontId),
    index('storefront_events_product_id_idx').on(table.productId),
    index('storefront_events_type_created_idx').on(table.eventType, table.createdAt),
    index('storefront_events_workspace_created_idx').on(table.workspaceId, table.createdAt),
  ],
)

export type StorefrontEventRow = typeof storefrontEvents.$inferSelect
export type NewStorefrontEventRow = typeof storefrontEvents.$inferInsert
