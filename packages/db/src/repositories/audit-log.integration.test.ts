import { requestId, userId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import {
  AuditSaltMissingError,
  ensureAuditPartitions,
  hashIpAddress,
  listAuditLog,
  listAuditLogForTarget,
  writeAuditLog,
  type AuditOptions,
} from './audit-log.js'

/**
 * The audit log, against a partitioned table on a real Postgres.
 *
 * Three separate guarantees are asserted here, and each fails differently.
 *
 * **Partitioning works and is invisible to the caller.** A row written today
 * lands in this month's partition without anything in the write path naming one.
 * The failure this catches is a missing partition, which rejects the insert
 * outright: the log stops recording, which is the worst way for an audit log to
 * fail because nothing else notices.
 *
 * **Append-only is enforced by the database.** `creatorhub_app` has no UPDATE and
 * no DELETE, so rewriting history fails with 42501 rather than succeeding
 * quietly. Migration 0005 recreated this table, and grants do not survive a
 * rename and recreate, so this is exactly the assertion that catches a REVOKE
 * that was not reapplied.
 *
 * **Tenant isolation survived the recreate too.** The policies were dropped with
 * the old table and rewritten on the new one. The isolation suite covers the
 * repository methods; these cases cover the table.
 */

let container: TestDatabase
let db: Database
let control: postgres.Sql

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

/** 32 characters, which is the minimum the writer accepts. */
const SALT = 'test-salt-with-enough-characters'

const options: AuditOptions = { currentSalt: () => SALT }

/** Two tenants and a user in each. Ids are assigned in `beforeAll`. */
let workspaceA = ''
let workspaceB = ''
let userA = ''
let userB = ''

const REQUEST = requestId('audit-log-suite')

function contextFor(workspace: string, actor?: string) {
  return workspaceContext({
    workspaceId: workspaceId(workspace),
    requestId: REQUEST,
    ...(actor === undefined ? {} : { actorId: userId(actor) }),
  })
}

/**
 * Run work in a scope bound to one workspace.
 *
 * The same shape the isolation suite uses: `withWorkspace` supplies the
 * transaction, and the scope pairs it with the context. A repository cannot be
 * constructed outside this, which is what keeps the tenant setting and the
 * queries that rely on it in the same transaction.
 */
async function inScope<T>(
  workspace: string,
  work: (scope: RepositoryScope) => Promise<T>,
  actor?: string,
): Promise<T> {
  const context = contextFor(workspace, actor)

  return db.withWorkspace(context, (tx) => work({ tx, context }))
}

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '2',
    }),
  )

  control = postgres(container.superuserUrl, { max: 2, onnotice: () => undefined })

  const [a] = await control<{ id: string }[]>`
    insert into workspaces (slug, name) values ('audit-a', 'Workspace A') returning id
  `
  const [b] = await control<{ id: string }[]>`
    insert into workspaces (slug, name) values ('audit-b', 'Workspace B') returning id
  `
  workspaceA = a?.id ?? ''
  workspaceB = b?.id ?? ''

  const [ua] = await control<{ id: string }[]>`
    insert into users (email, name) values ('audit-a@example.com', 'A') returning id
  `
  const [ub] = await control<{ id: string }[]>`
    insert into users (email, name) values ('audit-b@example.com', 'B') returning id
  `
  userA = ua?.id ?? ''
  userB = ub?.id ?? ''

  await control`
    insert into workspace_members (workspace_id, user_id, role)
    values (${workspaceA}, ${userA}, 'owner'), (${workspaceB}, ${userB}, 'owner')
  `
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

describe('writing an entry', () => {
  it('records the action, the actor, and the workspace', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, {
        actorType: 'user',
        actorId: userId(userA),
        action: 'member.invited',
        targetType: 'user',
        targetId: userB,
      }),
    )

    expect(id).not.toBe('')

    const [row] = await control<
      { workspace_id: string; action: string; actor_id: string; request_id: string }[]
    >`
      select workspace_id, action, actor_id, request_id from audit_logs where id = ${id}
    `

    expect(row?.workspace_id).toBe(workspaceA)
    expect(row?.action).toBe('member.invited')
    expect(row?.actor_id).toBe(userA)

    // The request id comes from the context, not from the entry, which is what
    // makes every row written while serving one request correlatable.
    expect(row?.request_id).toBe(REQUEST)
  })

  it('stores metadata as given', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, {
        actorType: 'user',
        actorId: userId(userA),
        action: 'workspace.updated',
        metadata: { field: 'name', from: 'Old', to: 'New' },
      }),
    )

    const [row] = await control<{ metadata: Record<string, unknown> }[]>`
      select metadata from audit_logs where id = ${id}
    `

    expect(row?.metadata).toEqual({ field: 'name', from: 'Old', to: 'New' })
  })

  it('defaults metadata to an empty object rather than null', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'system', action: 'partition.created' }),
    )

    const [row] = await control<{ metadata: Record<string, unknown> }[]>`
      select metadata from audit_logs where id = ${id}
    `

    expect(row?.metadata).toEqual({})
  })

  // A system action has no person to name, which is why actor_id is nullable and
  // is not a foreign key.
  it('accepts a system actor with no actor id', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'system', action: 'commission.vested' }),
    )

    const [row] = await control<{ actor_id: string | null; actor_type: string }[]>`
      select actor_id, actor_type from audit_logs where id = ${id}
    `

    expect(row?.actor_type).toBe('system')
    expect(row?.actor_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The IP address
// ---------------------------------------------------------------------------

describe('the IP address', () => {
  it('is hashed, so the raw value never reaches the database', async () => {
    const address = '203.0.113.42'

    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, {
        actorType: 'user',
        actorId: userId(userA),
        action: 'session.created',
        ipAddress: address,
      }),
    )

    const [row] = await control<{ ip_hash: string | null }[]>`
      select ip_hash from audit_logs where id = ${id}
    `

    expect(row?.ip_hash).not.toBeNull()
    expect(row?.ip_hash).not.toContain(address)
    expect(row?.ip_hash).toBe(hashIpAddress(address, SALT))
  })

  // Refusing is the right answer. Falling back to an unsalted hash would be
  // reversible by anyone willing to hash four billion addresses.
  it('refuses to write when the salt is missing', async () => {
    await expect(
      inScope(workspaceA, (scope) =>
        writeAuditLog(
          scope,
          { currentSalt: () => undefined },
          { actorType: 'user', action: 'session.created', ipAddress: '203.0.113.42' },
        ),
      ),
    ).rejects.toThrow(AuditSaltMissingError)
  })

  it('refuses a salt too short to be worth having', async () => {
    await expect(
      inScope(workspaceA, (scope) =>
        writeAuditLog(
          scope,
          { currentSalt: () => 'short' },
          { actorType: 'user', action: 'session.created', ipAddress: '203.0.113.42' },
        ),
      ),
    ).rejects.toThrow(AuditSaltMissingError)
  })

  // The privacy property that makes rotation worth doing: after a rotation, the
  // same address no longer matches its earlier rows, so correlation is bounded to
  // one salt period.
  it('produces a different hash under a different salt', () => {
    const address = '203.0.113.42'

    expect(hashIpAddress(address, 'a'.repeat(32))).not.toBe(hashIpAddress(address, 'b'.repeat(32)))
  })

  it('produces the same hash for the same address and salt', () => {
    expect(hashIpAddress('203.0.113.42', SALT)).toBe(hashIpAddress('203.0.113.42', SALT))
  })
})

// ---------------------------------------------------------------------------
// Append-only
// ---------------------------------------------------------------------------

describe('append-only', () => {
  // The assertion that catches migration 0005 having recreated the table without
  // reapplying the REVOKE. Grants do not survive a rename and recreate, and
  // nothing else in the suite would notice.
  it('rejects an UPDATE from the application role', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'order.refunded' }),
    )

    const app = postgres(container.databaseUrl, { max: 1, onnotice: () => undefined })

    try {
      await expect(
        app`update audit_logs set action = 'order.not_refunded' where id = ${id}`,
      ).rejects.toMatchObject({ code: '42501' })
    } finally {
      await app.end()
    }
  })

  it('rejects a DELETE from the application role', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'order.refunded' }),
    )

    const app = postgres(container.databaseUrl, { max: 1, onnotice: () => undefined })

    try {
      await expect(app`delete from audit_logs where id = ${id}`).rejects.toMatchObject({
        code: '42501',
      })
    } finally {
      await app.end()
    }
  })

  // Both layers, not just one. The privilege is the control; the absent policy
  // means the two agree rather than one quietly permitting what the other blocks.
  it.each(['UPDATE', 'DELETE'])('has no %s policy either', async (command) => {
    const rows = await control<{ cmd: string }[]>`
      select cmd from pg_policies where tablename = 'audit_logs' and cmd = ${command}
    `

    expect(rows).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Partitioning
// ---------------------------------------------------------------------------

describe('partitioning', () => {
  it('is a partitioned table, by range', async () => {
    const [row] = await control<{ partstrat: string }[]>`
      select partstrat from pg_partitioned_table where partrelid = 'audit_logs'::regclass
    `

    // 'r' is range. Hash or list would both be wrong: hash destroys the time
    // ordering that makes dropping an old month cheap, and list needs a finite
    // set of values, which months are not.
    expect(row?.partstrat).toBe('r')
  })

  it('partitions on occurred_at', async () => {
    // `partattrs` is an int2vector, which is zero-indexed when subscripted from
    // SQL. `pg_get_partkeydef` is the readable answer and does not depend on
    // knowing that.
    const [row] = await control<{ definition: string }[]>`
      select pg_get_partkeydef('audit_logs'::regclass) as definition
    `

    expect(row?.definition).toBe('RANGE (occurred_at)')
  })

  // The primary key includes the partition key because Postgres requires it, not
  // because two rows may share an id.
  it('has a composite primary key including the partition key', async () => {
    const rows = await control<{ column_name: string }[]>`
      select a.attname as column_name
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = 'audit_logs'::regclass and c.contype = 'p'
      order by a.attname
    `

    expect(rows.map((row) => row.column_name)).toEqual(['id', 'occurred_at'])
  })

  // A migration on a fresh database has to leave a working write path, which
  // means partitions for the months writes will actually land in.
  it('created partitions covering the current month', async () => {
    const rows = await control<{ count: number }[]>`
      select count(*)::int as count from pg_inherits where inhparent = 'audit_logs'::regclass
    `

    // Last month, this month, and three ahead.
    expect(rows[0]?.count).toBeGreaterThanOrEqual(5)
  })

  it('routes a row written now into the current month', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'routing.check' }),
    )

    const [row] = await control<{ partition: string }[]>`
      select tableoid::regclass::text as partition from audit_logs where id = ${id}
    `

    // The partition is named for the month, so this asserts routing rather than
    // merely that the row exists.
    const expected = `audit_logs_${new Date().toISOString().slice(0, 7).replace('-', '_')}`
    expect(row?.partition).toBe(expected)
  })

  // Idempotent, so a scheduled job that runs twice or resumes after failing does
  // no harm and needs no state of its own.
  it('can be asked for partitions twice without failing', async () => {
    await inScope(workspaceA, (scope) => ensureAuditPartitions(scope, 1))
    await inScope(workspaceA, (scope) => ensureAuditPartitions(scope, 1))

    const rows = await control<{ count: number }[]>`
      select count(*)::int as count from pg_inherits where inhparent = 'audit_logs'::regclass
    `

    expect(rows[0]?.count).toBeGreaterThanOrEqual(5)
  })

  // Privileges do not propagate from parent to partition, so each one is granted
  // by the function. A partition created later must not arrive with more
  // privilege than the parent, and must not arrive with less either.
  it('grants the application select and insert on every partition, and no more', async () => {
    const rows = await control<{ relname: string; privilege_type: string }[]>`
      select c.relname, p.privilege_type
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join information_schema.table_privileges p
        on p.table_name = c.relname and p.grantee = 'creatorhub_app'
      where i.inhparent = 'audit_logs'::regclass
    `

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(['SELECT', 'INSERT']).toContain(row.privilege_type)
    }
  })

  it('enables and forces row level security on every partition', async () => {
    const rows = await control<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_inherits i join pg_class c on c.oid = i.inhrelid
      where i.inhparent = 'audit_logs'::regclass
    `

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true)
      expect(row.relforcerowsecurity).toBe(true)
    }
  })

  it('gives every partition its own tenant policies', async () => {
    const rows = await control<{ tablename: string; count: number }[]>`
      select p.tablename, count(*)::int as count
      from pg_inherits i
      join pg_class c on c.oid = i.inhrelid
      join pg_policies p on p.tablename = c.relname
      where i.inhparent = 'audit_logs'::regclass
      group by p.tablename
    `

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.count).toBe(2)
    }
  })
})

// ---------------------------------------------------------------------------
// Naming a partition directly
//
// The bypass this whole section exists for. A partition is a table, and a
// statement can name it: Postgres checks the parent's privileges and policies
// for a query written against the parent, and the partition's own for one
// written against the partition.
//
// The append-only tests above pass with the partitions wide open, because they
// go through the parent. These were written after `UPDATE audit_logs_2026_08`
// succeeded while `UPDATE audit_logs` was refused, which made audit history
// editable and deletable by the application role.
// ---------------------------------------------------------------------------

describe('a partition named directly', () => {
  const partitionName = `audit_logs_${new Date().toISOString().slice(0, 7).replace('-', '_')}`

  async function withAppConnection<T>(work: (sql: postgres.Sql) => Promise<T>): Promise<T> {
    const app = postgres(container.databaseUrl, { max: 1, onnotice: () => undefined })

    try {
      return await work(app)
    } finally {
      await app.end()
    }
  }

  it('rejects an UPDATE, not just through the parent', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'direct.update' }),
    )

    await withAppConnection(async (app) => {
      await expect(
        app`update ${app(partitionName)} set action = 'tampered' where id = ${id}`,
      ).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('rejects a DELETE, not just through the parent', async () => {
    const id = await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'direct.delete' }),
    )

    await withAppConnection(async (app) => {
      await expect(app`delete from ${app(partitionName)} where id = ${id}`).rejects.toMatchObject({
        code: '42501',
      })
    })
  })

  // With RLS off on the partition, this returns every tenant's history at once.
  // The tenant setting is transaction-local and unset here, so a correctly
  // configured partition returns nothing.
  it('shows no rows when no tenant is set', async () => {
    await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'direct.select' }),
    )

    await withAppConnection(async (app) => {
      const rows = await app<{ count: string }[]>`
        select count(*) as count from ${app(partitionName)}
      `

      expect(Number(rows[0]?.count)).toBe(0)
    })
  })

  // The same read, with a tenant set, must not return the other tenant's rows.
  it('shows only the current tenant when one is set', async () => {
    await inScope(workspaceB, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'direct.foreign' }),
    )

    await withAppConnection(async (app) => {
      const rows = await app.begin(async (tx) => {
        await tx`select set_config('app.workspace_id', ${workspaceA}, true)`
        return tx<{ count: string }[]>`
          select count(*) as count from ${app(partitionName)} where action = 'direct.foreign'
        `
      })

      expect(Number(rows[0]?.count)).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Tenant isolation, at the table
// ---------------------------------------------------------------------------

describe('tenant isolation', () => {
  it('reads only the current workspace', async () => {
    await inScope(workspaceA, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'isolation.a' }),
    )
    await inScope(workspaceB, (scope) =>
      writeAuditLog(scope, options, { actorType: 'user', action: 'isolation.b' }),
    )

    const fromA = await inScope(workspaceA, (scope) =>
      listAuditLog(scope, { action: 'isolation.b' }),
    )

    expect(fromA).toHaveLength(0)

    const own = await inScope(workspaceA, (scope) => listAuditLog(scope, { action: 'isolation.a' }))

    // Non-empty, or the assertion above is vacuous.
    expect(own.length).toBeGreaterThan(0)
  })

  // The target is one only workspace B ever writes about. Using `userB` would not
  // work: workspace A legitimately logged `member.invited` against it earlier in
  // this file, so A seeing an entry for that target is correct and the assertion
  // would be testing the wrong thing.
  it('reads a target only within the current workspace', async () => {
    const target = '019fc800-0000-7000-8000-00000000000b'

    await inScope(workspaceB, (scope) =>
      writeAuditLog(scope, options, {
        actorType: 'user',
        actorId: userId(userB),
        action: 'member.removed',
        targetType: 'user',
        targetId: target,
      }),
    )

    const fromA = await inScope(workspaceA, (scope) => listAuditLogForTarget(scope, 'user', target))

    expect(fromA).toHaveLength(0)

    // Non-empty from B, or the assertion above passes for the wrong reason.
    const fromB = await inScope(workspaceB, (scope) => listAuditLogForTarget(scope, 'user', target))

    expect(fromB.length).toBeGreaterThan(0)
  })

  it('returns entries newest first', async () => {
    const action = 'ordering.check'

    for (const index of [1, 2, 3]) {
      await inScope(workspaceA, (scope) =>
        writeAuditLog(scope, options, {
          actorType: 'user',
          action,
          metadata: { index },
        }),
      )
    }

    const rows = await inScope(workspaceA, (scope) => listAuditLog(scope, { action }))

    expect(rows).toHaveLength(3)
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]?.occurredAt.getTime() ?? 0
      const current = rows[index]?.occurredAt.getTime() ?? 0

      expect(previous).toBeGreaterThanOrEqual(current)
    }
  })

  // The table grows without limit by design, so an unbounded read is a timeout
  // rather than an answer.
  it('caps how much one read returns', async () => {
    const rows = await inScope(workspaceA, (scope) => listAuditLog(scope, { limit: 2 }))

    expect(rows.length).toBeLessThanOrEqual(2)
  })
})
