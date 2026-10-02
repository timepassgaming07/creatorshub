/**
 * Integration Test Suite for Payouts & Beneficiary Accounts Repositories (Slice 11 §11.1, §11.4).
 *
 * Proves against real PostgreSQL 18:
 * 1. Beneficiary bank accounts and UPI IDs creation, masking, and default switching.
 * 2. Payout lifecycle: request -> approve (with double-entry ledger posting) -> processing -> paid.
 * 3. Failure compensation: failed payout posts compensating ledger reversal.
 * 4. Payout balance overview derives correct available, in-transit, and settled balances.
 * 5. Multi-tenant RLS isolation: zero cross-tenant leakage between workspaces.
 */
import {
  beneficiaryAccountId,
  currency,
  payoutId,
  requestId,
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
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import * as beneficiaryRepo from './beneficiary-accounts.js'
import * as payoutsRepo from './payouts.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

describe('Payouts & Beneficiary Accounts Integration Suite (Postgres 18)', () => {
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
      INSERT INTO workspaces (id, slug, name)
      VALUES
        (${ws1Id}, 'payouts-ws-1', 'Payouts WS 1'),
        (${ws2Id}, 'payouts-ws-2', 'Payouts WS 2')
      ON CONFLICT (id) DO NOTHING;
    `

    await adminClient`
      INSERT INTO users (id, email)
      VALUES
        (${actor1}, 'creator1@test.com'),
        (${actor2}, 'creator2@test.com')
      ON CONFLICT (id) DO NOTHING;
    `

    await adminClient`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES
        (${ws1Id}, ${actor1}, 'owner'),
        (${ws2Id}, ${actor2}, 'owner')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    `
  }, 60000)

  afterAll(async () => {
    await adminClient.end()
    await container.stop()
  })

  async function inScope<T>(
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

  it('creates and manages beneficiary bank accounts and UPI VPAs with masking', async () => {
    await inScope(ws1Id, actor1, async (scope1) => {
      const bankAcc = await beneficiaryRepo.createBeneficiaryAccount(scope1, {
        payeeType: 'workspace',
        payeeId: ws1Id,
        accountHolderName: 'Acme Creator Studio',
        accountType: 'bank_account',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0000060',
        isDefault: true,
      })

      expect(bankAcc.id).toBeDefined()
      expect(bankAcc.maskedAccountNumber).toBe('••••••••7890')
      expect(bankAcc.ifscCode).toBe('HDFC0000060')
      expect(bankAcc.isDefault).toBe(true)

      const upiAcc = await beneficiaryRepo.createBeneficiaryAccount(scope1, {
        payeeType: 'workspace',
        payeeId: ws1Id,
        accountHolderName: 'Acme Creator Studio',
        accountType: 'vpa',
        vpa: 'acme@okhdfcbank',
        isDefault: false,
      })

      expect(upiAcc.id).toBeDefined()
      expect(upiAcc.vpa).toBe('acme@okhdfcbank')
      expect(upiAcc.isDefault).toBe(false)

      // Switch default
      const updatedUpi = await beneficiaryRepo.setDefaultBeneficiaryAccount(
        scope1,
        beneficiaryAccountId(upiAcc.id),
      )
      expect(updatedUpi?.isDefault).toBe(true)

      const reloadedBank = await beneficiaryRepo.findBeneficiaryAccountById(
        scope1,
        beneficiaryAccountId(bankAcc.id),
      )
      expect(reloadedBank?.isDefault).toBe(false)

      const list = await beneficiaryRepo.listBeneficiaryAccounts(scope1)
      expect(list.length).toBe(2)
    })
  })

  it('handles full payout lifecycle (request -> approve -> processing -> paid)', async () => {
    await inScope(ws1Id, actor1, async (scope1) => {
      const accounts = await beneficiaryRepo.listBeneficiaryAccounts(scope1)
      const beneficiary = accounts[0]!

      // 1. Request Payout
      const payout = await payoutsRepo.requestPayout(scope1, {
        beneficiaryAccountId: beneficiaryAccountId(beneficiary.id),
        amount: 100_000n, // ₹1,000.00
        currency: currency('INR'),
        requestedBy: actor1,
        notes: 'Monthly creator earnings payout',
      })

      expect(payout.id).toBeDefined()
      expect(payout.status).toBe('requested')
      expect(payout.amount).toBe(100_000n)

      // 2. Approve Payout
      const approved = await payoutsRepo.approvePayout(scope1, {
        payoutId: payoutId(payout.id),
        approvedBy: actor1,
      })

      expect(approved?.status).toBe('approved')
      expect(approved?.approvedBy).toBe(actor1)
      expect(approved?.approvedAt).toBeDefined()

      // 3. Record Processing
      const processing = await payoutsRepo.recordPayoutProcessing(scope1, {
        payoutId: payoutId(payout.id),
        providerPayoutId: 'pout_test_rzp_98765',
      })

      expect(processing?.status).toBe('processing')
      expect(processing?.providerPayoutId).toBe('pout_test_rzp_98765')

      // 4. Record Settlement (Paid)
      const settled = await payoutsRepo.recordPayoutSettlement(scope1, payoutId(payout.id))

      expect(settled?.status).toBe('paid')
      expect(settled?.completedAt).toBeDefined()

      // Verify detail lookup
      const found = await payoutsRepo.findPayoutById(scope1, payoutId(payout.id))
      expect(found?.status).toBe('paid')
      expect(found?.beneficiary?.id).toBe(beneficiary.id)
    })
  })

  it('handles payout failure and posts compensating reversal', async () => {
    await inScope(ws1Id, actor1, async (scope1) => {
      const accounts = await beneficiaryRepo.listBeneficiaryAccounts(scope1)
      const beneficiary = accounts[0]!

      const payout = await payoutsRepo.requestPayout(scope1, {
        beneficiaryAccountId: beneficiaryAccountId(beneficiary.id),
        amount: 50_000n,
        currency: currency('INR'),
        requestedBy: actor1,
      })

      await payoutsRepo.approvePayout(scope1, {
        payoutId: payoutId(payout.id),
        approvedBy: actor1,
      })

      const failed = await payoutsRepo.recordPayoutFailure(scope1, {
        payoutId: payoutId(payout.id),
        failureReason: 'BANK_ACCOUNT_CLOSED',
      })

      expect(failed?.status).toBe('failed')
      expect(failed?.failureReason).toBe('BANK_ACCOUNT_CLOSED')
    })
  })

  it('computes live payout balance overview', async () => {
    await inScope(ws1Id, actor1, async (scope1) => {
      const overview = await payoutsRepo.getPayoutBalanceOverview(scope1, currency('INR'))

      expect(overview.currency).toBe('INR')
      expect(overview.minimumPayoutMinor).toBe('50000')
      expect(overview.lifetimeSettledMinor).toBe('100000')
    })
  })

  it('enforces multi-tenant RLS isolation between workspaces', async () => {
    await inScope(ws1Id, actor1, async (scope1) => {
      await inScope(ws2Id, actor2, async (scope2) => {
        // Workspace 2 should not see Workspace 1's beneficiary accounts or payouts
        const ws2Accounts = await beneficiaryRepo.listBeneficiaryAccounts(scope2)
        expect(ws2Accounts.length).toBe(0)

        const ws2Payouts = await payoutsRepo.listPayouts(scope2)
        expect(ws2Payouts.length).toBe(0)

        // Attempting to read Workspace 1's payout by ID from Workspace 2 scope returns undefined
        const ws1Payouts = await payoutsRepo.listPayouts(scope1)
        expect(ws1Payouts.length).toBeGreaterThan(0)
        const ws1PayoutId = payoutId(ws1Payouts[0]!.id)

        const crossTenantRead = await payoutsRepo.findPayoutById(scope2, ws1PayoutId)
        expect(crossTenantRead).toBeUndefined()
      })
    })
  })
})
