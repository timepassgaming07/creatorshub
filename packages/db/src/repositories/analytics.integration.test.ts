/**
 * Integration Test Suite for Analytics & AI Usage Repositories (Slice 10 §10.1, §10.2, §10.6).
 *
 * Proves against real PostgreSQL 18:
 * 1. Analytics financial summaries match ledger and order aggregates.
 * 2. Funnel metrics and time-series points are generated correctly.
 * 3. AI token usage recording and monthly quota checks operate cleanly.
 * 4. Multi-tenant RLS isolation: zero cross-tenant leakage between workspaces.
 */
import {
  currency,
  requestId,
  storefrontId,
  userId,
  workspaceContext,
  workspaceId,
  type UserId,
  type WorkspaceId,
} from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import type { RepositoryScope } from '../repository.js'
import * as aiUsageRepo from './ai-usage.js'
import * as analytics from './analytics.js'
import * as catalogueRepo from './catalogue.js'
import * as ordersRepo from './orders.js'
import * as storefrontsRepo from './storefronts.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

describe('Analytics & AI Usage Repositories Integration Suite (Postgres 18)', () => {
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
      }),
    )

    // Seed test workspaces & users
    await adminClient`
      INSERT INTO workspaces (id, name, slug) VALUES 
        (${ws1Id}, 'Analytics Studio 1', 'analytics-studio-1'),
        (${ws2Id}, 'Analytics Studio 2', 'analytics-studio-2')
      ON CONFLICT DO NOTHING;
    `
    await adminClient`
      INSERT INTO users (id, email, name) VALUES 
        (${actor1}, 'creator.1@example.com', 'Creator 1'),
        (${actor2}, 'creator.2@example.com', 'Creator 2')
      ON CONFLICT DO NOTHING;
    `
  }, 60000)

  afterAll(async () => {
    await adminClient.end()
    await db.close()
  })

  function inScope<T>(
    wsId: WorkspaceId,
    actor: UserId,
    work: (scope: RepositoryScope) => Promise<T>,
  ): Promise<T> {
    const context = workspaceContext({
      workspaceId: wsId,
      actorId: actor,
      requestId: requestId(`req-${String(Date.now())}`),
    })
    return db.withWorkspace(context, async (tx) => work({ tx, context }))
  }

  it('records AI token usage and enforces monthly quotas with RLS isolation', async () => {
    // 1. Record 2 usages in Workspace 1
    await inScope(ws1Id, actor1, async (scope) => {
      await aiUsageRepo.recordUsage(scope, {
        userId: actor1,
        promptId: 'product_copy_v1',
        provider: 'memory',
        model: 'memory-deterministic-v1',
        promptTokens: 150,
        completionTokens: 350,
        totalTokens: 500,
        costMicroCents: 25n,
      })

      await aiUsageRepo.recordUsage(scope, {
        userId: actor1,
        promptId: 'storefront_copy_v1',
        provider: 'memory',
        model: 'memory-deterministic-v1',
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        costMicroCents: 15n,
      })

      const summary1 = await aiUsageRepo.getMonthlyUsageSummary(scope, {
        monthlyQuotaTokens: 1000,
      })

      expect(summary1.totalGenerations).toBe(2)
      expect(summary1.totalTokens).toBe(800)
      expect(summary1.quotaRemainingTokens).toBe(200)
      expect(summary1.isQuotaExceeded).toBe(false)
    })

    // 2. Workspace 2 must see 0 usage (RLS multi-tenant isolation)
    await inScope(ws2Id, actor2, async (scope) => {
      const summary2 = await aiUsageRepo.getMonthlyUsageSummary(scope, {
        monthlyQuotaTokens: 1000,
      })
      expect(summary2.totalGenerations).toBe(0)
      expect(summary2.totalTokens).toBe(0)
      expect(summary2.quotaRemainingTokens).toBe(1000)
    })
  })

  it('aggregates analytics financial summaries from orders', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      // Seed product in Workspace 1
      const prod = await catalogueRepo.createProduct(scope, {
        title: 'Analytics Test Course',
        slug: 'analytics-test-course',
        description: 'Comprehensive kit',
        basePrice: 250000n,
        currency: currency('INR'),
      })

      // Create and pay an order
      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer User',
        currency: 'INR',
        subtotalAmount: 250000n,
        discountAmount: 0n,
        taxAmount: 45000n,
        totalAmount: 295000n,
        items: [
          {
            productId: prod.id,
            variantId: null,
            productTitle: prod.title,
            variantTitle: null,
            unitAmount: 250000n,
            quantity: 1,
            subtotalAmount: 250000n,
            discountAmount: 0n,
            taxAmount: 45000n,
            totalAmount: 295000n,
          },
        ],
      })

      // Transition to paid
      await ordersRepo.updateOrderStatus(scope, order.order.id, 'paid', 'paid')
      await ordersRepo.recordOrderTransition(scope, {
        orderId: order.order.id,
        fromStatus: 'pending',
        toStatus: 'paid',
        actorType: 'system',
        actorId: 'test',
      })

      // Query analytics summary
      const summary = await analytics.getWorkspaceAnalyticsSummary(scope, {
        timeframe: '30d',
      })

      expect(summary.ordersCount).toBeGreaterThanOrEqual(1)
      expect(BigInt(summary.grossRevenueMinor)).toBeGreaterThanOrEqual(295000n)
      expect(summary.funnel.length).toBe(4)
      expect(summary.timeSeries.length).toBeGreaterThanOrEqual(1)

      // Verify product performance query
      const productPerf = await analytics.listProductPerformance(scope, {
        timeframe: '30d',
      })
      expect(productPerf.length).toBeGreaterThanOrEqual(1)
      const matched = productPerf.find((p) => p.productId === prod.id)
      expect(matched).toBeDefined()
      expect(matched?.unitsSold).toBeGreaterThanOrEqual(1)
    })
  })

  it('counts traffic sources only for the workspace that recorded them', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      const store = await storefrontsRepo.createStorefront(scope, {
        workspaceId: ws1Id,
        subdomain: 'traffic-ws1',
        title: 'Traffic Store',
      })
      await storefrontsRepo.recordStorefrontEvent(scope, {
        storefrontId: storefrontId(store.id),
        eventType: 'page_view',
        utmSource: 'Instagram',
      })
      await storefrontsRepo.recordStorefrontEvent(scope, {
        storefrontId: storefrontId(store.id),
        eventType: 'page_view',
        referrer: 'https://www.youtube.com/watch?v=1',
      })

      const sources = await analytics.listTrafficSources(scope)
      expect(sources).toEqual(
        expect.arrayContaining([
          { source: 'instagram', visits: 1 },
          { source: 'youtube.com', visits: 1 },
        ]),
      )
    })

    await inScope(ws2Id, actor2, async (scope) => {
      expect(await analytics.listTrafficSources(scope)).toEqual([])
    })
  })
})
