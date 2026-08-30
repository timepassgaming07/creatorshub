/**
 * Disputes repository integration tests (Slice 5 §5.10).
 *
 * Verifies against PostgreSQL 18:
 * 1. Dispute creation, retrieval, and status transitions.
 * 2. Multi-tenancy isolation between workspaces.
 * 3. Double-entry ledger postings for dispute withholding and fee expense.
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
import * as disputesRepo from './disputes.js'
import * as ledgerRepo from './ledger.js'
import * as ordersRepo from './orders.js'
import * as paymentsRepo from './payments.js'

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

describe('Disputes Repository Integration', () => {
  it('creates, updates status, and retrieves disputes for an order', async () => {
    const { order, payment } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'dispute_buyer@example.com',
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
        providerPaymentId: 'pay_rzp_disp_001',
        amount: 100000n,
        currency: 'INR',
        status: 'captured',
      })
      return { order: ord.order, payment: pay }
    })

    const evidenceDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const dispute = await inScope(ws1Id, (scope) =>
      disputesRepo.createDispute(scope, {
        orderId: order.id,
        paymentId: payment.id,
        providerDisputeId: 'disp_rzp_123',
        amount: 100000n,
        currency: 'INR',
        reason: 'Fraudulent transaction reported by cardholder',
        status: 'needs_response',
        feeAmount: 150000n, // ₹1,500 dispute fee
        evidenceDueAt: evidenceDue,
      }),
    )

    expect(dispute.amount).toBe(100000n)
    expect(dispute.feeAmount).toBe(150000n)
    expect(dispute.status).toBe('needs_response')

    // Update dispute status
    const updated = await inScope(ws1Id, (scope) =>
      disputesRepo.updateDisputeStatus(scope, dispute.id, 'under_review', {
        metadata: { evidenceSubmitted: true },
      }),
    )
    expect(updated.status).toBe('under_review')

    // List disputes for order
    const list = await inScope(ws1Id, (scope) => disputesRepo.listDisputesForOrder(scope, order.id))
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe(dispute.id)

    // Find by provider ID
    const found = await inScope(ws1Id, (scope) =>
      disputesRepo.findDisputeByProviderDisputeId(scope, 'disp_rzp_123'),
    )
    expect(found?.id).toBe(dispute.id)
  })

  it('enforces tenant isolation between workspaces for disputes', async () => {
    const { order, payment } = await inScope(ws1Id, async (scope) => {
      const ord = await ordersRepo.createOrder(scope, {
        customerEmail: 'buyer_disp_ws1@example.com',
        currency: 'INR',
        subtotalAmount: 50000n,
        totalAmount: 50000n,
        items: [],
      })
      const pay = await paymentsRepo.createPayment(scope, {
        orderId: ord.order.id,
        provider: 'razorpay',
        providerPaymentId: 'pay_ws1_disp_002',
        amount: 50000n,
        currency: 'INR',
      })
      return { order: ord.order, payment: pay }
    })

    const ws1Dispute = await inScope(ws1Id, (scope) =>
      disputesRepo.createDispute(scope, {
        orderId: order.id,
        paymentId: payment.id,
        providerDisputeId: 'disp_ws1_sec_001',
        amount: 50000n,
        currency: 'INR',
      }),
    )

    // Workspace 2 attempting to read Workspace 1 dispute should return null
    const ws2Read = await inScope(ws2Id, (scope) =>
      disputesRepo.findDisputeById(scope, ws1Dispute.id),
    )
    expect(ws2Read).toBeNull()

    // Workspace 2 attempting to find by provider dispute id should return null
    const ws2ReadByProvider = await inScope(ws2Id, (scope) =>
      disputesRepo.findDisputeByProviderDisputeId(scope, 'disp_ws1_sec_001'),
    )
    expect(ws2ReadByProvider).toBeNull()

    // Workspace 2 attempting to update Workspace 1 dispute should throw
    await expect(
      inScope(ws2Id, (scope) => disputesRepo.updateDisputeStatus(scope, ws1Dispute.id, 'won')),
    ).rejects.toThrow()
  })

  it('posts balanced double-entry dispute transactions', async () => {
    const INR = currency('INR')
    const disputeAmt = 50000n
    const feeAmt = 15000n // ₹150 dispute fee
    const totalClearing = disputeAmt + feeAmt // 65000n

    await inScope(ws1Id, async (scope) => {
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
      const feeAcc = await ledgerRepo.findOrCreateWorkspaceAccount(scope, 'fees_expense', INR)

      const txResult = await ledgerRepo.postTransaction(scope, {
        workspaceId: workspaceId(ws1Id),
        kind: 'dispute',
        referenceType: 'dispute',
        referenceId: 'disp_test_001',
        idempotencyKey: 'disp_tx_001',
        entries: [
          {
            accountId: ledgerAccountId(procAcc.id),
            direction: 'credit',
            amount: totalClearing,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(creatorAcc.id),
            direction: 'debit',
            amount: disputeAmt,
            currency: INR,
          },
          {
            accountId: ledgerAccountId(feeAcc.id),
            direction: 'debit',
            amount: feeAmt,
            currency: INR,
          },
        ],
      })

      expect(txResult.idempotentReplay).toBe(false)
      expect(txResult.entries).toHaveLength(3)

      const procBal = await ledgerRepo.getAccountBalance(scope, ledgerAccountId(procAcc.id))
      const creatorBal = await ledgerRepo.getAccountBalance(scope, ledgerAccountId(creatorAcc.id))
      const feeBal = await ledgerRepo.getAccountBalance(scope, ledgerAccountId(feeAcc.id))

      // Processor clearing credited (balance -65000n)
      expect(procBal.amount).toBe(-65000n)
      // Creator payable debited (balance -50000n)
      expect(creatorBal.amount).toBe(-50000n)
      // Fees expense debited (balance 15000n)
      expect(feeBal.amount).toBe(15000n)
    })
  })
})
