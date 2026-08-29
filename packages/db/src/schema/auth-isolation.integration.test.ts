import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runMigrations } from '../migrate.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'

/**
 * Proves the role separation from ADR-0017, in both directions.
 *
 * The ADR claims two things, and a claim in a document protects nothing. Each is
 * asserted here against a real database:
 *
 *   1. `creatorhub_auth` reaches the authentication tables and no business
 *      table. A compromised sign-in path cannot enumerate workspaces.
 *
 *   2. `creatorhub_app` cannot reach the authentication tables at all. Feature
 *      code cannot read a password hash or a session token, with or without a
 *      tenant set.
 *
 * The second is the one that would rot quietly. ADR-0015 grants the app role
 * access to every table the migrator creates, so these tables arrive already
 * readable and the migration has to take that away. Delete the REVOKE and
 * nothing else in the suite notices.
 *
 * 42501 is insufficient_privilege throughout. A permission error and an empty
 * result are very different outcomes: the first means the grant is absent, the
 * second could mean the table is simply empty. These tests require the error.
 */

let container: TestDatabase
let app: postgres.Sql
let auth: postgres.Sql
let control: postgres.Sql

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let userId = ''

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  control = postgres(container.superuserUrl, { max: 1, onnotice: () => undefined })
  app = postgres(container.databaseUrl, { max: 1, onnotice: () => undefined })
  auth = postgres(container.authUrl, { max: 1, onnotice: () => undefined })

  // Seeded as superuser so the rows exist regardless of policy. A test that
  // passes because the seed silently failed proves nothing.
  const [user] = await control<{ id: string }[]>`
    insert into users (email, name) values ('auth-probe@example.com', 'Probe') returning id
  `
  userId = user?.id ?? ''

  await control`
    insert into accounts (user_id, account_id, provider_id, password)
    values (${userId}, ${userId}, 'credential', '$argon2id$fake$hash')
  `
  await control`
    insert into sessions (user_id, token, expires_at)
    values (${userId}, 'probe-token', now() + interval '30 days')
  `
  await control`
    insert into workspaces (slug, name) values ('auth-probe-ws', 'Probe Workspace')
  `
}, 120_000)

afterAll(async () => {
  await app.end()
  await auth.end()
  await control.end()
  await container.stop()
})

// ---------------------------------------------------------------------------
// The auth role reaches authentication and nothing else
// ---------------------------------------------------------------------------

describe('creatorhub_auth', () => {
  it('connects as itself', async () => {
    const [row] = await auth<{ name: string }[]>`select current_user as name`

    expect(row?.name).toBe('creatorhub_auth')
  })

  it('is not a superuser and cannot bypass row level security', async () => {
    const [row] = await auth<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = current_user
    `

    expect(row?.rolsuper).toBe(false)
    expect(row?.rolbypassrls).toBe(false)
  })

  // Sign-in is exactly this query: find a user by email with no tenant context.
  // Migration 0001's policies deny it to the app role, correctly, which is the
  // whole reason this role exists.
  it('can find a user by email with no tenant context, which is what sign-in is', async () => {
    const rows = await auth<{ id: string }[]>`
      select id from users where email = 'auth-probe@example.com'
    `

    expect(rows).toHaveLength(1)
  })

  it('can read the credential row, which is what password verification needs', async () => {
    const rows = await auth<{ password: string | null }[]>`
      select password from accounts where user_id = ${userId}
    `

    expect(rows[0]?.password).toContain('argon2id')
  })

  it('can read and write sessions, which is what sign-in and sign-out need', async () => {
    await auth`
      insert into sessions (user_id, token, expires_at)
      values (${userId}, 'second-token', now() + interval '30 days')
    `

    const rows = await auth<{ count: number }[]>`
      select count(*)::int as count from sessions where user_id = ${userId}
    `

    expect(rows[0]?.count).toBe(2)
  })

  // The property that bounds a compromise. No grant on workspace_members means
  // an attacker holding the auth credentials cannot enumerate tenants or
  // memberships. Every business table added in a later slice inherits this,
  // because the init script sets default privileges for creatorhub_app only.
  it.each(['workspaces', 'workspace_members', 'audit_logs'])(
    'cannot read the business table %s',
    async (table) => {
      await expect(auth`select count(*) from ${auth(table)}`).rejects.toMatchObject({
        code: '42501',
      })
    },
  )

  it('cannot write to a business table', async () => {
    await expect(
      auth`insert into workspaces (slug, name) values ('forged', 'Forged')`,
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot run DDL', async () => {
    await expect(auth`create table should_not_exist (id int)`).rejects.toMatchObject({
      code: '42501',
    })
  })

  // Account deletion is an audited flow with retention obligations, not
  // something the sign-in path can trigger. The grant is SELECT, INSERT, UPDATE
  // and deliberately not DELETE.
  it('cannot delete a user', async () => {
    await expect(auth`delete from users where id = ${userId}`).rejects.toMatchObject({
      code: '42501',
    })
  })
})

// ---------------------------------------------------------------------------
// The application role cannot reach authentication
// ---------------------------------------------------------------------------

describe('creatorhub_app', () => {
  // The direction that would rot silently. Default privileges grant the app role
  // every migrator-created table, so migration 0003 and 0007 revoke them. Remove
  // the REVOKE and only this test fails.
  it.each(['sessions', 'accounts', 'verification_tokens', 'passkeys'])(
    'cannot read the authentication table %s',
    async (table) => {
      await expect(app`select count(*) from ${app(table)}`).rejects.toMatchObject({
        code: '42501',
      })
    },
  )

  it('cannot read a password hash even when naming the column directly', async () => {
    await expect(app`select password from accounts`).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot read a session token, so it cannot impersonate a user', async () => {
    await expect(app`select token from sessions`).rejects.toMatchObject({ code: '42501' })
  })

  // Setting a tenant is what unlocks business tables. It must not unlock these,
  // because the control is the grant rather than the policy.
  it('cannot read authentication tables even with a tenant set', async () => {
    const [workspace] = await control<{ id: string }[]>`
      select id from workspaces where slug = 'auth-probe-ws'
    `

    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.workspace_id', ${workspace?.id ?? ''}, true)`
        return tx`select count(*) from sessions`
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot insert a session, so it cannot mint a credential', async () => {
    await expect(
      app`insert into sessions (user_id, token, expires_at) values (${userId}, 'forged', now())`,
    ).rejects.toMatchObject({ code: '42501' })
  })
})

// ---------------------------------------------------------------------------
// Policy configuration
// ---------------------------------------------------------------------------

describe('policy configuration', () => {
  // The tenancy check asserts this too, from the catalogue. Duplicated here
  // deliberately: this file is where someone reads to understand the auth
  // tables, and a reader should not have to trust another file for it.
  it.each(['sessions', 'accounts', 'verification_tokens', 'passkeys'])(
    '%s has row level security enabled and forced',
    async (table) => {
      const [row] = await control<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
        select relrowsecurity, relforcerowsecurity from pg_class where relname = ${table}
      `

      expect(row?.relrowsecurity).toBe(true)
      expect(row?.relforcerowsecurity).toBe(true)
    },
  )

  // A policy with no role clause applies to every role, which would hand these
  // rows to any role added later. Every policy on these tables names its role.
  it.each(['sessions', 'accounts', 'verification_tokens', 'passkeys'])(
    'every policy on %s names the role it applies to',
    async (table) => {
      const rows = await control<{ roles: string[] }[]>`
        select roles::text[] from pg_policies
        where schemaname = 'public' and tablename = ${table}
      `

      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.roles).not.toContain('public')
      }
    },
  )

  // Migration 0001's policies on users are scoped to the app role and derive
  // visibility from shared membership. Adding the auth role's policy must not
  // have widened them.
  it('leaves the application view of users unchanged', async () => {
    const [workspace] = await control<{ id: string }[]>`
      select id from workspaces where slug = 'auth-probe-ws'
    `

    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.workspace_id', ${workspace?.id ?? ''}, true)`
      return tx<{ count: number }[]>`select count(*)::int as count from users`
    })

    // The probe user is a member of no workspace, so a workspace with no members
    // sees no users at all.
    expect(rows[0]?.count).toBe(0)
  })
})
