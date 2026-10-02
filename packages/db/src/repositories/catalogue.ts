/**
 * Catalogue repository — tenant-scoped product catalogue, variants, and assets (Implementation Plan §3.1).
 *
 * Responsibilities:
 * 1. Product creation, slug lookup, listing, updating, and publishing.
 * 2. Variant management with price overrides and inventory tracking.
 * 3. Media and deliverable asset tracking with scan statuses.
 * 4. Product-asset attachments and gallery ordering.
 *
 * Invariants:
 * Multi-tenancy: Every query is filtered by workspaceId via RepositoryScope and Postgres RLS.
 * Slugs: Unique per workspace.
 * Prices: Stored strictly in minor units (bigint).
 */
import type {
  AssetId,
  AssetScanStatus,
  AttachProductAssetInput,
  CreateAssetInput,
  CreateProductInput,
  CreateVariantInput,
  ProductId,
  ProductStatus,
  UpdateProductInput,
} from '@creatorhub/contracts'
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type AssetRecord,
  type NewAssetRecord,
  type NewProductAssetRecord,
  type NewProductRecord,
  type NewProductVariantRecord,
  type ProductAssetRecord,
  type ProductRecord,
  type ProductVariantRecord,
  assets,
  productAssets,
  productVariants,
  products,
} from '../schema/index.js'

export type { AssetRecord, ProductRecord, ProductVariantRecord, ProductAssetRecord }

/**
 * Creates a new product in the current workspace.
 */
export async function createProduct(
  scope: RepositoryScope,
  input: CreateProductInput,
): Promise<ProductRecord> {
  const [created] = await scope.tx
    .insert(products)
    .values(
      insertValues<NewProductRecord>(scope, {
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        status: input.status ?? 'draft',
        currency: input.currency,
        basePrice: input.basePrice ?? 0n,
        compareAtPrice: input.compareAtPrice ?? null,
        visibility: input.visibility ?? 'public',
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create product '${input.title}'`)
  }

  return created
}

/**
 * Finds a product by its ID within the current workspace.
 */
export async function findProductById(
  scope: RepositoryScope,
  id: ProductId,
): Promise<ProductRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(products)
    .where(scoped(scope, products, eq(products.id, id)))

  return row ?? null
}

/**
 * Finds a product by its slug within the current workspace.
 */
export async function findProductBySlug(
  scope: RepositoryScope,
  slug: string,
): Promise<ProductRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(products)
    .where(scoped(scope, products, eq(products.slug, slug)))

  return row ?? null
}

/**
 * Lists products in the current workspace with optional status filtering.
 */
export async function listProducts(
  scope: RepositoryScope,
  options?: {
    readonly status?: ProductStatus
    readonly limit?: number
    readonly offset?: number
  },
): Promise<ProductRecord[]> {
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0

  const query = scope.tx
    .select()
    .from(products)
    .where(
      scoped(scope, products, options?.status ? eq(products.status, options.status) : undefined),
    )
    .orderBy(desc(products.createdAt))
    .limit(limit)
    .offset(offset)

  return query
}

/**
 * Updates a product within the current workspace.
 */
export async function updateProduct(
  scope: RepositoryScope,
  id: ProductId,
  input: UpdateProductInput,
): Promise<ProductRecord> {
  const [updated] = await scope.tx
    .update(products)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.compareAtPrice !== undefined && { compareAtPrice: input.compareAtPrice }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      updatedAt: new Date(),
    })
    .where(scoped(scope, products, eq(products.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Product ${id} not found or not accessible to tenant.`)
  }

  return updated
}

/**
 * Creates a variant for a product in the current workspace.
 */
export async function createVariant(
  scope: RepositoryScope,
  input: CreateVariantInput,
): Promise<ProductVariantRecord> {
  const product = await findProductById(scope, input.productId)
  if (!product) {
    throw new Error(`Product ${input.productId} not found or not accessible to tenant.`)
  }

  const [created] = await scope.tx
    .insert(productVariants)
    .values(
      insertValues<NewProductVariantRecord>(scope, {
        productId: input.productId,
        title: input.title,
        sku: input.sku ?? null,
        priceOverride: input.priceOverride ?? null,
        position: input.position ?? 0,
        inventoryPolicy: input.inventoryPolicy ?? 'unlimited',
        inventoryQuantity: input.inventoryQuantity ?? 0,
        isActive: input.isActive ?? true,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create variant '${input.title}'`)
  }

  return created
}

/**
 * Lists all variants for a product ordered by position.
 */
export async function listVariantsForProduct(
  scope: RepositoryScope,
  prodId: ProductId,
): Promise<ProductVariantRecord[]> {
  return scope.tx
    .select()
    .from(productVariants)
    .where(scoped(scope, productVariants, eq(productVariants.productId, prodId)))
    .orderBy(asc(productVariants.position))
}

/**
 * Registers an uploaded storage asset in the current workspace.
 */
export async function createAsset(
  scope: RepositoryScope,
  input: CreateAssetInput,
): Promise<AssetRecord> {
  const [created] = await scope.tx
    .insert(assets)
    .values(
      insertValues<NewAssetRecord>(scope, {
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256 ?? null,
        scanStatus: input.scanStatus ?? 'pending',
        scanReason: input.scanReason ?? null,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create asset '${input.originalFilename}'`)
  }

  return created
}

/**
 * Finds an asset by ID within the current workspace.
 */
export async function findAssetById(
  scope: RepositoryScope,
  id: AssetId,
): Promise<AssetRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(assets)
    .where(scoped(scope, assets, eq(assets.id, id)))

  return row ?? null
}

/**
 * Updates an asset's scan status and optional reason (e.g. from malware scanning).
 */
export async function updateAssetScanStatus(
  scope: RepositoryScope,
  id: AssetId,
  update: {
    readonly scanStatus: AssetScanStatus
    readonly scanReason?: string | null | undefined
  },
): Promise<AssetRecord> {
  const [row] = await scope.tx
    .update(assets)
    .set({
      scanStatus: update.scanStatus,
      scanReason: update.scanReason ?? null,
      scannedAt: new Date(),
    })
    .where(scoped(scope, assets, eq(assets.id, id)))
    .returning()

  if (!row) {
    throw new Error(`Asset ${id} not found or not accessible to tenant.`)
  }

  return row
}

/**
 * Associates an asset with a product (and optionally a specific variant).
 */
export async function attachProductAsset(
  scope: RepositoryScope,
  input: AttachProductAssetInput,
): Promise<ProductAssetRecord> {
  const product = await findProductById(scope, input.productId)
  if (!product) {
    throw new Error(`Product ${input.productId} not found or not accessible to tenant.`)
  }

  const asset = await findAssetById(scope, input.assetId)
  if (!asset) {
    throw new Error(`Asset ${input.assetId} not found or not accessible to tenant.`)
  }

  const [created] = await scope.tx
    .insert(productAssets)
    .values(
      insertValues<NewProductAssetRecord>(scope, {
        productId: input.productId,
        variantId: input.variantId ?? null,
        assetId: input.assetId,
        role: input.role ?? 'deliverable',
        position: input.position ?? 0,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to attach asset ${input.assetId} to product ${input.productId}`)
  }

  return created
}

/**
 * Lists all asset associations for a product including asset metadata.
 */
export async function listAssetsForProduct(
  scope: RepositoryScope,
  prodId: ProductId,
): Promise<{ readonly productAsset: ProductAssetRecord; readonly asset: AssetRecord }[]> {
  const rows = await scope.tx
    .select({
      productAsset: productAssets,
      asset: assets,
    })
    .from(productAssets)
    .innerJoin(assets, eq(productAssets.assetId, assets.id))
    .where(scoped(scope, productAssets, eq(productAssets.productId, prodId)))
    .orderBy(asc(productAssets.position))

  return rows
}

/**
 * Lists all media and deliverable assets for the current workspace.
 */
export async function listAssets(scope: RepositoryScope): Promise<AssetRecord[]> {
  return scope.tx.select().from(assets).where(scoped(scope, assets)).orderBy(desc(assets.createdAt))
}

/**
 * Detaches an asset from a product within the current workspace.
 */
export async function detachProductAsset(
  scope: RepositoryScope,
  prodId: ProductId,
  astId: AssetId,
): Promise<boolean> {
  const deleted = await scope.tx
    .delete(productAssets)
    .where(
      scoped(
        scope,
        productAssets,
        and(eq(productAssets.productId, prodId), eq(productAssets.assetId, astId)),
      ),
    )
    .returning()

  return deleted.length > 0
}

/** Roles whose files are shop-window images, shown to anyone on a published product. */
const PUBLIC_IMAGE_ROLES = ['cover_image', 'thumbnail', 'gallery'] as const

/**
 * True when the asset is a cover, thumbnail, or gallery image of a published,
 * non-private product. The media route serves only assets that pass this, so a
 * buyer's purchased file can never be fetched through an image URL.
 */
export async function isPublicProductImage(scope: RepositoryScope, astId: AssetId): Promise<boolean> {
  const rows = await scope.tx
    .select({ id: productAssets.id })
    .from(productAssets)
    .innerJoin(products, eq(productAssets.productId, products.id))
    .where(
      scoped(
        scope,
        productAssets,
        and(
          eq(productAssets.assetId, astId),
          inArray(productAssets.role, [...PUBLIC_IMAGE_ROLES]),
          eq(products.status, 'published'),
          ne(products.visibility, 'private'),
        ),
      ),
    )
    .limit(1)

  return rows.length > 0
}
