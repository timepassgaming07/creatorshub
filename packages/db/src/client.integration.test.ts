import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { requestId, workspaceId } from '@creatorhub/contracts'

import { createDatabase, type Database } from './client.js'
import { loadDatabaseConfig } from './config.js'
import { startTestDatabase, type TestDatabase } from './testing/harness.js'

/**
 * Proves the connection layer actually scopes by tenant, against real Postgres.
 *
 * These are the checks that cannot be made with a mock. A fake client agrees
 * with whatever we assert; only a real transaction shows that `set_config`
 * with `true` is discarded at commit, and only a real pool shows that the next
 * borrower does not inherit the previous tenant.
 */

const WORKSPACE_A = workspaceId('019fbd70-4d9a-72e4-b6ed-722fe672c2ba')
const WORKSPACE_B = workspaceId('019fbd70-5a1c-7f02-9c3d-1a2b3c4d5e6f')
const REQUEST = requestId('4bf92f3577b34da6a3ce929d0e0e4736')

const contextFor = (id: typeof WORKSPACE_A) => ({ workspaceId: id, requestId: REQUEST })

let container: TestDatabase
let db: Database

beforeAll(async () => {
  container = await startTestDatabase()
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      // One connection, so "the next borrower" is provably the same physical
      // connection. On a larger pool a leak test can pass by getting a
      // different connection rather than by the setting being cleared.
      DATABASE_POOL_MAX: '1',
    }),
  )

  // The probe table is created by the migrator, because the application role has
  // no DDL privilege. That is the intended split (ADR-0015) and it is asserted
  // directly further down.
  const migrator = postgres(container.migrationUrl, { max: 1, onnotice: () => undefined })
  try {
    await migrator`create table rollback_probe (id int)`
  } finally {
    await migrator.end()
  }
})

afterAll(async () => {
  await db.close()
  await container.stop()
})

/** Reads the tenant setting. `true` returns null when unset rather than raising. */
const readTenant = sql`select current_setting('app.workspace_id', true) as value`

type TenantRow = { value: string | null }

describe('withWorkspace', () => {
  it('sets the tenant for the duration of the transaction', async () => {
    const seen = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
      return rows[0]?.value
    })

    expect(seen).toBe(WORKSPACE_A)
  })

  // ADR-0012 layer 1: the setting must not leak across transactions on the
  // same physical connection. With pool size 1, workspace B is guaranteed to
  // get the connection workspace A just released.
  it('clears the tenant when the transaction completes', async () => {
    await db.withWorkspace(contextFor(WORKSPACE_A), () => Promise.resolve(undefined))

    const after = await db.withWorkspace(contextFor(WORKSPACE_B), async (tx) => {
      const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
      return rows[0]?.value
    })

    expect(after).toBe(WORKSPACE_B)
  })

  it('clears the tenant when the transaction throws', async () => {
    await expect(
      db.withWorkspace(contextFor(WORKSPACE_A), () =>
        Promise.reject(new Error('deliberate failure')),
      ),
    ).rejects.toThrow('deliberate failure')

    const after = await db.withWorkspace(contextFor(WORKSPACE_B), async (tx) => {
      const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
      return rows[0]?.value
    })

    expect(after).toBe(WORKSPACE_B)
  })

  it('rolls back mutations when the callback throws', async () => {
    await expect(
      db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
        await tx.execute(sql`insert into rollback_probe (id) values (1)`)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const count = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(
        sql`select count(*)::int as count from rollback_probe`,
      )) as unknown as { count: number }[]
      return rows[0]?.count
    })

    expect(count).toBe(0)
  })

  it('passes the callback return value back to the caller', async () => {
    const result = await db.withWorkspace(contextFor(WORKSPACE_A), () => Promise.resolve('value'))
    expect(result).toBe('value')
  })
})

describe('the application database role', () => {
  // ADR-0015: migrations run as a role with DDL privilege, but the application
  // role used at runtime cannot create, drop, or alter tables. If this test
  // ever passes a `create table`, the deployment has granted the app role the
  // wrong privilege and a compromised request can alter the schema.
  it('cannot run DDL statements', async () => {
    const attempt = db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      await tx.execute(sql`create table forbidden_by_grant (id int)`)
    })

    // 42501 is Postgres `insufficient_privilege`.
    await expect(attempt).rejects.toMatchObject({
      cause: { code: '42501' },
    })
  })

  // The application role must be able to read and write data inside its
  // transactions, or it cannot do its job.
  it('can insert and select on granted tables', async () => {
    const count = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      await tx.execute(sql`insert into rollback_probe (id) values (42)`)
      const rows = (await tx.execute(
        sql`select count(*)::int as count from rollback_probe`,
      )) as unknown as { count: number }[]
      return rows[0]?.count
    })

    expect(count).toBe(1)
  })

  // ADR-0012 requires the application role to be unable to bypass RLS. If this
  // ever fails, every tenant isolation test in the suite is passing for the
  // wrong reason and the second layer is decorative.
  it('is not a superuser and cannot bypass row-level security', async () => {
    const row = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(
        sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
      )) as unknown as { rolsuper: boolean; rolbypassrls: boolean }[]
      return rows[0]
    })

    expect(row?.rolsuper).toBe(false)
    expect(row?.rolbypassrls).toBe(false)
  })

  it('connects as creatorhub_app', async () => {
    const user = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(sql`select current_user as name`)) as unknown as {
        name: string
      }[]
      return rows[0]?.name
    })

    expect(user).toBe('creatorhub_app')
  })
})
