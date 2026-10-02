/**
 * Catalogue repository integration tests (Item 3.1).
 *
 * Verifies against PostgreSQL 18:
 * 1. Product creation, slug lookup, and slug uniqueness per workspace.
 * 2. Variant creation, ordering, and price overrides.
 * 3. Asset storage registration, metadata, and scan status.
 * 4. Product-asset attachment and gallery listing.
 * 5. Strict multi-tenant isolation across all catalogue entities.
 */
import {
  assetId,
  currency,
  productId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as catalogueRepo from './catalogue.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname
const INR = currency('INR')

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string
let u1Id: string
let u2Id: string

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({
    migrationUrl: container.migrationUrl,
    migrationsFolder: MIGRATIONS,
  })

  control = postgres(container.superuserUrl, { max: 10, onnotice: () => undefined })
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '10',
    }),
  )
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

describe('Catalogue Repository (Item 3.1)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE product_assets, assets, product_variants, products, workspace_members, users, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
    `
    ws1Id = ws1?.id ?? ''

    const [ws2] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
    `
    ws2Id = ws2?.id ?? ''

    const [u1] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('creator1@example.com') RETURNING id
    `
    u1Id = u1?.id ?? ''

    const [u2] = await control<{ id: string }[]>`
      INSERT INTO users (email) VALUES ('creator2@example.com') RETURNING id
    `
    u2Id = u2?.id ?? ''

    await control`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${ws1Id}, ${u1Id}, 'owner'), (${ws2Id}, ${u2Id}, 'owner')
    `
  })

  async function inScope<T>(
    wId: string,
    uId: string,
    work: (scope: RepositoryScope) => Promise<T>,
  ): Promise<T> {
    const context = workspaceContext({
      workspaceId: workspaceId(wId),
      actorId: userId(uId),
      requestId: requestId('req-test-catalogue'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('creates products and enforces slug uniqueness per workspace', async () => {
    // 1. Create product in Workspace 1
    const product1 = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Mastering TypeScript',
        slug: 'mastering-typescript',
        description: 'Comprehensive guide to advanced TS patterns',
        status: 'draft',
        currency: INR,
        basePrice: 499900n, // 4,999.00 INR
        visibility: 'public',
      }),
    )

    expect(product1.id).toBeDefined()
    expect(product1.title).toBe('Mastering TypeScript')
    expect(product1.basePrice).toBe(499900n)
    expect(product1.status).toBe('draft')

    // 2. Lookup by ID and by slug
    const byId = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.findProductById(scope, productId(product1.id)),
    )
    expect(byId?.id).toBe(product1.id)

    const bySlug = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.findProductBySlug(scope, 'mastering-typescript'),
    )
    expect(bySlug?.id).toBe(product1.id)

    // 3. Attempt duplicate slug in same workspace must fail
    await expect(
      inScope(ws1Id, u1Id, async (scope) =>
        catalogueRepo.createProduct(scope, {
          title: 'Another Course',
          slug: 'mastering-typescript',
          currency: INR,
          basePrice: 199900n,
        }),
      ),
    ).rejects.toThrow()

    // 4. Same slug in a DIFFERENT workspace succeeds
    const productWs2 = await inScope(ws2Id, u2Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Another Creator Course',
        slug: 'mastering-typescript',
        currency: INR,
        basePrice: 299900n,
      }),
    )
    expect(productWs2.id).toBeDefined()
    expect(productWs2.workspaceId).toBe(ws2Id)
  })

  it('lists, filters, and updates products', async () => {
    // 1. Create draft and published products
    const draftProd = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Draft Product',
        slug: 'draft-product',
        status: 'draft',
        currency: INR,
        basePrice: 100000n,
      }),
    )

    await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Published Product',
        slug: 'published-product',
        status: 'published',
        currency: INR,
        basePrice: 200000n,
      }),
    )

    // 2. List with filter
    const all = await inScope(ws1Id, u1Id, async (scope) => catalogueRepo.listProducts(scope))
    expect(all).toHaveLength(2)

    const publishedOnly = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.listProducts(scope, { status: 'published' }),
    )
    expect(publishedOnly).toHaveLength(1)
    expect(publishedOnly[0]?.title).toBe('Published Product')

    // 3. Update product
    const updated = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.updateProduct(scope, productId(draftProd.id), {
        status: 'published',
        basePrice: 150000n,
      }),
    )
    expect(updated.status).toBe('published')
    expect(updated.basePrice).toBe(150000n)
  })

  it('manages variants with price overrides and inventory policies', async () => {
    const prod = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Design System Kit',
        slug: 'design-system-kit',
        status: 'published',
        currency: INR,
        basePrice: 300000n,
      }),
    )

    // Create 2 variants: Standard and Enterprise License
    const v1 = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createVariant(scope, {
        productId: productId(prod.id),
        title: 'Standard License',
        sku: 'DSK-STD',
        priceOverride: null, // Inherits basePrice
        position: 0,
        inventoryPolicy: 'unlimited',
      }),
    )

    const v2 = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createVariant(scope, {
        productId: productId(prod.id),
        title: 'Enterprise License',
        sku: 'DSK-ENT',
        priceOverride: 1500000n, // 15,000.00 INR
        position: 1,
        inventoryPolicy: 'tracked',
        inventoryQuantity: 50,
      }),
    )

    expect(v1.id).toBeDefined()
    expect(v2.id).toBeDefined()

    const variants = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.listVariantsForProduct(scope, productId(prod.id)),
    )
    expect(variants).toHaveLength(2)
    expect(variants[0]?.title).toBe('Standard License')
    expect(variants[1]?.title).toBe('Enterprise License')
    expect(variants[1]?.priceOverride).toBe(1500000n)
  })

  it('registers assets, attaches to products, and enforces tenant isolation', async () => {
    const prod = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Video Course Bundle',
        slug: 'video-bundle',
        status: 'published',
        currency: INR,
        basePrice: 500000n,
      }),
    )

    // 1. Create asset
    const asset = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.createAsset(scope, {
        storageKey: 'workspaces/ws-one/assets/course.zip',
        originalFilename: 'course-archive-v1.zip',
        mimeType: 'application/zip',
        byteSize: 524288000n, // 500MB
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        scanStatus: 'clean',
      }),
    )
    expect(asset.id).toBeDefined()
    expect(asset.scanStatus).toBe('clean')

    // 2. Attach to product
    const binding = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.attachProductAsset(scope, {
        productId: productId(prod.id),
        assetId: assetId(asset.id),
        role: 'deliverable',
        position: 0,
      }),
    )
    expect(binding.id).toBeDefined()
    expect(binding.role).toBe('deliverable')

    // 3. List assets for product
    const attachments = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.listAssetsForProduct(scope, productId(prod.id)),
    )
    expect(attachments).toHaveLength(1)
    expect(attachments[0]?.asset.originalFilename).toBe('course-archive-v1.zip')
    expect(attachments[0]?.productAsset.role).toBe('deliverable')

    // A cover image on a published product is public, but only in its own workspace
    const cover = await inScope(ws1Id, u1Id, async (scope) => {
      const image = await catalogueRepo.createAsset(scope, {
        storageKey: 'workspaces/ws-one/assets/cover.png',
        originalFilename: 'cover.png',
        mimeType: 'image/png',
        byteSize: 2048n,
        checksumSha256: 'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        scanStatus: 'clean',
      })
      await catalogueRepo.attachProductAsset(scope, {
        productId: productId(prod.id),
        assetId: assetId(image.id),
        role: 'cover_image',
        position: 0,
      })
      return image
    })
    expect(
      await inScope(ws1Id, u1Id, (scope) =>
        catalogueRepo.isPublicProductImage(scope, assetId(cover.id)),
      ),
    ).toBe(true)
    expect(
      await inScope(ws2Id, u2Id, (scope) =>
        catalogueRepo.isPublicProductImage(scope, assetId(cover.id)),
      ),
    ).toBe(false)

    // 4. Tenant isolation check: Workspace 2 cannot see Workspace 1's product, asset, or attachments
    const foreignProd = await inScope(ws2Id, u2Id, async (scope) =>
      catalogueRepo.findProductById(scope, productId(prod.id)),
    )
    expect(foreignProd).toBeNull()

    const foreignAsset = await inScope(ws2Id, u2Id, async (scope) =>
      catalogueRepo.findAssetById(scope, assetId(asset.id)),
    )
    expect(foreignAsset).toBeNull()

    const foreignAttachments = await inScope(ws2Id, u2Id, async (scope) =>
      catalogueRepo.listAssetsForProduct(scope, productId(prod.id)),
    )
    expect(foreignAttachments).toHaveLength(0)

    // 5. Update scan status from pending to clean or infected
    const updatedAsset = await inScope(ws1Id, u1Id, async (scope) =>
      catalogueRepo.updateAssetScanStatus(scope, assetId(asset.id), {
        scanStatus: 'infected',
        scanReason: 'EICAR test signature detected in payload',
      }),
    )
    expect(updatedAsset.scanStatus).toBe('infected')
    expect(updatedAsset.scanReason).toBe('EICAR test signature detected in payload')

    // Cross-tenant update must fail
    await expect(
      inScope(ws2Id, u2Id, async (scope) =>
        catalogueRepo.updateAssetScanStatus(scope, assetId(asset.id), {
          scanStatus: 'clean',
        }),
      ),
    ).rejects.toThrow()
  })
})
