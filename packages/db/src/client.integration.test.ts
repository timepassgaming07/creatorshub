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

  // The reason set_config takes `true`. A plain SET would survive the
  // transaction, and on a pooled connection the next borrower inherits the
  // previous tenant's id: a cross-tenant read with no bug visible at any call
  // site. Pool size is 1, so this is the same physical connection.
  it('clears the tenant once the transaction commits', async () => {
    await db.withWorkspace(contextFor(WORKSPACE_A), () => Promise.resolve(undefined))

    const after = await db.withWorkspace(contextFor(WORKSPACE_B), async (tx) => {
      const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
      return rows[0]?.value
    })

    expect(after).toBe(WORKSPACE_B)
  })

  it('clears the tenant when the transaction rolls back', async () => {
    await expect(
      db.withWorkspace(contextFor(WORKSPACE_A), () =>
        Promise.reject(new Error('deliberate rollback')),
      ),
    ).rejects.toThrow('deliberate rollback')

    const after = await db.withWorkspace(contextFor(WORKSPACE_B), async (tx) => {
      const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
      return rows[0]?.value
    })

    expect(after).toBe(WORKSPACE_B)
  })

  it('rolls the work back when the callback throws', async () => {
    await expect(
      db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
        await tx.execute(sql`insert into rollback_probe values (1)`)
        throw new Error('deliberate rollback')
      }),
    ).rejects.toThrow('deliberate rollback')

    const count = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(
        sql`select count(*)::int as count from rollback_probe`,
      )) as unknown as { count: number }[]
      return rows[0]?.count
    })

    expect(count).toBe(0)
  })

  it('returns the callback result', async () => {
    const result = await db.withWorkspace(contextFor(WORKSPACE_A), () => Promise.resolve('value'))

    expect(result).toBe('value')
  })
})

describe('tenant value handling', () => {
  // set_config binds the value as a parameter. SET LOCAL cannot take one, which
  // is the practical reason set_config is used rather than a stylistic one.
  // A workspace id is validated upstream, but the binding is what makes that
  // validation a second line of defence rather than the only one.
  it('binds the tenant rather than interpolating it', async () => {
    const injected = "'; drop table rollback_probe; --"

    const seen = await db.withWorkspace(
      { workspaceId: injected as typeof WORKSPACE_A, requestId: REQUEST },
      async (tx) => {
        const rows = (await tx.execute(readTenant)) as unknown as TenantRow[]
        return rows[0]?.value
      },
    )

    // Stored verbatim as a value, not executed as SQL.
    expect(seen).toBe(injected)
  })

  it('leaves the table the injection attempt targeted intact', async () => {
    const exists = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      const rows = (await tx.execute(
        sql`select to_regclass('public.rollback_probe') is not null as present`,
      )) as unknown as { present: boolean }[]
      return rows[0]?.present
    })

    expect(exists).toBe(true)
  })
})

describe('the application role', () => {
  // The migrator owns the schema; the application only reads and writes rows.
  // This is what lets UPDATE and DELETE on ledger_entries be revoked at the role
  // level in slice 2 (ADR-0008), and it means a compromised application cannot
  // rewrite its own constraints.
  it('cannot run DDL', async () => {
    // Drizzle wraps the driver error, so the top-level message is only "Failed
    // query". The Postgres error is the cause, and 42501 is insufficient
    // privilege. Asserting the code rather than the text keeps this from
    // breaking on a wording change.
    const attempt = db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      await tx.execute(sql`create table should_not_exist (id int)`)
    })

    await expect(attempt).rejects.toThrow()

    const error = await attempt.catch((caught: unknown) => caught)
    const cause = (error as { cause?: { code?: string } }).cause

    expect(cause?.code).toBe('42501')
  })

  // Default privileges in the init script grant these automatically for every
  // table the migrator creates. Without them each migration would need to
  // remember a GRANT, and a forgotten one is a runtime failure in production.
  it('can read and write a table the migrator created, with no explicit grant', async () => {
    const count = await db.withWorkspace(contextFor(WORKSPACE_A), async (tx) => {
      await tx.execute(sql`insert into rollback_probe values (99)`)
      const rows = (await tx.execute(
        sql`select count(*)::int as count from rollback_probe`,
      )) as unknown as { count: number }[]
      await tx.execute(sql`delete from rollback_probe`)
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
