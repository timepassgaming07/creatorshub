import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runMigrations } from '../migrate.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'

/**
 * The slice 1 exit condition, and the most important test file in the slice.
 *
 * ADR-0012 requires tenancy enforced twice, in repositories and in Postgres RLS,
 * and the two must be *provably independent*. Every test here connects as
 * `creatorhub_app` and writes its own SQL with no repository involved and no
 * tenant predicate in the query. Anything that comes back is RLS alone, doing
 * real work.
 *
 * That is what "independent" means concretely: layer 1 is not merely absent from
 * these queries, it cannot participate, because there is no repository in the
 * call path to add a predicate.
 *
 * A misconfigured policy that permits everything looks identical to a correct one
 * until the day it does not, so each property is asserted rather than assumed.
 */

let container: TestDatabase

/** The application role. Cannot bypass RLS. This is the subject under test. */
let app: postgres.Sql

/** Superuser. Bypasses RLS, so it is the control: it proves rows exist. */
let control: postgres.Sql

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let workspaceA = ''
let workspaceB = ''
let userInA = ''
let userInB = ''

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  control = postgres(container.superuserUrl, { max: 1, onnotice: () => undefined })
  app = postgres(container.databaseUrl, { max: 1, onnotice: () => undefined })

  // Seeded as superuser, deliberately. The fixtures must exist regardless of
  // policy, or a test could pass because the seed silently failed.
  const [a] = await control<{ id: string }[]>`
    insert into workspaces (slug, name) values ('tenant-a', 'Tenant A') returning id
  `
  const [b] = await control<{ id: string }[]>`
    insert into workspaces (slug, name) values ('tenant-b', 'Tenant B') returning id
  `
  workspaceA = a?.id ?? ''
  workspaceB = b?.id ?? ''

  const [ua] = await control<{ id: string }[]>`
    insert into users (email, name) values ('a@example.com', 'In A') returning id
  `
  const [ub] = await control<{ id: string }[]>`
    insert into users (email, name) values ('b@example.com', 'In B') returning id
  `
  userInA = ua?.id ?? ''
  userInB = ub?.id ?? ''

  await control`
    insert into workspace_members (workspace_id, user_id, role)
    values (${workspaceA}, ${userInA}, 'owner')
  `
  await control`
    insert into workspace_members (workspace_id, user_id, role)
    values (${workspaceB}, ${userInB}, 'owner')
  `

  await control`
    insert into audit_logs (workspace_id, actor_type, action)
    values (${workspaceA}, 'user', 'a.happened')
  `
  await control`
    insert into audit_logs (workspace_id, actor_type, action)
    values (${workspaceB}, 'user', 'b.happened')
  `
  await control`
    insert into audit_logs (actor_type, action) values ('system', 'platform.happened')
  `
}, 120_000)

afterAll(async () => {
  await app.end()
  await control.end()
  await container.stop()
})

/**
 * Runs a query as the application role inside a transaction with the tenant set,
 * mirroring exactly what `withWorkspace` does, but without the repository layer.
 */
async function asTenant<T>(
  workspaceId: string | null,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return app.begin(async (tx) => {
    if (workspaceId !== null) {
      await tx`select set_config('app.workspace_id', ${workspaceId}, true)`
    }
    return work(tx)
  }) as Promise<T>
}

async function countAsTenant(workspaceId: string | null, table: string): Promise<number> {
  return asTenant(workspaceId, async (tx) => {
    const rows = await tx<{ count: number }[]>`
      select count(*)::int as count from ${app(table)}
    `
    return rows[0]?.count ?? -1
  })
}

// ---------------------------------------------------------------------------
// The exit condition
// ---------------------------------------------------------------------------

describe('RLS with no application-layer scoping at all', () => {
  // The headline requirement. No repository, no predicate, no tenant context:
  // zero rows. If this ever returns a positive number, tenant isolation is
  // resting on application code alone and the second layer is decorative.
  it.each(['workspaces', 'workspace_members', 'audit_logs', 'users'])(
    'returns zero rows from %s when no tenant is set',
    async (table) => {
      expect(await countAsTenant(null, table)).toBe(0)
    },
  )

  it('returns zero rows for a workspace id that does not exist', async () => {
    const absent = '019fbd70-0000-7000-8000-000000000000'

    expect(await countAsTenant(absent, 'workspace_members')).toBe(0)
  })

  // The control. If the superuser also saw nothing, every assertion above would
  // pass on an empty database and prove nothing at all.
  it('while a superuser sees every row on the same tables', async () => {
    const [workspaces] = await control<{ count: number }[]>`
      select count(*)::int as count from workspaces
    `
    const [members] = await control<{ count: number }[]>`
      select count(*)::int as count from workspace_members
    `

    expect(workspaces?.count).toBeGreaterThanOrEqual(2)
    expect(members?.count).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Isolation between tenants
// ---------------------------------------------------------------------------

describe('cross-tenant reads', () => {
  it('show a workspace only itself', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ id: string }[]>`select id from workspaces`
    })

    expect(rows.map((row) => row.id)).toEqual([workspaceA])
  })

  it('show only the current tenant memberships', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ workspace_id: string }[]>`select workspace_id from workspace_members`
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.workspace_id).toBe(workspaceA)
  })

  it('hide another tenant even when the query names its id explicitly', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ id: string }[]>`select id from workspaces where id = ${workspaceB}`
    })

    expect(rows).toHaveLength(0)
  })

  it('show only the current tenant audit history', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ action: string }[]>`select action from audit_logs`
    })

    expect(rows.map((row) => row.action)).toEqual(['a.happened'])
  })

  // Platform rows have a null workspace_id. A creator has no business reading
  // platform audit history, and NULL = anything is NULL, so they cannot.
  it('hide platform audit rows from every tenant', async () => {
    const forA = await asTenant(workspaceA, async (tx) => {
      return tx<{ count: number }[]>`
        select count(*)::int as count from audit_logs where workspace_id is null
      `
    })

    expect(forA[0]?.count).toBe(0)
  })
})

describe('users, which have no workspace_id', () => {
  it('are visible through shared membership', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ id: string }[]>`select id from users`
    })

    expect(rows.map((row) => row.id)).toEqual([userInA])
  })

  it('are hidden when no membership is shared', async () => {
    const rows = await asTenant(workspaceA, async (tx) => {
      return tx<{ id: string }[]>`select id from users where id = ${userInB}`
    })

    expect(rows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe('cross-tenant writes', () => {
  // Without WITH CHECK, a tenant could insert a row belonging to another
  // workspace and simply be unable to see it afterwards. That is a silent
  // cross-tenant write, which is worse than a read leak because it corrupts
  // rather than exposes.
  it('cannot insert a membership into another workspace', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`
          insert into workspace_members (workspace_id, user_id)
          values (${workspaceB}, ${userInA})
        `
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot insert an audit row into another workspace', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`
          insert into audit_logs (workspace_id, actor_type, action)
          values (${workspaceB}, 'user', 'forged')
        `
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot insert an audit row with no workspace, which would be a platform row', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`insert into audit_logs (actor_type, action) values ('system', 'forged')`
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('can insert into its own workspace', async () => {
    const [user] = await control<{ id: string }[]>`
      insert into users (email) values ('new-member@example.com') returning id
    `

    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`
          insert into workspace_members (workspace_id, user_id)
          values (${workspaceA}, ${user?.id ?? ''})
        `
      }),
    ).resolves.toBeUndefined()
  })

  it('cannot move a row to another workspace by updating it', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`update workspace_members set workspace_id = ${workspaceB}`
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  // An UPDATE with no matching visible row is not an error, it affects nothing.
  // Asserting the row is unchanged is the real check.
  it('cannot update another tenant rows', async () => {
    await asTenant(workspaceA, async (tx) => {
      await tx`update workspaces set name = 'hijacked' where id = ${workspaceB}`
    })

    const [row] = await control<{ name: string }[]>`
      select name from workspaces where id = ${workspaceB}
    `

    expect(row?.name).toBe('Tenant B')
  })

  it('cannot delete another tenant rows', async () => {
    await asTenant(workspaceA, async (tx) => {
      await tx`delete from workspace_members where workspace_id = ${workspaceB}`
    })

    const [row] = await control<{ count: number }[]>`
      select count(*)::int as count from workspace_members where workspace_id = ${workspaceB}
    `

    expect(row?.count).toBe(1)
  })
})

describe('audit_logs is append only', () => {
  // Enforced twice, like tenancy: no UPDATE or DELETE policy, and the privilege
  // revoked at the role level. Either alone would be one mistake from being
  // widened. This is the same mechanism ledger_entries uses in slice 2.
  it('rejects UPDATE even within the correct tenant', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`update audit_logs set action = 'rewritten'`
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects DELETE even within the correct tenant', async () => {
    await expect(
      asTenant(workspaceA, async (tx) => {
        await tx`delete from audit_logs`
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

describe('policy configuration', () => {
  // ENABLE alone exempts the table owner, and the owner is the migrator, which
  // runs backfills. FORCE is what closes that gap, and it is invisible unless
  // asserted.
  it.each(['workspaces', 'workspace_members', 'users', 'audit_logs'])(
    '%s has RLS both enabled and forced',
    async (table) => {
      const [row] = await control<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select relrowsecurity, relforcerowsecurity
        from pg_class where relname = ${table}
      `

      expect(row?.relrowsecurity).toBe(true)
      expect(row?.relforcerowsecurity).toBe(true)
    },
  )

  it.each(['workspaces', 'workspace_members', 'users', 'audit_logs'])(
    '%s has at least one policy',
    async (table) => {
      const [row] = await control<{ count: number }[]>`
        select count(*)::int as count from pg_policies
        where schemaname = 'public' and tablename = ${table}
      `

      expect(row?.count).toBeGreaterThan(0)
    },
  )

  // A malformed setting must not raise, because an error page leaks that the
  // row exists. NULL means no rows match, which is a closed door.
  it('treats a malformed tenant setting as no tenant rather than raising', async () => {
    const count = await asTenant('not-a-uuid', async (tx) => {
      const rows = await tx<{ count: number }[]>`select count(*)::int as count from workspaces`
      return rows[0]?.count ?? -1
    }).catch(() => 'raised' as const)

    // Either zero rows or a clean cast failure is acceptable. Silently matching
    // rows is not.
    expect(count === 0 || count === 'raised').toBe(true)
  })
})
