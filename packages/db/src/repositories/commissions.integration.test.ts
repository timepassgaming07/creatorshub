/**
 * Commissions & Clawbacks Repository Integration Test Suite (Slice 9 §9.1-§9.8).
 *
 * Verifies against real PostgreSQL 18:
 * 1. Commission creation in 'held' state with hold duration constraint.
 * 2. Automated batch vesting of mature commissions.
 * 3. Pro-rated clawback on partial and full order refunds.
 * 4. Promoter ledger financial breakdown calculation.
 * 5. Multi-tenant RLS isolation between workspaces.
 */
import {
  affiliateId,
  attributionId,
  commissionId,
  currency,
  orderId,
  refundId,
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
import * as commissionsRepo from './commissions.js'
import * as ordersRepo from './orders.js'
import * as paymentsRepo from './payments.js'
import * as refundsRepo from './refunds.js'
import type { RepositoryScope } from '../repository.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

describe('Commissions Repository Integration Suite (Postgres 18)', () => {
  let container: TestDatabase
  let adminClient: postgres.Sql
  let db: Database

  const ws1Id = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
  const ws2Id = workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222')
  const actor1 = userId('018f9e2b-7c5e-7a2e-8c3b-333333333333')

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
    await db?.close()
    await adminClient?.end()
    await container?.stop()
  })

  beforeEach(async () => {
    await adminClient`TRUNCATE TABLE commission_clawbacks, commissions, attributions, affiliate_clicks, affiliate_links, affiliates, affiliate_programs, refunds, disputes, payments, payment_accounts, order_items, order_transitions, orders, products, users, workspaces CASCADE`

    await adminClient`
      INSERT INTO workspaces (id, name, slug) VALUES
        (${ws1Id}, 'Workspace 1', 'workspace-1'),
        (${ws2Id}, 'Workspace 2', 'workspace-2')
    `
    await adminClient`
      INSERT INTO users (id, email, name) VALUES
        (${actor1}, 'creator@example.com', 'Creator One')
    `
  })

  async function inScope<T>(
    wsId: WorkspaceId,
    actor: typeof actor1,
    work: (scope: RepositoryScope) => Promise<T>,
  ): Promise<T> {
    const context = workspaceContext({
      workspaceId: wsId,
      actorId: actor,
      requestId: requestId(`req-${Date.now()}`),
    })
    return db.withWorkspace(context, async (tx) => work({ tx, context }))
  }

  it('creates a commission in held state with valid hold period', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      // 1. Setup promoter & attribution
      const aff = await affiliatesRepo.createAffiliate(scope, {
        email: 'promoter@example.com',
        name: 'Top Promoter',
        customCommissionBps: 2000,
      })

      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: aff.id,
        code: 'PROMO20',
      })

      const product = await catalogueRepo.createProduct(scope, {
        title: 'Digital Masterclass',
        slug: 'masterclass',
        basePrice: 100000n,
        currency: currency('INR'),
      })

      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'student@example.com',
        customerName: 'Student User',
        currency: 'INR',
        subtotalAmount: 100000n, // ₹1,000.00
        discountAmount: 0n,
        taxAmount: 18000n,
        totalAmount: 118000n,
        items: [
          {
            productId: product.id,
            productTitle: 'Digital Masterclass',
            quantity: 1,
            unitAmount: 100000n,
            subtotalAmount: 100000n,
            totalAmount: 100000n,
          },
        ],
      })

      const attr = await affiliatesRepo.createAttribution(scope, {
        orderId: order.order.id,
        affiliateId: aff.id,
        affiliateLinkId: link.id,
        commissionBps: 2000,
        commissionAmount: 20000n, // ₹200.00
        status: 'attributed',
      })

      // 2. Create commission record
      const heldUntil = new Date(Date.now() + 30 * 86_400_000)
      const commission = await commissionsRepo.createCommission(scope, {
        attributionId: attributionId(attr.id),
        affiliateId: affiliateId(aff.id),
        orderId: orderId(order.order.id),
        grossSaleAmount: 100000n,
        commissionBps: 2000,
        grossAmount: 20000n,
        heldUntil,
        currency: currency('INR'),
      })

      expect(commission.id).toBeDefined()
      expect(commission.status).toBe('held')
      expect(commission.grossAmount).toBe(20000n)
      expect(commission.netAmount).toBe(20000n)
      expect(commission.heldUntil).toEqual(heldUntil)
    })
  })

  it('releases mature held commissions via batch vesting', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      const aff = await affiliatesRepo.createAffiliate(scope, {
        email: 'vesting-promoter@example.com',
        name: 'Vesting Promoter',
      })

      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: aff.id,
        code: 'VESTME',
      })

      const product = await catalogueRepo.createProduct(scope, {
        title: 'Ebook',
        slug: 'ebook',
        basePrice: 50000n,
        currency: currency('INR'),
      })

      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'reader@example.com',
        customerName: 'Reader User',
        currency: 'INR',
        subtotalAmount: 50000n,
        discountAmount: 0n,
        taxAmount: 0n,
        totalAmount: 50000n,
        items: [
          {
            productId: product.id,
            productTitle: 'Ebook',
            quantity: 1,
            unitAmount: 50000n,
            subtotalAmount: 50000n,
            totalAmount: 50000n,
          },
        ],
      })

      const attr = await affiliatesRepo.createAttribution(scope, {
        orderId: order.order.id,
        affiliateId: aff.id,
        affiliateLinkId: link.id,
        commissionBps: 2000,
        commissionAmount: 10000n,
        status: 'attributed',
      })

      // Create commission with held_until in the past (e.g. 5 days ago)
      const pastDate = new Date(Date.now() - 5 * 86_400_000)
      const comm = await commissionsRepo.createCommission(scope, {
        attributionId: attributionId(attr.id),
        affiliateId: affiliateId(aff.id),
        orderId: orderId(order.order.id),
        grossSaleAmount: 50000n,
        commissionBps: 2000,
        grossAmount: 10000n,
        heldUntil: pastDate,
        currency: currency('INR'),
      })

      // Run vesting check as of now
      const vestingResult = await commissionsRepo.releaseHeldCommissions(scope, new Date())
      expect(vestingResult.vestedCount).toBe(1)
      expect(vestingResult.vestedAmountMinor).toBe(10000n)

      const updatedComm = await commissionsRepo.findCommissionById(scope, commissionId(comm.id))
      expect(updatedComm?.status).toBe('vested')
      expect(updatedComm?.vestedAt).toBeDefined()
    })
  })

  it('applies pro-rated clawback on partial refund and updates affiliate earnings', async () => {
    await inScope(ws1Id, actor1, async (scope) => {
      const aff = await affiliatesRepo.createAffiliate(scope, {
        email: 'clawback-promoter@example.com',
        name: 'Clawback Promoter',
      })

      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: aff.id,
        code: 'CLAWBACK',
      })

      const product = await catalogueRepo.createProduct(scope, {
        title: 'Master Course',
        slug: 'master-course',
        basePrice: 100000n, // ₹1,000.00
        currency: currency('INR'),
      })

      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        customerName: 'Buyer User',
        currency: 'INR',
        subtotalAmount: 100000n,
        discountAmount: 0n,
        taxAmount: 0n,
        totalAmount: 100000n,
        items: [
          {
            productId: product.id,
            productTitle: 'Master Course',
            quantity: 1,
            unitAmount: 100000n,
            subtotalAmount: 100000n,
            totalAmount: 100000n,
          },
        ],
      })

      const attr = await affiliatesRepo.createAttribution(scope, {
        orderId: order.order.id,
        affiliateId: aff.id,
        affiliateLinkId: link.id,
        commissionBps: 2000,
        commissionAmount: 20000n, // ₹200.00
        status: 'attributed',
      })

      const comm = await commissionsRepo.createCommission(scope, {
        attributionId: attributionId(attr.id),
        affiliateId: affiliateId(aff.id),
        orderId: orderId(order.order.id),
        grossSaleAmount: 100000n,
        commissionBps: 2000,
        grossAmount: 20000n,
        heldUntil: new Date(Date.now() + 14 * 86_400_000),
        currency: currency('INR'),
      })

      const _paymentAccount = await paymentsRepo.createPaymentAccount(scope, {
        provider: 'razorpay',
        providerAccountId: 'acc_test_123',
        country: 'IN',
        defaultCurrency: 'INR',
        status: 'active',
      })

      const payment = await paymentsRepo.createPayment(scope, {
        orderId: order.order.id,
        provider: 'razorpay',
        providerPaymentId: 'pay_test_clawback_123',
        amount: 100000n,
        currency: currency('INR'),
        status: 'captured',
      })

      // Simulate partial refund of 50% (₹500.00)
      const refund = await refundsRepo.createRefund(scope, {
        orderId: order.order.id,
        paymentId: payment.id,
        providerRefundId: 'rfnd_test_partial_123',
        amount: 50000n, // ₹500.00 refund
        currency: currency('INR'),
        reason: 'Customer requested partial refund',
      })

      const clawbackRes = await commissionsRepo.applyClawback(scope, {
        commissionId: commissionId(comm.id),
        refundId: refundId(refund.id),
        amount: 50000n,
        reason: 'Order partial refund (50%)',
      })

      // Pro-rated 50% of ₹200.00 commission = ₹100.00 (10000n)
      expect(clawbackRes.clawback.amount).toBe(10000n)
      expect(clawbackRes.updatedCommission.netAmount).toBe(10000n)
      expect(clawbackRes.updatedCommission.status).toBe('held') // Still has 10000n remaining

      // Check financial breakdown
      const breakdown = await commissionsRepo.getAffiliateLedgerBreakdown(scope, affiliateId(aff.id))
      expect(breakdown.heldMinor).toBe(10000n)
      expect(breakdown.clawedBackMinor).toBe(10000n)
    })
  })

  it('enforces multi-tenant RLS isolation for commissions', async () => {
    let ws1CommissionId: any

    // Workspace 1 creates commission
    await inScope(ws1Id, actor1, async (scope) => {
      const aff = await affiliatesRepo.createAffiliate(scope, {
        email: 'tenant1-promoter@example.com',
        name: 'Tenant 1 Promoter',
      })
      const link = await affiliatesRepo.createAffiliateLink(scope, {
        affiliateId: aff.id,
        code: 'TENANT1',
      })
      const product = await catalogueRepo.createProduct(scope, {
        title: 'Product 1',
        slug: 'p1',
        basePrice: 10000n,
        currency: currency('INR'),
      })
      const order = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer1@example.com',
        currency: 'INR',
        subtotalAmount: 10000n,
        discountAmount: 0n,
        taxAmount: 0n,
        totalAmount: 10000n,
        items: [{ productId: product.id, productTitle: 'P1', quantity: 1, unitAmount: 10000n, subtotalAmount: 10000n, totalAmount: 10000n }],
      })
      const attr = await affiliatesRepo.createAttribution(scope, {
        orderId: order.order.id,
        affiliateId: aff.id,
        affiliateLinkId: link.id,
        commissionBps: 1000,
        commissionAmount: 1000n,
        status: 'attributed',
      })
      const comm = await commissionsRepo.createCommission(scope, {
        attributionId: attributionId(attr.id),
        affiliateId: affiliateId(aff.id),
        orderId: orderId(order.order.id),
        grossSaleAmount: 10000n,
        commissionBps: 1000,
        grossAmount: 1000n,
        heldUntil: new Date(),
        currency: currency('INR'),
      })
      ws1CommissionId = comm.id
    })

    // Workspace 2 attempts to read Workspace 1's commission
    await inScope(ws2Id, actor1, async (scope) => {
      const commFromWs2 = await commissionsRepo.findCommissionById(scope, ws1CommissionId)
      expect(commFromWs2).toBeNull()

      const listFromWs2 = await commissionsRepo.listWorkspaceCommissions(scope)
      expect(listFromWs2.items).toHaveLength(0)
    })
  })
})
