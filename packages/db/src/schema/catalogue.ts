/**
 * Catalogue schema (Implementation Plan §3.1).
 *
 * Responsibilities:
 * Multi-tenant product catalogue, variants, storage assets, and product-to-asset bindings.
 *
 * Invariants:
 * 1. Multi-tenancy: Every table carries a non-null `workspace_id` referencing `workspaces(id)`.
 * 2. Uniqueness: Slugs are unique per workspace `(workspace_id, slug)`.
 * 3. Assets: Asset records track storage keys, MIME validation, and virus/malware scan status.
 * 4. Money: Prices are stored as non-negative bigints representing exact minor units (zero-float rule).
 */
import {
  ASSET_SCAN_STATUSES,
  PRODUCT_ASSET_ROLES,
  PRODUCT_STATUSES,
  PRODUCT_VISIBILITIES,
  VARIANT_INVENTORY_POLICIES,
} from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { workspaces } from './identity.js'

export const productStatus = pgEnum('product_status', PRODUCT_STATUSES)
export const productVisibility = pgEnum('product_visibility', PRODUCT_VISIBILITIES)
export const variantInventoryPolicy = pgEnum('variant_inventory_policy', VARIANT_INVENTORY_POLICIES)
export const assetScanStatus = pgEnum('asset_scan_status', ASSET_SCAN_STATUSES)
export const productAssetRole = pgEnum('product_asset_role', PRODUCT_ASSET_ROLES)

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

export const products = pgTable(
  'products',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    description: text('description'),

    status: productStatus('status').notNull().default('draft'),
    currency: varchar('currency', { length: 3 }).notNull(),
    basePrice: bigint('base_price', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    compareAtPrice: bigint('compare_at_price', { mode: 'bigint' }),
    visibility: productVisibility('visibility').notNull().default('public'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('products_workspace_slug_uq').on(table.workspaceId, table.slug),
    index('products_workspace_status_idx').on(table.workspaceId, table.status),
  ],
)

export type ProductRecord = typeof products.$inferSelect
export type NewProductRecord = typeof products.$inferInsert

export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    title: varchar('title', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 100 }),
    priceOverride: bigint('price_override', { mode: 'bigint' }),

    position: integer('position').notNull().default(0),
    inventoryPolicy: variantInventoryPolicy('inventory_policy').notNull().default('unlimited'),
    inventoryQuantity: integer('inventory_quantity').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('product_variants_product_position_idx').on(table.productId, table.position),
    index('product_variants_workspace_idx').on(table.workspaceId),
  ],
)

export type ProductVariantRecord = typeof productVariants.$inferSelect
export type NewProductVariantRecord = typeof productVariants.$inferInsert

export const assets = pgTable(
  'assets',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    byteSize: bigint('byte_size', { mode: 'bigint' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),

    scanStatus: assetScanStatus('scan_status').notNull().default('pending'),
    scanReason: text('scan_reason'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('assets_storage_key_uq').on(table.storageKey),
    index('assets_workspace_scan_idx').on(table.workspaceId, table.scanStatus),
  ],
)

export type AssetRecord = typeof assets.$inferSelect
export type NewAssetRecord = typeof assets.$inferInsert

export const productAssets = pgTable(
  'product_assets',
  {
    id: primaryKey(),

    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),

    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),

    role: productAssetRole('role').notNull().default('deliverable'),
    position: integer('position').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('product_assets_product_asset_role_uq').on(
      table.productId,
      table.assetId,
      table.role,
    ),
    index('product_assets_workspace_idx').on(table.workspaceId),
    index('product_assets_asset_idx').on(table.assetId),
  ],
)

export type ProductAssetRecord = typeof productAssets.$inferSelect
export type NewProductAssetRecord = typeof productAssets.$inferInsert
