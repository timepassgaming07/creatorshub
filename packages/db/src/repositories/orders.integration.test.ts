/**
 * Orders repository integration tests (Slice 5 §5.2).
 *
 * Verifies against PostgreSQL 18:
 * 1. Order and order items creation in a single transaction.
 * 2. Retrieval by order ID and checkout session ID.
 * 3. Atomic status transitions and transition history.
 * 4. Multi-tenancy isolation: Workspace 1 cannot access Workspace 2's orders.
 * 5. Exact minor units preservation (zero-float rule).
 */
import {
  basisPoints,
  currency,
  ledgerAccountId,
  money,
  percentage,
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
import * as ledgerRepo from './ledger.js'
import * as ordersRepo from './orders.js'
import * as outboxRepo from './outbox.js'
import * as paymentsRepo from './payments.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string
let prod1Id: string

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
    requestId: requestId('req-1'),
  })
  return db.withWorkspace(context, (tx) => fn({ tx, context }))
}

beforeEach(async () => {
  await control`TRUNCATE TABLE orders, order_items, order_transitions, products, users, workspaces CASCADE`

  const [ws1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
  `
  ws1Id = ws1?.id ?? ''

  const [ws2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
  `
  ws2Id = ws2?.id ?? ''

  const p1 = await inScope(ws1Id, (s) =>
    catalogueRepo.createProduct(s, {
      title: 'Digital E-Book',
      slug: 'digital-ebook',
      basePrice: 299900n,
      currency: currency('INR'),
      description: 'Test eBook',
    }),
  )
  prod1Id = p1.id
})

describe('Orders Repository', () => {
  it('creates an order with items and retrieves it with exact integer amounts', async () => {
    const result = await inScope(ws1Id, async (scope) => {
      return ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        customerName: 'Jane Buyer',
        customerPhone: '+919876543210',
        currency: 'INR',
        subtotalAmount: 299900n,
        discountAmount: 0n,
        taxAmount: 53982n,
        totalAmount: 353882n,
        checkoutSessionId: 'cs_test_session_123',
        items: [
          {
            productId: prod1Id,
            productTitle: 'Digital E-Book',
            unitAmount: 299900n,
            quantity: 1,
            subtotalAmount: 299900n,
            taxAmount: 53982n,
            totalAmount: 353882n,
          },
        ],
      })
    })

    expect(result.order.id).toBeDefined()
    expect(result.order.customerEmail).toBe('buyer@example.com')
    expect(result.order.totalAmount).toBe(353882n)
    expect(result.order.status).toBe('pending')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.productTitle).toBe('Digital E-Book')
    expect(result.items[0]?.totalAmount).toBe(353882n)

    // Retrieve order by ID
    const fetched = await inScope(ws1Id, (scope) =>
      ordersRepo.findOrderWithItems(scope, result.order.id),
    )
    expect(fetched).not.toBeNull()
    expect(fetched?.order.id).toBe(result.order.id)
    expect(fetched?.items).toHaveLength(1)

    // Retrieve order by checkoutSessionId
    const bySession = await inScope(ws1Id, (scope) =>
      ordersRepo.findOrderByCheckoutSessionId(scope, 'cs_test_session_123'),
    )
    expect(bySession?.id).toBe(result.order.id)
  })

  it('updates order status and records state transitions', async () => {
    const created = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'buyer2@example.com',
        currency: 'INR',
        subtotalAmount: 100000n,
        totalAmount: 100000n,
        items: [],
      }),
    )

    // Update status to processing and paid
    const updated = await inScope(ws1Id, async (scope) => {
      await ordersRepo.recordOrderTransition(scope, {
        orderId: created.order.id,
        fromStatus: 'pending',
        toStatus: 'paid',
        actorType: 'webhook',
        reason: 'Payment captured successfully',
      })
      return ordersRepo.updateOrderStatus(scope, created.order.id, 'paid', 'paid')
    })

    expect(updated.status).toBe('paid')
    expect(updated.paymentStatus).toBe('paid')

    // List transitions
    const transitions = await inScope(ws1Id, (scope) =>
      ordersRepo.listOrderTransitions(scope, created.order.id),
    )
    expect(transitions).toHaveLength(1)
    expect(transitions[0]?.fromStatus).toBe('pending')
    expect(transitions[0]?.toStatus).toBe('paid')
    expect(transitions[0]?.actorType).toBe('webhook')
  })

  it('enforces tenant isolation between workspaces', async () => {
    const ws1Order = await inScope(ws1Id, (scope) =>
      ordersRepo.createOrder(scope, {
        customerEmail: 'buyer_ws1@example.com',
        currency: 'INR',
        subtotalAmount: 50000n,
        totalAmount: 50000n,
        items: [],
      }),
    )

    // Workspace 2 attempting to read Workspace 1 order should return null
    const ws2Read = await inScope(ws2Id, (scope) =>
      ordersRepo.findOrderById(scope, ws1Order.order.id),
    )
    expect(ws2Read).toBeNull()

    // Workspace 2 attempting to update Workspace 1 order should throw
    await expect(
      inScope(ws2Id, (scope) =>
        ordersRepo.updateOrderStatus(scope, ws1Order.order.id, 'cancelled'),
      ),
    ).rejects.toThrow()

    // Nor point Workspace 1's order at a checkout session of its own
    await expect(
      inScope(ws2Id, (scope) =>
        ordersRepo.setCheckoutSession(scope, ws1Order.order.id, 'order_hijack'),
      ),
    ).rejects.toThrow()
  })

  it('atomically fulfills order, updates payment, records transition, writes balanced ledger postings, and enqueues outbox event in one commit (§5.9)', async () => {
    const INR = currency('INR')

    // 1. Create order in requires_payment status with ₹1,000 gross (₹847.46 base + ₹152.54 tax)
    const { order: initialOrder } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer_success@example.com',
        customerName: 'Successful Buyer',
        currency: 'INR',
        subtotalAmount: 84746n,
        discountAmount: 0n,
        taxAmount: 15254n,
        totalAmount: 100000n,
        status: 'requires_payment',
        paymentStatus: 'unpaid',
        items: [
          {
            productId: prod1Id,
            productTitle: 'Digital E-Book',
            unitAmount: 84746n,
            quantity: 1,
            subtotalAmount: 84746n,
            discountAmount: 0n,
            taxAmount: 15254n,
            totalAmount: 100000n,
          },
        ],
      })

      await paymentsRepo.createPayment(scope, {
        orderId: ord.order.id,
        provider: 'razorpay',
        providerPaymentId: 'pay_rzp_live_capture_001',
        amount: 100000n,
        currency: 'INR',
        status: 'pending',
      })

      return ord
    })

    // 2. Fulfill order atomically in one commit:
    const fulfillResult = await inScope(ws1Id, async (scope) => {
      // a. Update payment
      const payment = await paymentsRepo.updatePaymentStatus(
        scope,
        (await paymentsRepo.listPaymentsForOrder(scope, initialOrder.id))[0]!.id,
        'captured',
        {
          capturedAt: new Date(),
          method: 'upi',
        },
      )

      // b. Update order status
      const updatedOrder = await ordersRepo.updateOrderStatus(
        scope,
        initialOrder.id,
        'paid',
        'paid',
      )

      // c. Record order transition
      await ordersRepo.recordOrderTransition(scope, {
        orderId: initialOrder.id,
        fromStatus: 'requires_payment',
        toStatus: 'paid',
        actorType: 'system',
        reason: 'Payment captured via razorpay (pay_rzp_live_capture_001)',
      })

      // d. Find or create ledger accounts
      const procAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'processor_clearing',
        INR,
      )
      const creatorAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
        scope,
        'creator_payable',
        INR,
      )
      const feeAcc = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'platform_revenue', INR)
      const taxAcc = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'tax_payable', INR)

      // Platform fee: 5% of base (₹847.46 * 5% = ₹42.37 => 4237n)
      const baseMoney = money(initialOrder.subtotalAmount, INR)
      const feeMoney = percentage(baseMoney, basisPoints(500))
      // Creator payout = Total (100000) - Tax (15254) - Fee (4237) = 80509n
      const creatorPayout = 100000n - 15254n - feeMoney.amount

      // Post balanced double-entry transaction
      const ledgerTx = await ledgerRepo.postTransaction(scope, {
        workspaceId: workspaceId(ws1Id),
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: initialOrder.id,
        idempotencyKey: `order_payment_${initialOrder.id}`,
        description: `Order payment for order ${initialOrder.id}`,
        entries: [
          {
            accountId: ledgerAccountId(procAcc.id),
            direction: 'debit',
            amount: 100000n,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAcc.id),
            direction: 'credit',
            amount: creatorPayout,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(feeAcc.id),
            direction: 'credit',
            amount: feeMoney.amount,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(taxAcc.id),
            direction: 'credit',
            amount: 15254n,
            currency: INR,
          },
        ],
      })

      // e. Write outbox event
      await outboxRepo.writeOutboxEvent(scope, {
        workspaceId: workspaceId(ws1Id),
        aggregateType: 'order',
        aggregateId: initialOrder.id,
        eventType: 'order.paid',
        payload: {
          orderId: initialOrder.id,
          totalAmount: '100000',
          currency: 'INR',
        },
      })

      return {
        order: updatedOrder,
        payment,
        ledgerTx,
        accounts: { procAcc, creatorAcc, feeAcc, taxAcc },
      }
    })

    expect(fulfillResult.order.status).toBe('paid')
    expect(fulfillResult.order.paymentStatus).toBe('paid')
    expect(fulfillResult.payment.status).toBe('captured')
    expect(fulfillResult.ledgerTx.idempotentReplay).toBe(false)
    expect(fulfillResult.ledgerTx.entries).toHaveLength(4)

    // 3. Verify derived balances:
    await inScope(ws1Id, async (scope) => {
      const procBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(fulfillResult.accounts.procAcc.id),
      )
      const creatorBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(fulfillResult.accounts.creatorAcc.id),
      )
      const feeBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(fulfillResult.accounts.feeAcc.id),
      )
      const taxBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(fulfillResult.accounts.taxAcc.id),
      )

      // Processor clearing (asset/debit-normal): ₹1,000.00
      expect(procBal.amount).toBe(100000n)
      // Creator payable (liability/credit-normal): ₹805.09
      expect(creatorBal.amount).toBe(80509n)
      // Platform revenue (revenue/credit-normal): ₹42.37
      expect(feeBal.amount).toBe(4237n)
      // Tax payable (liability/credit-normal): ₹152.54
      expect(taxBal.amount).toBe(15254n)

      // Check sum of liabilities and revenue equals asset:
      expect(creatorBal.amount + feeBal.amount + taxBal.amount).toBe(procBal.amount)
    })
  })
})
