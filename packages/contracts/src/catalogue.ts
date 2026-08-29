/**
 * Catalogue contracts and shared types (Implementation Plan §3.1).
 *
 * Responsibilities:
 * Define schemas, types, and validation for products, variants, assets, and product-asset associations.
 *
 * Dependencies: zod, ./identifiers.js, ./money.js.
 */
import { z } from 'zod'

import {
  type AssetId,
  type ProductId,
  type VariantId,
  type WorkspaceId,
  assetIdSchema,
  productIdSchema,
  variantIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import { type CurrencyCode, currency } from './money.js'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]
export const productStatusSchema = z.enum(PRODUCT_STATUSES)

export const PRODUCT_VISIBILITIES = ['public', 'unlisted', 'private'] as const
export type ProductVisibility = (typeof PRODUCT_VISIBILITIES)[number]
export const productVisibilitySchema = z.enum(PRODUCT_VISIBILITIES)

export const VARIANT_INVENTORY_POLICIES = ['unlimited', 'tracked'] as const
export type VariantInventoryPolicy = (typeof VARIANT_INVENTORY_POLICIES)[number]
export const variantInventoryPolicySchema = z.enum(VARIANT_INVENTORY_POLICIES)

export const ASSET_SCAN_STATUSES = ['pending', 'clean', 'infected', 'skipped'] as const
export type AssetScanStatus = (typeof ASSET_SCAN_STATUSES)[number]
export const assetScanStatusSchema = z.enum(ASSET_SCAN_STATUSES)

export const PRODUCT_ASSET_ROLES = [
  'cover_image',
  'thumbnail',
  'gallery',
  'deliverable',
  'preview',
] as const
export type ProductAssetRole = (typeof PRODUCT_ASSET_ROLES)[number]
export const productAssetRoleSchema = z.enum(PRODUCT_ASSET_ROLES)

// ---------------------------------------------------------------------------
// Validation Constants
// ---------------------------------------------------------------------------

export const PRODUCT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const productSlugSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(PRODUCT_SLUG_PATTERN, 'Slug must be lower-case alphanumeric with hyphens.')

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Currency must be an uppercase 3-letter ISO 4217 code.')
  .transform((v) => currency(v))

export const moneyAmountSchema = z.bigint().min(0n)

// ---------------------------------------------------------------------------
// Mutation Schemas
// ---------------------------------------------------------------------------

export const createProductInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  title: z.string().min(1).max(255),
  slug: productSlugSchema,
  description: z.string().max(10_000).nullable().optional(),
  status: productStatusSchema.default('draft'),
  currency: currencySchema,
  basePrice: moneyAmountSchema.default(0n),
  compareAtPrice: moneyAmountSchema.nullable().optional(),
  visibility: productVisibilitySchema.default('public'),
})

export type CreateProductInput = {
  readonly workspaceId?: WorkspaceId | undefined
  readonly title: string
  readonly slug: string
  readonly description?: string | null | undefined
  readonly status?: ProductStatus | undefined
  readonly currency: CurrencyCode
  readonly basePrice?: bigint | undefined
  readonly compareAtPrice?: bigint | null | undefined
  readonly visibility?: ProductVisibility | undefined
}

export const updateProductInputSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  slug: productSlugSchema.optional(),
  description: z.string().max(10_000).nullable().optional(),
  status: productStatusSchema.optional(),
  currency: currencySchema.optional(),
  basePrice: moneyAmountSchema.optional(),
  compareAtPrice: moneyAmountSchema.nullable().optional(),
  visibility: productVisibilitySchema.optional(),
})

export type UpdateProductInput = {
  readonly title?: string | undefined
  readonly slug?: string | undefined
  readonly description?: string | null | undefined
  readonly status?: ProductStatus | undefined
  readonly currency?: CurrencyCode | undefined
  readonly basePrice?: bigint | undefined
  readonly compareAtPrice?: bigint | null | undefined
  readonly visibility?: ProductVisibility | undefined
}

export const createVariantInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  productId: productIdSchema,
  title: z.string().min(1).max(255),
  sku: z.string().min(1).max(100).nullable().optional(),
  priceOverride: moneyAmountSchema.nullable().optional(),
  position: z.number().int().min(0).default(0),
  inventoryPolicy: variantInventoryPolicySchema.default('unlimited'),
  inventoryQuantity: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export type CreateVariantInput = {
  readonly workspaceId?: WorkspaceId | undefined
  readonly productId: ProductId
  readonly title: string
  readonly sku?: string | null | undefined
  readonly priceOverride?: bigint | null | undefined
  readonly position?: number | undefined
  readonly inventoryPolicy?: VariantInventoryPolicy | undefined
  readonly inventoryQuantity?: number | undefined
  readonly isActive?: boolean | undefined
}

export const createAssetInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  storageKey: z.string().min(1).max(1024),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteSize: z.bigint().min(0n),
  checksumSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'Expected 64-char hex SHA-256')
    .nullable()
    .optional(),
  scanStatus: assetScanStatusSchema.default('pending'),
  scanReason: z.string().max(1000).nullable().optional(),
})

export type CreateAssetInput = {
  readonly workspaceId?: WorkspaceId | undefined
  readonly storageKey: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly byteSize: bigint
  readonly checksumSha256?: string | null | undefined
  readonly scanStatus?: AssetScanStatus | undefined
  readonly scanReason?: string | null | undefined
}

export const attachProductAssetInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  productId: productIdSchema,
  variantId: variantIdSchema.nullable().optional(),
  assetId: assetIdSchema,
  role: productAssetRoleSchema.default('deliverable'),
  position: z.number().int().min(0).default(0),
})

export type AttachProductAssetInput = {
  readonly workspaceId?: WorkspaceId | undefined
  readonly productId: ProductId
  readonly variantId?: VariantId | null | undefined
  readonly assetId: AssetId
  readonly role?: ProductAssetRole | undefined
  readonly position?: number | undefined
}
