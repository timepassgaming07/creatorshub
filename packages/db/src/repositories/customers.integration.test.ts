/**
 * Customers Repository Integration Test Suite (Slice 7 §7.1, §7.2).
 *
 * Verifies:
 * 1. Customer upsert lifecycle: initialization, spend accumulation, order count increments.
 * 2. Scoped querying, search term matching, spend filtering, and pagination.
 * 3. Customer lifetime metrics and repeat buyer aggregation.
 * 4. Multi-tenant RLS isolation: Workspace A cannot read or modify Workspace B customers.
 */
import {
  customerId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
  type WorkspaceId,
} from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as customersRepo from './customers.js'
import * as workspacesRepo from './workspaces.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

describe('Customers Repository Integration', () => {
  let container: TestDatabase
  let adminClient: postgres.Sql
  let db: Database

  const ws1Id = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
  const ws2Id = workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222')
  const actor1 = userId('018f9e2b-7c5e-7a2e-8c3b-333333333333')
  const actor2 = userId('018f9e2b-7c5e-7a2e-8c3b-444444444444')

  beforeAll(async () => {
    container = await startTestDatabase()
    await runMigrations({
      migrationUrl: container.migrationUrl,
      migrationsFolder: MIGRATIONS,
    })

    adminClient = postgres(container.superuserUrl, { max: 10, onnotice: () => undefined })
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
    await adminClient.end()
    await container.stop()
  })

  beforeEach(async () => {
    await adminClient`TRUNCATE TABLE customers, orders, workspaces CASCADE`

    const seedWorkspace = async (
      wId: WorkspaceId,
      name: string,
      slug: string,
      uId: typeof actor1,
    ) => {
      const context = workspaceContext({
        workspaceId: wId,
        actorId: uId,
        requestId: requestId('req-seed-ws'),
      })
      await db.withWorkspace(context, async (tx) => {
        await workspacesRepo.createWorkspace({ tx, context }, { name, slug })
      })
    }

    await seedWorkspace(ws1Id, 'Design Guild', 'design-guild', actor1)
    await seedWorkspace(ws2Id, 'Code Academy', 'code-academy', actor2)
  })

  const inScope = <T>(
    wId: WorkspaceId,
    uId: typeof actor1,
    work: (scope: RepositoryScope) => Promise<T>,
  ) => {
    const context = workspaceContext({
      workspaceId: wId,
      actorId: uId,
      requestId: requestId('req-test-customer'),
    })
    return db.withWorkspace(context, async (tx) => work({ tx, context }))
  }

  it('upserts a new customer and increments spend & orders on subsequent purchases', async () => {
    // 1. Initial purchase
    const c1 = await inScope(ws1Id, actor1, (scope) =>
      customersRepo.upsertCustomer(scope, {
        email: 'alex@example.com',
        name: 'Alex Rivera',
        incrementSpend: 150000n, // ₹1,500
        incrementOrders: 1,
        metadata: { source: 'organic_search' },
      }),
    )

    expect(c1.email).toBe('alex@example.com')
    expect(c1.name).toBe('Alex Rivera')
    expect(c1.totalSpend).toBe(150000n)
    expect(c1.ordersCount).toBe(1)
    expect(c1.workspaceId).toBe(ws1Id)

    // 2. Second purchase by the same customer (case insensitive email matching)
    const c2 = await inScope(ws1Id, actor1, (scope) =>
      customersRepo.upsertCustomer(scope, {
        email: 'ALEX@example.com',
        name: 'Alex Rivera',
        phone: '+919876543210',
        incrementSpend: 250000n, // ₹2,500
        incrementOrders: 1,
        metadata: { lastCampaign: 'summer_drop' },
      }),
    )

    expect(c2.id).toBe(c1.id)
    expect(c2.totalSpend).toBe(400000n) // ₹4,000 total
    expect(c2.ordersCount).toBe(2)
    expect(c2.phone).toBe('+919876543210')
    expect(c2.metadata).toMatchObject({
      source: 'organic_search',
      lastCampaign: 'summer_drop',
    })
  })

  it('filters customers by query, minSpend, and computes summary aggregates', async () => {
    // Seed 3 customers
    await inScope(ws1Id, actor1, async (scope) => {
      await customersRepo.upsertCustomer(scope, {
        email: 'buyer1@test.com',
        name: 'Sara Khan',
        incrementSpend: 100000n,
        incrementOrders: 1,
      })
      await customersRepo.upsertCustomer(scope, {
        email: 'buyer2@test.com',
        name: 'Rohan Sharma',
        incrementSpend: 500000n,
        incrementOrders: 3,
      })
      await customersRepo.upsertCustomer(scope, {
        email: 'vip@test.com',
        name: 'Sara VIP',
        incrementSpend: 1000000n,
        incrementOrders: 5,
      })
    })

    // Search by name
    const saraMatches = await inScope(ws1Id, actor1, (scope) =>
      customersRepo.listCustomers(scope, { query: 'Sara' }),
    )
    expect(saraMatches).toHaveLength(2)

    // Filter by min spend (>= ₹5,000)
    const highSpenders = await inScope(ws1Id, actor1, (scope) =>
      customersRepo.listCustomers(scope, { minSpend: 500000n }),
    )
    expect(highSpenders).toHaveLength(2)

    // Summary statistics
    const summary = await inScope(ws1Id, actor1, (scope) => customersRepo.getCustomerSummary(scope))

    expect(summary.totalCustomers).toBe(3)
    expect(summary.totalLifetimeValue).toBe(1600000n) // ₹16,000
    expect(summary.repeatCustomersCount).toBe(2) // 2 repeat buyers
    expect(summary.averageOrderValue).toBe(1600000n / 3n)
  })

  it('strictly enforces multi-tenant isolation across workspaces', async () => {
    // Seed customer in Workspace 1
    const ws1Customer = await inScope(ws1Id, actor1, (scope) =>
      customersRepo.upsertCustomer(scope, {
        email: 'tenant1.buyer@example.com',
        name: 'Workspace 1 Buyer',
        incrementSpend: 200000n,
        incrementOrders: 1,
      }),
    )

    // Workspace 2 attempts to find Workspace 1 customer by ID -> returns null
    const foreignLookup = await inScope(ws2Id, actor2, (scope) =>
      customersRepo.findCustomerById(scope, customerId(ws1Customer.id)),
    )
    expect(foreignLookup).toBeNull()

    // Workspace 2 attempts to find Workspace 1 customer by email -> returns null
    const foreignEmailLookup = await inScope(ws2Id, actor2, (scope) =>
      customersRepo.findCustomerByEmail(scope, 'tenant1.buyer@example.com'),
    )
    expect(foreignEmailLookup).toBeNull()

    // Workspace 2 listing contains 0 rows
    const ws2List = await inScope(ws2Id, actor2, (scope) => customersRepo.listCustomers(scope))
    expect(ws2List).toHaveLength(0)

    // Same email can exist independently in Workspace 2 with completely separate metrics
    const ws2Customer = await inScope(ws2Id, actor2, (scope) =>
      customersRepo.upsertCustomer(scope, {
        email: 'tenant1.buyer@example.com',
        name: 'Workspace 2 Buyer',
        incrementSpend: 50000n,
        incrementOrders: 1,
      }),
    )

    expect(ws2Customer.id).not.toBe(ws1Customer.id)
    expect(ws2Customer.totalSpend).toBe(50000n)
    expect(ws2Customer.workspaceId).toBe(ws2Id)
  })
})
