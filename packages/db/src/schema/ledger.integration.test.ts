/**
 * Double-entry ledger integration tests (Slice 2 items 2.1, 2.2, 2.3).
 *
 * Verifies against a real PostgreSQL 18 Testcontainers database:
 * 1. Balanced transactions commit cleanly.
 * 2. Unbalanced transactions fail at the database layer via deferred constraint trigger.
 * 3. `UPDATE` and `DELETE` on `ledger_entries` are rejected (immutability).
 * 4. `amount > 0` check constraint is enforced.
 * 5. Multi-tenant RLS isolation is enforced for `creatorhub_app`.
 */
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '../migrate.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let container: TestDatabase
let control: postgres.Sql
let app: postgres.Sql

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({
    migrationUrl: container.migrationUrl,
    migrationsFolder: MIGRATIONS,
  })

  control = postgres(container.superuserUrl, { max: 5, onnotice: () => undefined })
  app = postgres(container.databaseUrl, { max: 5, onnotice: () => undefined })
}, 120_000)

afterAll(async () => {
  await app.end()
  await control.end()
  await container.stop()
})

describe('Double-Entry Ledger Schema & Invariants (2.1, 2.2, 2.3)', () => {
  let workspace1Id: string
  let workspace2Id: string

  let processorClearingAccountId: string
  let platformRevenueAccountId: string
  let creator1PayableAccountId: string
  let creator2PayableAccountId: string

  beforeEach(async () => {
    // Clean up ledger tables and seed standard workspaces via TRUNCATE
    await control`TRUNCATE TABLE ledger_entries, ledger_transactions, ledger_accounts, workspaces CASCADE`

    const [ws1] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace One', 'ws-one') RETURNING id
    `
    workspace1Id = ws1?.id ?? ''

    const [ws2] = await control<{ id: string }[]>`
      INSERT INTO workspaces (name, slug) VALUES ('Workspace Two', 'ws-two') RETURNING id
    `
    workspace2Id = ws2?.id ?? ''

    // Seed global accounts
    const [proc] = await control<{ id: string }[]>`
      INSERT INTO ledger_accounts (owner_type, owner_id, kind, currency)
      VALUES ('processor', NULL, 'processor_clearing', 'INR') RETURNING id
    `
    processorClearingAccountId = proc?.id ?? ''

    const [plat] = await control<{ id: string }[]>`
      INSERT INTO ledger_accounts (owner_type, owner_id, kind, currency)
      VALUES ('platform', NULL, 'platform_revenue', 'INR') RETURNING id
    `
    platformRevenueAccountId = plat?.id ?? ''

    // Seed workspace accounts
    const [c1] = await control<{ id: string }[]>`
      INSERT INTO ledger_accounts (workspace_id, owner_type, owner_id, kind, currency)
      VALUES (${workspace1Id}, 'workspace', ${workspace1Id}, 'creator_payable', 'INR') RETURNING id
    `
    creator1PayableAccountId = c1?.id ?? ''

    const [c2] = await control<{ id: string }[]>`
      INSERT INTO ledger_accounts (workspace_id, owner_type, owner_id, kind, currency)
      VALUES (${workspace2Id}, 'workspace', ${workspace2Id}, 'creator_payable', 'INR') RETURNING id
    `
    creator2PayableAccountId = c2?.id ?? ''
  })

  it('allows a balanced transaction with matching debits and credits to commit', async () => {
    await control.begin(async (tx) => {
      const [txn] = await tx<{ id: string }[]>`
        INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
        VALUES (${workspace1Id}, 'order_payment', 'order', 'order_123', 'idemp_001') RETURNING id
      `
      const txId = txn?.id ?? ''

      // Total Sale: 10,000 INR (100.00 INR)
      // Debit: processor_clearing 10,000
      // Credit: creator_payable 9,500
      // Credit: platform_revenue 500
      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${processorClearingAccountId}, 'debit', 10000, 'INR', ${workspace1Id})
      `

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${creator1PayableAccountId}, 'credit', 9500, 'INR', ${workspace1Id})
      `

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${platformRevenueAccountId}, 'credit', 500, 'INR', ${workspace1Id})
      `
    })

    const entries = await control`
      SELECT * FROM ledger_entries WHERE workspace_id = ${workspace1Id}
    `
    expect(entries).toHaveLength(3)
  })

  it('rejects an unbalanced transaction at commit via deferred constraint trigger (2.2)', async () => {
    await expect(
      control.begin(async (tx) => {
        const [txn] = await tx<{ id: string }[]>`
          INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
          VALUES (${workspace1Id}, 'order_payment', 'order', 'order_unbalanced', 'idemp_unbalanced') RETURNING id
        `
        const txId = txn?.id ?? ''

        // Unbalanced: Debit 10000, Credit 9000 (diff 1000)
        await tx`
          INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
          VALUES (${txId}, ${processorClearingAccountId}, 'debit', 10000, 'INR', ${workspace1Id})
        `

        await tx`
          INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
          VALUES (${txId}, ${creator1PayableAccountId}, 'credit', 9000, 'INR', ${workspace1Id})
        `
      }),
    ).rejects.toThrow(/does not balance/i)
  })

  it('rejects an empty transaction with zero credits or debits at commit', async () => {
    await expect(
      control.begin(async (tx) => {
        const [txn] = await tx<{ id: string }[]>`
          INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
          VALUES (${workspace1Id}, 'order_payment', 'order', 'order_debit_only', 'idemp_debit_only') RETURNING id
        `
        const txId = txn?.id ?? ''

        // Debit only without any credits
        await tx`
          INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
          VALUES (${txId}, ${processorClearingAccountId}, 'debit', 5000, 'INR', ${workspace1Id})
        `
      }),
    ).rejects.toThrow(/does not balance/i)
  })

  it('rejects UPDATE on ledger_entries (immutability - 2.3)', async () => {
    // 1. Post a valid balanced transaction
    let entryId = ''
    await control.begin(async (tx) => {
      const [txn] = await tx<{ id: string }[]>`
        INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
        VALUES (${workspace1Id}, 'order_payment', 'order', 'order_mut', 'idemp_mut') RETURNING id
      `
      const txId = txn?.id ?? ''

      const [entry] = await tx<{ id: string }[]>`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${processorClearingAccountId}, 'debit', 1000, 'INR', ${workspace1Id}) RETURNING id
      `
      entryId = entry?.id ?? ''

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${creator1PayableAccountId}, 'credit', 1000, 'INR', ${workspace1Id})
      `
    })

    // Attempting to UPDATE amount on an entry must be blocked by trigger
    await expect(
      control`UPDATE ledger_entries SET amount = 2000 WHERE id = ${entryId}`,
    ).rejects.toThrow(/append-only: UPDATE and DELETE are prohibited/i)
  })

  it('rejects DELETE on ledger_entries (immutability - 2.3)', async () => {
    let entryId = ''
    await control.begin(async (tx) => {
      const [txn] = await tx<{ id: string }[]>`
        INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
        VALUES (${workspace1Id}, 'order_payment', 'order', 'order_del', 'idemp_del') RETURNING id
      `
      const txId = txn?.id ?? ''

      const [entry] = await tx<{ id: string }[]>`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${processorClearingAccountId}, 'debit', 1000, 'INR', ${workspace1Id}) RETURNING id
      `
      entryId = entry?.id ?? ''

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${creator1PayableAccountId}, 'credit', 1000, 'INR', ${workspace1Id})
      `
    })

    // Attempting to DELETE must be blocked by trigger
    await expect(control`DELETE FROM ledger_entries WHERE id = ${entryId}`).rejects.toThrow(
      /append-only: UPDATE and DELETE are prohibited/i,
    )
  })

  it('enforces amount > 0 check constraint', async () => {
    const [txn] = await control<{ id: string }[]>`
      INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
      VALUES (${workspace1Id}, 'order_payment', 'order', 'order_neg', 'idemp_neg') RETURNING id
    `
    const txId = txn?.id ?? ''

    // amount = 0
    await expect(
      control`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${processorClearingAccountId}, 'debit', 0, 'INR', ${workspace1Id})
      `,
    ).rejects.toThrow(/ledger_entries_amount_positive/i)

    // amount < 0
    await expect(
      control`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${txId}, ${processorClearingAccountId}, 'debit', -500, 'INR', ${workspace1Id})
      `,
    ).rejects.toThrow(/ledger_entries_amount_positive/i)
  })

  it('enforces RLS tenant isolation under creatorhub_app role', async () => {
    // 1. Post transaction for workspace1
    await control.begin(async (tx) => {
      const [txn1] = await tx<{ id: string }[]>`
        INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
        VALUES (${workspace1Id}, 'order_payment', 'order', 'order_ws1', 'idemp_ws1') RETURNING id
      `
      const tx1Id = txn1?.id ?? ''

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${tx1Id}, ${processorClearingAccountId}, 'debit', 1000, 'INR', ${workspace1Id}),
               (${tx1Id}, ${creator1PayableAccountId}, 'credit', 1000, 'INR', ${workspace1Id})
      `
    })

    // 2. Post transaction for workspace2
    await control.begin(async (tx) => {
      const [txn2] = await tx<{ id: string }[]>`
        INSERT INTO ledger_transactions (workspace_id, kind, reference_type, reference_id, idempotency_key)
        VALUES (${workspace2Id}, 'order_payment', 'order', 'order_ws2', 'idemp_ws2') RETURNING id
      `
      const tx2Id = txn2?.id ?? ''

      await tx`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${tx2Id}, ${processorClearingAccountId}, 'debit', 2000, 'INR', ${workspace2Id}),
               (${tx2Id}, ${creator2PayableAccountId}, 'credit', 2000, 'INR', ${workspace2Id})
      `
    })

    // 3. Query as creatorhub_app for workspace 1
    await app`SELECT set_config('app.workspace_id', ${workspace1Id}, false)`

    // Should only see entries for workspace 1
    const entries = await app<{ id: string; workspace_id: string }[]>`
      SELECT id, workspace_id FROM ledger_entries
    `
    expect(entries.length).toBeGreaterThan(0)
    for (const row of entries) {
      expect(row.workspace_id).toBe(workspace1Id)
    }

    // Should not see workspace 2 accounts
    const accounts = await app<{ id: string; workspace_id: string }[]>`
      SELECT id, workspace_id FROM ledger_accounts WHERE id = ${creator2PayableAccountId}
    `
    expect(accounts).toHaveLength(0)

    // Cannot insert entry with workspace 2 id under workspace 1 tenant context
    const [dummyTx] = await control<{ id: string }[]>`
      SELECT id FROM ledger_transactions WHERE workspace_id = ${workspace1Id} LIMIT 1
    `
    await expect(
      app`
        INSERT INTO ledger_entries (transaction_id, account_id, direction, amount, currency, workspace_id)
        VALUES (${dummyTx?.id ?? ''}, ${processorClearingAccountId}, 'debit', 500, 'INR', ${workspace2Id})
      `,
    ).rejects.toThrow(/violates row-level security policy/i)
  })
})
