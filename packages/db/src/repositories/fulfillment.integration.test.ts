/**
 * Fulfillment repository integration tests (Slice 6).
 *
 * Verifies against PostgreSQL 18:
 * 1. Entitlement creation, retrieval by order ID, retrieval by customer email.
 * 2. Revocation of entitlements by order ID upon refund.
 * 3. Download grant creation and hash-based retrieval.
 * 4. Atomic download grant consumption, use cap enforcement, expiry enforcement, and audit event logging.
 * 5. Multi-tenancy isolation between workspaces.
 */
import { createHash } from 'node:crypto'
import {
  currency,
  orderId,
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
import * as fulfillmentRepo from './fulfillment.js'
import * as ordersRepo from './orders.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string

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

function inScope<T>(wsId: string, fn: (scope: RepositoryScope) => Promise<T>): Promise<T> {
  const context = workspaceContext({
    workspaceId: workspaceId(wsId),
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId('req-ful-1'),
  })
  return db.withWorkspace(context, (tx) => fn({ tx, context }))
}

beforeEach(async () => {
  await control`TRUNCATE TABLE download_events, download_grants, entitlements, product_assets, assets, products, order_items, order_transitions, orders, users, workspaces CASCADE`

  const [ws1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug)
    VALUES ('Creator Academy', 'creator-academy')
    RETURNING id
  `
  const [ws2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug)
    VALUES ('Design Hub', 'design-hub')
    RETURNING id
  `

  ws1Id = ws1!.id
  ws2Id = ws2!.id
})

describe('fulfillment repository', () => {
  it('creates and retrieves entitlements by order ID and customer email', async () => {
    // 1. Seed product & order in WS1
    const prod = await inScope(ws1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Full Stack Guide',
        slug: 'full-stack-guide',
        basePrice: 199900n,
        currency: currency('INR'),
      }),
    )

    const ord = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        subtotalAmount: 199900n,
        totalAmount: 199900n,
        currency: currency('INR'),
        checkoutSessionId: 'sess_123',
        items: [
          {
            productId: prod.id,
            productTitle: 'Full Stack Guide',
            unitAmount: 199900n,
            quantity: 1,
            subtotalAmount: 199900n,
            totalAmount: 199900n,
          },
        ],
      }),
    )

    // 2. Create entitlement
    const entitlement = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createEntitlement(scope, {
        orderId: orderId(ord.order.id),
        productId: productId(prod.id),
        customerEmail: 'buyer@example.com',
        metadata: { source: 'checkout' },
      }),
    )

    expect(entitlement.id).toBeDefined()
    expect(entitlement.status).toBe('active')
    expect(entitlement.customerEmail).toBe('buyer@example.com')

    // 3. Find by order ID
    const byOrder = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.findEntitlementsByOrderId(scope, orderId(ord.order.id)),
    )
    expect(byOrder.length).toBe(1)
    expect(byOrder[0]!.id).toBe(entitlement.id)

    // 4. Find by customer email
    const byEmail = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.findEntitlementsByCustomerEmail(scope, 'buyer@example.com'),
    )
    expect(byEmail.length).toBe(1)
    expect(byEmail[0]!.id).toBe(entitlement.id)

    // 5. Cross-tenant read returns empty
    const crossTenant = await inScope(ws2Id, (scope) =>
      fulfillmentRepo.findEntitlementsByOrderId(scope, orderId(ord.order.id)),
    )
    expect(crossTenant.length).toBe(0)
  })

  it('creates download grants and validates atomic consumption with use caps and expiry', async () => {
    // 1. Seed product, asset, and order
    const prod = await inScope(ws1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'eBook Pro',
        slug: 'ebook-pro',
        basePrice: 99900n,
        currency: currency('INR'),
      }),
    )

    const asset = await inScope(ws1Id, (scope) =>
      catalogueRepo.createAsset(scope, {
        storageKey: 'assets/ws1/ebook.pdf',
        originalFilename: 'ebook.pdf',
        mimeType: 'application/pdf',
        byteSize: 1048576n,
        checksumSha256: 'hash-ebook',
      }),
    )

    const ord = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'ebook.buyer@example.com',
        subtotalAmount: 99900n,
        totalAmount: 99900n,
        currency: currency('INR'),
        checkoutSessionId: 'sess_ebook',
        items: [
          {
            productId: prod.id,
            productTitle: 'eBook Pro',
            unitAmount: 99900n,
            quantity: 1,
            subtotalAmount: 99900n,
            totalAmount: 99900n,
          },
        ],
      }),
    )

    const entitlement = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createEntitlement(scope, {
        orderId: orderId(ord.order.id),
        productId: productId(prod.id),
        customerEmail: 'ebook.buyer@example.com',
      }),
    )

    // 2. Create download grant with SHA-256 token hash and maxDownloads = 2
    const rawToken = 'secret-download-token-123456789'
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 86400000) // +24 hours

    const grant = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createDownloadGrant(scope, {
        entitlementId: entitlement.id,
        assetId: asset.id,
        tokenHash,
        maxDownloads: 2,
        expiresAt,
      }),
    )

    expect(grant.tokenHash).toBe(tokenHash)
    expect(grant.maxDownloads).toBe(2)
    expect(grant.downloadCount).toBe(0)

    // 3. First consumption -> SUCCESS
    const consume1 = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.consumeDownloadGrant(scope, {
        tokenHash,
        ipHash: 'ip-hash-1',
        userAgent: 'Mozilla/5.0 TestBrowser',
      }),
    )

    expect(consume1.ok).toBe(true)
    if (consume1.ok) {
      expect(consume1.grant.downloadCount).toBe(1)
      expect(consume1.asset.originalFilename).toBe('ebook.pdf')
      expect(consume1.entitlement.status).toBe('active')
    }

    // Verify download event was recorded in audit log
    const eventRows = await control<{ id: string; ip_hash: string }[]>`
      SELECT id, ip_hash FROM download_events WHERE download_grant_id = ${grant.id}
    `
    expect(eventRows.length).toBe(1)
    expect(eventRows[0]!.ip_hash).toBe('ip-hash-1')

    // 4. Second consumption -> SUCCESS (reaches max limit)
    const consume2 = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.consumeDownloadGrant(scope, {
        tokenHash,
        ipHash: 'ip-hash-2',
      }),
    )
    expect(consume2.ok).toBe(true)
    if (consume2.ok) {
      expect(consume2.grant.downloadCount).toBe(2)
    }

    // 5. Third consumption -> EXHAUSTED
    const consume3 = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.consumeDownloadGrant(scope, {
        tokenHash,
      }),
    )
    expect(consume3.ok).toBe(false)
    if (!consume3.ok) {
      expect(consume3.code).toBe('EXHAUSTED')
    }
  })

  it('rejects expired download grants', async () => {
    const prod = await inScope(ws1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Expired Product',
        slug: 'expired-product',
        basePrice: 50000n,
        currency: currency('INR'),
      }),
    )

    const asset = await inScope(ws1Id, (scope) =>
      catalogueRepo.createAsset(scope, {
        storageKey: 'assets/ws1/expired.pdf',
        originalFilename: 'expired.pdf',
        mimeType: 'application/pdf',
        byteSize: 50000n,
        checksumSha256: 'hash-expired',
      }),
    )

    const ord = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@expired.com',
        subtotalAmount: 50000n,
        totalAmount: 50000n,
        currency: currency('INR'),
        checkoutSessionId: 'sess_exp',
        items: [
          {
            productId: prod.id,
            productTitle: 'Expired Product',
            unitAmount: 50000n,
            quantity: 1,
            subtotalAmount: 50000n,
            totalAmount: 50000n,
          },
        ],
      }),
    )

    const entitlement = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createEntitlement(scope, {
        orderId: orderId(ord.order.id),
        productId: productId(prod.id),
        customerEmail: 'buyer@expired.com',
      }),
    )

    const tokenHash = createHash('sha256').update('expired-token').digest('hex')
    const pastDate = new Date(Date.now() - 3600000) // 1 hour ago

    await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createDownloadGrant(scope, {
        entitlementId: entitlement.id,
        assetId: asset.id,
        tokenHash,
        expiresAt: pastDate,
      }),
    )

    const result = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.consumeDownloadGrant(scope, {
        tokenHash,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('EXPIRED')
    }
  })

  it('revokes entitlements upon order refund and blocks subsequent file downloads', async () => {
    const prod = await inScope(ws1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Refunded Course',
        slug: 'refunded-course',
        basePrice: 249900n,
        currency: currency('INR'),
      }),
    )

    const asset = await inScope(ws1Id, (scope) =>
      catalogueRepo.createAsset(scope, {
        storageKey: 'assets/ws1/course.zip',
        originalFilename: 'course.zip',
        mimeType: 'application/zip',
        byteSize: 10485760n,
        checksumSha256: 'hash-zip',
      }),
    )

    const ord = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'refund.buyer@example.com',
        subtotalAmount: 249900n,
        totalAmount: 249900n,
        currency: currency('INR'),
        checkoutSessionId: 'sess_refund',
        items: [
          {
            productId: prod.id,
            productTitle: 'Refunded Course',
            unitAmount: 249900n,
            quantity: 1,
            subtotalAmount: 249900n,
            totalAmount: 249900n,
          },
        ],
      }),
    )

    const entitlement = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createEntitlement(scope, {
        orderId: orderId(ord.order.id),
        productId: productId(prod.id),
        customerEmail: 'refund.buyer@example.com',
      }),
    )

    const tokenHash = createHash('sha256').update('refund-token').digest('hex')
    await inScope(ws1Id, (scope) =>
      fulfillmentRepo.createDownloadGrant(scope, {
        entitlementId: entitlement.id,
        assetId: asset.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 86400000),
      }),
    )

    // Revoke entitlement (e.g. triggered by refund)
    const revokedCount = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.revokeEntitlementsByOrderId(
        scope,
        orderId(ord.order.id),
        'customer_requested_refund',
      ),
    )
    expect(revokedCount).toBe(1)

    // Download attempt must fail with REVOKED
    const result = await inScope(ws1Id, (scope) =>
      fulfillmentRepo.consumeDownloadGrant(scope, {
        tokenHash,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('REVOKED')
      expect(result.message).toContain('Access to this file has been revoked')
    }
  })
})
