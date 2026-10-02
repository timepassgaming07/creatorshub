/**
 * Discounts repository integration tests (Item 3.6).
 *
 * Verifies against PostgreSQL 18:
 * 1. Discount coupon creation, case-insensitive code lookup, and slug uniqueness per workspace.
 * 2. Atomic usage counter increments.
 * 3. Product restrictions binding and query.
 * 4. Strict multi-tenant isolation across discounts and discount_products.
 */
import {
  currency,
  discountId,
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
import * as discountsRepo from './discounts.js'

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

describe('Discounts Repository (Item 3.6)', () => {
  beforeEach(async () => {
    await control`TRUNCATE TABLE discount_products, discounts, product_assets, assets, product_variants, products, workspace_members, users, workspaces CASCADE`

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
      requestId: requestId('req-discounts-test-1'),
    })
    return db.withWorkspace(context, (tx) => work({ tx, context }))
  }

  it('creates, finds by code, increments usage, and enforces tenant isolation', async () => {
    // 1. Create percentage discount in ws1
    const discount1 = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.createDiscount(scope, {
        code: 'LAUNCH30',
        discountType: 'percentage',
        discountValue: 3000n, // 30%
        maxUses: 50,
      }),
    )

    expect(discount1.id).toBeDefined()
    expect(discount1.code).toBe('LAUNCH30')
    expect(discount1.discountType).toBe('percentage')
    expect(discount1.discountValue).toBe(3000n)
    expect(discount1.usesCount).toBe(0)

    // 2. Find by ID
    const foundById = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.findDiscountById(scope, discountId(discount1.id)),
    )
    expect(foundById).not.toBeNull()
    expect(foundById?.code).toBe('LAUNCH30')

    // 3. Find by Code (case-insensitive lookup: 'launch30')
    const foundByCode = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.findDiscountByCode(scope, 'launch30'),
    )
    expect(foundByCode).not.toBeNull()
    expect(foundByCode?.id).toBe(discount1.id)

    // 4. Increment usage
    const incremented = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.incrementDiscountUsage(scope, discountId(discount1.id)),
    )
    expect(incremented.usesCount).toBe(1)

    // 5. Multi-tenant isolation: ws2 cannot find or increment discount from ws1
    const foreignFind = await inScope(ws2Id, u2Id, (scope) =>
      discountsRepo.findDiscountById(scope, discountId(discount1.id)),
    )
    expect(foreignFind).toBeNull()

    const foreignCodeFind = await inScope(ws2Id, u2Id, (scope) =>
      discountsRepo.findDiscountByCode(scope, 'LAUNCH30'),
    )
    expect(foreignCodeFind).toBeNull()

    await expect(
      inScope(ws2Id, u2Id, (scope) =>
        discountsRepo.incrementDiscountUsage(scope, discountId(discount1.id)),
      ),
    ).rejects.toThrow()

    // ...nor switch it off
    await expect(
      inScope(ws2Id, u2Id, (scope) =>
        discountsRepo.setDiscountActive(scope, discountId(discount1.id), false),
      ),
    ).rejects.toThrow()
    const stillActive = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.findDiscountById(scope, discountId(discount1.id)),
    )
    expect(stillActive?.isActive).toBe(true)

    // 6. Creating same code in ws2 is permitted (per-tenant uniqueness)
    const discount2 = await inScope(ws2Id, u2Id, (scope) =>
      discountsRepo.createDiscount(scope, {
        code: 'LAUNCH30',
        discountType: 'fixed_amount',
        discountValue: 50000n,
        currency: INR,
      }),
    )
    expect(discount2.id).not.toBe(discount1.id)
    expect(discount2.discountType).toBe('fixed_amount')
  })

  it('binds and lists restricted product IDs for a discount', async () => {
    const prod1 = await inScope(ws1Id, u1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Course Alpha',
        slug: 'course-alpha',
        currency: INR,
        basePrice: 500000n,
      }),
    )

    const prod2 = await inScope(ws1Id, u1Id, (scope) =>
      catalogueRepo.createProduct(scope, {
        title: 'Course Beta',
        slug: 'course-beta',
        currency: INR,
        basePrice: 700000n,
      }),
    )

    const discount = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.createDiscount(scope, {
        code: 'ALPHAONLY',
        discountType: 'percentage',
        discountValue: 1500n,
        productIds: [productId(prod1.id)],
      }),
    )

    const applicable = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.listApplicableProductIdsForDiscount(scope, discountId(discount.id)),
    )
    expect(applicable).toHaveLength(1)
    expect(applicable[0]).toBe(prod1.id)

    // Add prod2 to binding
    await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.bindProductsToDiscount(scope, discountId(discount.id), [productId(prod2.id)]),
    )

    const updatedApplicable = await inScope(ws1Id, u1Id, (scope) =>
      discountsRepo.listApplicableProductIdsForDiscount(scope, discountId(discount.id)),
    )
    expect(updatedApplicable).toHaveLength(2)
    expect(updatedApplicable).toContain(prod1.id)
    expect(updatedApplicable).toContain(prod2.id)
  })
})
