/**
 * Payments repository integration tests (Slice 5 §5.2).
 *
 * Verifies against PostgreSQL 18:
 * 1. Payment accounts lifecycle and active account resolution.
 * 2. Payment attempts creation and status updates.
 * 3. Multi-tenancy isolation: Workspace 1 cannot access Workspace 2's payment accounts or payments.
 * 4. Exact minor units preservation.
 */
import { requestId, userId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as ordersRepo from './orders.js'
import * as paymentsRepo from './payments.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let db: Database

let ws1Id: string
let ws2Id: string
let order1Id: string

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
  await control`TRUNCATE TABLE payments, payment_accounts, orders, users, workspaces CASCADE`

  const [ws1] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
  `
  ws1Id = ws1?.id ?? ''

  const [ws2] = await control<{ id: string }[]>`
    INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
  `
  ws2Id = ws2?.id ?? ''

  // Create an order in workspace 1
  const ord = await inScope(ws1Id, (s) =>
    ordersRepo.createOrder(s, {
      customerEmail: 'buyer@test.com',
      currency: 'INR',
      subtotalAmount: 100000n,
      totalAmount: 100000n,
      items: [],
    }),
  )
  order1Id = ord.order.id
})

describe('Payments Repository', () => {
  it('creates and manages connected payment accounts', async () => {
    const createdAccount = await inScope(ws1Id, (scope) =>
      paymentsRepo.createPaymentAccount(scope, {
        provider: 'razorpay',
        providerAccountId: 'acc_rzp_12345',
        country: 'IN',
        defaultCurrency: 'INR',
        status: 'onboarding_pending',
      }),
    )

    expect(createdAccount.id).toBeDefined()
    expect(createdAccount.provider).toBe('razorpay')
    expect(createdAccount.status).toBe('onboarding_pending')

    // Find payment account
    const fetched = await inScope(ws1Id, (scope) =>
      paymentsRepo.findPaymentAccount(scope, 'razorpay', 'acc_rzp_12345'),
    )
    expect(fetched?.id).toBe(createdAccount.id)

    // Update status to active with charges and payouts enabled
    const updated = await inScope(ws1Id, (scope) =>
      paymentsRepo.updatePaymentAccountStatus(scope, createdAccount.id, 'active', {
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      }),
    )

    expect(updated.status).toBe('active')
    expect(updated.chargesEnabled).toBe(true)
    expect(updated.payoutsEnabled).toBe(true)

    // Find active account
    const active = await inScope(ws1Id, (scope) =>
      paymentsRepo.findActivePaymentAccount(scope, 'razorpay'),
    )
    expect(active?.id).toBe(createdAccount.id)
  })

  it('creates payment attempt and updates payment status', async () => {
    const payment = await inScope(ws1Id, (scope) =>
      paymentsRepo.createPayment(scope, {
        orderId: order1Id,
        provider: 'razorpay',
        providerPaymentId: 'pay_rzp_98765',
        providerOrderId: 'order_rzp_123',
        amount: 100000n,
        currency: 'INR',
        status: 'pending',
      }),
    )

    expect(payment.id).toBeDefined()
    expect(payment.amount).toBe(100000n)
    expect(payment.status).toBe('pending')

    // Find by provider payment id
    const found = await inScope(ws1Id, (scope) =>
      paymentsRepo.findPaymentByProviderPaymentId(scope, 'razorpay', 'pay_rzp_98765'),
    )
    expect(found?.id).toBe(payment.id)

    // Update status to captured
    const captured = await inScope(ws1Id, (scope) =>
      paymentsRepo.updatePaymentStatus(scope, payment.id, 'captured', {
        capturedAt: new Date(),
        method: 'upi',
      }),
    )

    expect(captured.status).toBe('captured')
    expect(captured.method).toBe('upi')
    expect(captured.capturedAt).toBeDefined()
  })

  it('enforces tenant isolation on payments and accounts', async () => {
    const acc = await inScope(ws1Id, (scope) =>
      paymentsRepo.createPaymentAccount(scope, {
        provider: 'razorpay',
        providerAccountId: 'acc_rzp_secret',
        country: 'IN',
        defaultCurrency: 'INR',
        status: 'active',
      }),
    )

    // Workspace 2 looking for Workspace 1's account should get null
    const ws2Lookup = await inScope(ws2Id, (scope) =>
      paymentsRepo.findPaymentAccount(scope, 'razorpay', 'acc_rzp_secret'),
    )
    expect(ws2Lookup).toBeNull()

    // Workspace 2 attempting to update Workspace 1's account should throw
    await expect(
      inScope(ws2Id, (scope) => paymentsRepo.updatePaymentAccountStatus(scope, acc.id, 'disabled')),
    ).rejects.toThrow()
  })
})
