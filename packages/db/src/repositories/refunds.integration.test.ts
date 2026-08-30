/**
 * Refunds repository integration tests (Slice 5 §5.10).
 *
 * Verifies against PostgreSQL 18:
 * 1. Refund creation, retrieval, and status updates.
 * 2. Multi-tenancy isolation between workspaces.
 * 3. Total refunded minor units calculation per order.
 * 4. Atomic compensating double-entry ledger transactions returning net balances to zero.
 */
import {
  currency,
  ledgerAccountId,
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
import * as ledgerRepo from './ledger.js'
import * as ordersRepo from './orders.js'
import * as paymentsRepo from './payments.js'
import * as refundsRepo from './refunds.js'

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
    requestId: requestId('req-1'),
  })
  return db.withWorkspace(context, (tx) => fn({ tx, context }))
}

beforeEach(async () => {
  await control`TRUNCATE TABLE refunds, disputes, payments, payment_accounts, order_items, order_transitions, orders, ledger_entries, ledger_transactions, ledger_accounts, users, workspaces CASCADE`

  const [ws1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
  `
  ws1Id = ws1?.id ?? ''

  const [ws2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
  `
  ws2Id = ws2?.id ?? ''
})

describe('Refunds Repository Integration', () => {
  it('creates and lists refunds for an order with exact integer amounts', async () => {
    const { order, payment } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer@example.com',
        currency: 'INR',
        subtotalAmount: 100000n,
        totalAmount: 100000n,
        status: 'paid',
        paymentStatus: 'paid',
        items: [],
      })
      const pay = await paymentsRepo.createPayment(scope, {
        orderId: ord.order.id,
        provider: 'razorpay',
        providerPaymentId: 'pay_rzp_rf_test_001',
        amount: 100000n,
        currency: 'INR',
        status: 'captured',
      })
      return { order: ord.order, payment: pay }
    })

    // Create partial refund 1
    const refund1 = await inScope(ws1Id, (scope) =>
      refundsRepo.createRefund(scope, {
        orderId: order.id,
        paymentId: payment.id,
        providerRefundId: 'rfnd_rzp_001',
        amount: 40000n,
        currency: 'INR',
        status: 'succeeded',
        reason: 'Customer requested partial refund',
      }),
    )

    expect(refund1.amount).toBe(40000n)
    expect(refund1.status).toBe('succeeded')
    expect(refund1.currency).toBe('INR')

    // Create partial refund 2
    const refund2 = await inScope(ws1Id, (scope) =>
      refundsRepo.createRefund(scope, {
        orderId: order.id,
        paymentId: payment.id,
        providerRefundId: 'rfnd_rzp_002',
        amount: 60000n,
        currency: 'INR',
        status: 'succeeded',
        reason: 'Remaining refund',
      }),
    )

    expect(refund2.amount).toBe(60000n)

    // Calculate total refunded
    const totalRefunded = await inScope(ws1Id, (scope) =>
      refundsRepo.calculateTotalRefundedForOrder(scope, order.id),
    )
    expect(totalRefunded).toBe(100000n)

    // List refunds for order
    const list = await inScope(ws1Id, (scope) => refundsRepo.listRefundsForOrder(scope, order.id))
    expect(list).toHaveLength(2)

    // Find by provider ID
    const found = await inScope(ws1Id, (scope) =>
      refundsRepo.findRefundByProviderRefundId(scope, 'rfnd_rzp_001'),
    )
    expect(found?.id).toBe(refund1.id)
  })

  it('enforces multi-tenancy isolation between workspaces for refunds', async () => {
    const { order, payment } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer_ws1@example.com',
        currency: 'INR',
        subtotalAmount: 50000n,
        totalAmount: 50000n,
        items: [],
      })
      const pay = await paymentsRepo.createPayment(scope, {
        orderId: ord.order.id,
        provider: 'razorpay',
        providerPaymentId: 'pay_ws1_sec_001',
        amount: 50000n,
        currency: 'INR',
      })
      return { order: ord.order, payment: pay }
    })

    const ws1Refund = await inScope(ws1Id, (scope) =>
      refundsRepo.createRefund(scope, {
        orderId: order.id,
        paymentId: payment.id,
        providerRefundId: 'rfnd_ws1_sec_001',
        amount: 50000n,
        currency: 'INR',
      }),
    )

    // Workspace 2 attempting to read Workspace 1 refund should return null
    const ws2Read = await inScope(ws2Id, (scope) => refundsRepo.findRefundById(scope, ws1Refund.id))
    expect(ws2Read).toBeNull()

    // Workspace 2 attempting to read by provider refund id should return null
    const ws2ReadByProvider = await inScope(ws2Id, (scope) =>
      refundsRepo.findRefundByProviderRefundId(scope, 'rfnd_ws1_sec_001'),
    )
    expect(ws2ReadByProvider).toBeNull()

    // Workspace 2 attempting to update Workspace 1 refund should throw
    await expect(
      inScope(ws2Id, (scope) => refundsRepo.updateRefundStatus(scope, ws1Refund.id, 'succeeded')),
    ).rejects.toThrow()
  })

  it('posts a compensating balanced ledger transaction returning accounts to net zero', async () => {
    const INR = currency('INR')

    // Initial payment: ₹10,000 gross (₹8,474.58 base, ₹1,525.42 tax, 5% platform fee = ₹423.73)
    const gross = 100000n
    const tax = 15254n
    const fee = 4237n // 5% of base (84746n)
    const creator = gross - tax - fee // 80509n

    const { order, accounts } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer_ledger@example.com',
        currency: 'INR',
        subtotalAmount: 84746n,
        taxAmount: tax,
        totalAmount: gross,
        status: 'paid',
        paymentStatus: 'paid',
        items: [],
      })

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

      // Post initial payment transaction
      await ledgerRepo.postTransaction(scope, {
        workspaceId: workspaceId(ws1Id),
        kind: 'order_payment',
        referenceType: 'order',
        referenceId: ord.order.id,
        idempotencyKey: `pay_${ord.order.id}`,
        entries: [
          {
            accountId: ledgerAccountId(procAcc.id),
            direction: 'debit',
            amount: gross,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAcc.id),
            direction: 'credit',
            amount: creator,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(feeAcc.id),
            direction: 'credit',
            amount: fee,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(taxAcc.id),
            direction: 'credit',
            amount: tax,
            currency: INR,
          },
        ],
      })

      return { order: ord.order, accounts: { procAcc, creatorAcc, feeAcc, taxAcc } }
    })

    // Now execute full compensating refund posting
    await inScope(ws1Id, async (scope) => {
      await ledgerRepo.postTransaction(scope, {
        workspaceId: workspaceId(ws1Id),
        kind: 'refund',
        referenceType: 'refund',
        referenceId: `rfnd_${order.id}`,
        idempotencyKey: `refund_tx_${order.id}`,
        entries: [
          {
            accountId: ledgerAccountId(accounts.procAcc.id),
            direction: 'credit',
            amount: gross,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(accounts.creatorAcc.id),
            direction: 'debit',
            amount: creator,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(accounts.feeAcc.id),
            direction: 'debit',
            amount: fee,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(accounts.taxAcc.id),
            direction: 'debit',
            amount: tax,
            currency: INR,
          },
        ],
      })
    })

    // Verify all balances have returned to exactly 0n
    await inScope(ws1Id, async (scope) => {
      const procBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(accounts.procAcc.id),
      )
      const creatorBal = await ledgerRepo.getAccountBalance(
        scope,
        ledgerAccountId(accounts.creatorAcc.id),
      )
      const feeBal = await ledgerRepo.getAccountBalance(scope, ledgerAccountId(accounts.feeAcc.id))
      const taxBal = await ledgerRepo.getAccountBalance(scope, ledgerAccountId(accounts.taxAcc.id))

      expect(procBal.amount).toBe(0n)
      expect(creatorBal.amount).toBe(0n)
      expect(feeBal.amount).toBe(0n)
      expect(taxBal.amount).toBe(0n)
    })
  })
})
