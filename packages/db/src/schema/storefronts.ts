/**
 * Storefront schema (Implementation Plan §4.1).
 *
 * Responsibilities:
 * Multi-tenant public storefront configuration, custom domain and subdomain bindings,
 * theme settings, and publication lifecycle.
 *
 * Invariants:
 * 1. Multi-tenancy: Every storefront is tied to exactly one `workspace_id`.
 * 2. Uniqueness: Subdomains and custom domains are unique across the entire platform via `citext`.
 * 3. Isolation: Protected by PostgreSQL Row-Level Security with tenant policies.
 */
import {
  CUSTOM_DOMAIN_STATUSES,
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

import { workspaces } from './identity.js'

export const storefrontStatus = pgEnum('storefront_status', STOREFRONT_STATUSES)
export const customDomainStatus = pgEnum('custom_domain_status', CUSTOM_DOMAIN_STATUSES)

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
