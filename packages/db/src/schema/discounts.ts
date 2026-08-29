/**
 * Discounts and coupon code tables (Implementation Plan §3.6).
 *
 * Responsibilities:
 * Define `discounts` and `discount_products` tables scoped to workspace tenants.
 *
 * Invariants:
 * 1. Multi-tenant: Every table carries `workspace_id NOT NULL REFERENCES workspaces(id)`.
 * 2. Coupon codes are unique per workspace `(workspace_id, code)`.
 * 3. Discount values are non-negative bigints (basis points for percentage, minor units for fixed).
 */
import { DISCOUNT_TYPES } from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { products } from './catalogue.js'
import { workspaces } from './identity.js'

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const discountType = pgEnum('discount_type', DISCOUNT_TYPES)

export const discounts = pgTable(
  'discounts',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 50 }).notNull(),
    discountType: discountType('discount_type').notNull(),
    discountValue: bigint('discount_value', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }),

    maxUses: integer('max_uses'),
    usesCount: integer('uses_count').notNull().default(0),

    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    minOrderAmount: bigint('min_order_amount', { mode: 'bigint' }),

    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discounts_workspace_code_uq').on(table.workspaceId, table.code),
    index('discounts_workspace_idx').on(table.workspaceId),
  ],
)

export type DiscountRecord = typeof discounts.$inferSelect
export type NewDiscountRecord = typeof discounts.$inferInsert

export const discountProducts = pgTable(
  'discount_products',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    discountId: uuid('discount_id')
      .notNull()
      .references(() => discounts.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('discount_products_uq').on(table.discountId, table.productId),
    index('discount_products_workspace_idx').on(table.workspaceId),
  ],
)

export type DiscountProductRecord = typeof discountProducts.$inferSelect
export type NewDiscountProductRecord = typeof discountProducts.$inferInsert
