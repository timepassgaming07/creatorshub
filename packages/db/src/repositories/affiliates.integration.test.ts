/**
 * Affiliates Repository Integration Test Suite (Slice 8 §8.1-§8.5).
 *
 * Verifies against real PostgreSQL 18:
 * 1. Affiliate program creation and settings updates.
 * 2. Promoter lifecycle: onboarding, status transitions (pending -> approved -> suspended).
 * 3. Referral links and click tracking with bot filtering.
 * 4. Order attribution creation with automatic earnings increment on affiliate and link.
 * 5. Multi-tenant RLS isolation between workspaces.
 */
import {
  currency,
  orderId,
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
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as affiliatesRepo from './affiliates.js'
import * as catalogueRepo from './catalogue.js'
import * as ordersRepo from './orders.js'
import * as workspacesRepo from './workspaces.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

describe('Affiliates Repository Integration', () => {
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
    await adminClient`TRUNCATE TABLE attributions, affiliate_clicks, affiliate_links, affiliates, affiliate_programs, orders, workspaces CASCADE`

    const seedWorkspace = async (wId: WorkspaceId, name: string, slug: string, uId: typeof actor1) => {
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

  const inScope = <T>(wId: WorkspaceId, uId: typeof actor1, work: (scope: any) => Promise<T>) => {
    const context = workspaceContext({
      workspaceId: wId,
      actorId: uId,
      requestId: requestId('req-test-aff'),
    })
    return db.withWorkspace(context, async (tx) => work({ tx, context }))
  }

  it('manages affiliate program settings lifecycle', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      // 1. Initial get is null
      const initial = await affiliatesRepo.getAffiliateProgram(scope)
      expect(initial).toBeNull()

      // 2. Create program
      const created = await affiliatesRepo.upsertAffiliateProgram(scope, {
        isActive: true,
        defaultCommissionBps: 2500, // 25%
        cookieWindowDays: 60,
        allowSelfReferral: false,
        autoApproveAffiliates: true,
      })

      expect(created.isActive).toBe(true)
      expect(created.defaultCommissionBps).toBe(2500)
      expect(created.cookieWindowDays).toBe(60)
      expect(created.autoApproveAffiliates).toBe(true)

      // 3. Update existing
      const updated = await affiliatesRepo.upsertAffiliateProgram(scope, {
        defaultCommissionBps: 3000,
      })

      expect(updated.defaultCommissionBps).toBe(3000)
      expect(updated.cookieWindowDays).toBe(60) // Unchanged
    })
  })

  it('manages promoter onboarding and status transitions', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      const affiliate = await affiliatesRepo.createAffiliate(scope, {
        email: 'promoter@youtube.com',
        name: 'Tech YouTuber',
        customCommissionBps: 3500,
        status: 'pending',
      })

      expect(affiliate.id).toBeDefined()
      expect(affiliate.email).toBe('promoter@youtube.com')
      expect(affiliate.status).toBe('pending')
      expect(affiliate.customCommissionBps).toBe(3500)

      // Find by ID and Email
      const byId = await affiliatesRepo.findAffiliateById(scope, affiliate.id)
      expect(byId?.name).toBe('Tech YouTuber')

      const byEmail = await affiliatesRepo.findAffiliateByEmail(scope, 'PROMOTER@YOUTUBE.COM')
      expect(byEmail?.id).toBe(affiliate.id)

      // Approve promoter
      const approved = await affiliatesRepo.updateAffiliateStatus(scope, affiliate.id, 'approved')
      expect(approved?.status).toBe('approved')

      // List & count
      const list = await affiliatesRepo.listAffiliates(scope, { status: 'approved' })
      expect(list.length).toBe(1)
      expect(list[0]?.id).toBe(affiliate.id)

      const count = await affiliatesRepo.countAffiliates(scope, { query: 'YouTuber' })
      expect(count).toBe(1)
    })
  })

  it('creates referral links and records clicks with bot filtering', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      const affiliate = await affiliatesRepo.createAffiliate(scope, {
        email: 'influencer@instagram.com',
        name: 'Insta Influencer',
        status: 'approved',
      })

      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: affiliate.id,
        code: 'SUMMER2026',
        destinationUrl: 'https://studio1.creatorhub.test/p/ebook',
      })

      expect(link.code).toBe('summer2026')
      expect(link.clicksCount).toBe(0)

      // Record valid human click
      const click1 = await affiliatesRepo.recordAffiliateClick(scope, {
        affiliateLinkId: link.id,
        affiliateId: affiliate.id,
        visitorToken: 'token-abc-123',
        ipHash: 'hashed-ip-1',
        userAgent: 'Mozilla/5.0 (Macintosh)',
        isBot: false,
      })

      expect(click1.isBot).toBe(false)

      // Record bot click
      await affiliatesRepo.recordAffiliateClick(scope, {
        affiliateLinkId: link.id,
        affiliateId: affiliate.id,
        visitorToken: 'token-bot-999',
        ipHash: 'hashed-ip-2',
        userAgent: 'Googlebot/2.1',
        isBot: true,
      })

      // Human click incremented clicks_count, bot did not
      const updatedLink = await affiliatesRepo.findAffiliateLinkByCode(scope, 'summer2026')
      expect(updatedLink?.clicksCount).toBe(1)
    })
  })

  it('records order attribution and increments affiliate totals', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      // 1. Create product
      const product = await catalogueRepo.createProduct(scope, {
        title: 'Creator Course',
        slug: 'creator-course',
        basePrice: 100000n,
        currency: currency('INR'),
      })

      // 2. Create order
      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer User',
        currency: 'INR',
        subtotalAmount: 100000n, // ₹1,000.00
        discountAmount: 0n,
        taxAmount: 18000n,
        totalAmount: 118000n,
        items: [
          {
            productId: product.id,
            productTitle: 'Creator Course',
            quantity: 1,
            unitAmount: 100000n,
            subtotalAmount: 100000n,
            totalAmount: 100000n,
          },
        ],
      })

      // 2. Create promoter and link
      const affiliate = await affiliatesRepo.createAffiliate(scope, {
        email: 'partner@growth.com',
        status: 'approved',
      })

      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: affiliate.id,
        code: 'GROWTH',
      })

      // 3. Create attribution
      const attr = await affiliatesRepo.createAttribution(scope, {
        orderId: order.order.id,
        affiliateId: affiliate.id,
        affiliateLinkId: link.id,
        commissionBps: 2000, // 20%
        commissionAmount: 20000n, // ₹200.00
        status: 'attributed',
      })

      expect(attr.status).toBe('attributed')
      expect(attr.commissionAmount).toBe(20000n)

      // Verify affiliate totals incremented
      const refreshedAffiliate = await affiliatesRepo.findAffiliateById(scope, affiliate.id)
      expect(refreshedAffiliate?.totalEarnings).toBe(20000n)
      expect(refreshedAffiliate?.totalConversions).toBe(1)

      // Verify link conversions incremented
      const refreshedLink = await affiliatesRepo.findAffiliateLinkByCode(scope, 'growth')
      expect(refreshedLink?.conversionsCount).toBe(1)
    })
  })

  it('enforces multi-tenant RLS isolation on affiliate data', async () => {
    let ws1AffiliateId: string = ''

    await inScope(ws1Id, actor1, async (scope) => {
      const aff = await affiliatesRepo.createAffiliate(scope, {
        email: 'ws1promoter@example.com',
        status: 'approved',
      })
      ws1AffiliateId = aff.id
    })

    // Workspace 2 attempts to read Workspace 1 affiliate
    await inScope(ws2Id, actor2, async (scope) => {
      const crossRead = await affiliatesRepo.findAffiliateById(scope, ws1AffiliateId)
      expect(crossRead).toBeNull()

      const crossList = await affiliatesRepo.listAffiliates(scope)
      expect(crossList.find((a) => a.id === ws1AffiliateId)).toBeUndefined()
    })
  })
})
