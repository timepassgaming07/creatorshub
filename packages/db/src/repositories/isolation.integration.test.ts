import { readdirSync } from 'node:fs'

import { requestId, userId, workspaceId, workspaceContext } from '@creatorhub/contracts'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDatabase, type Database } from '../client.js'
import { loadDatabaseConfig } from '../config.js'
import { runMigrations } from '../migrate.js'
import type { RepositoryScope } from '../repository.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'
import {
  ISOLATION_EXEMPT,
  READ_CASES,
  REPOSITORY_MODULES,
  WRITE_CASES,
  type IsolationFixtures,
} from './registry.js'

/**
 * The tenant isolation suite (item 1.12).
 *
 * `testing.md` requires that every repository is driven against two workspaces
 * and proved to return nothing for the wrong one, and that a new repository joins
 * by registration so **forgetting is a test failure rather than an omission**.
 *
 * This exercises layer 1, the repository predicate, through the real repository
 * functions. The RLS suite exercises layer 2 with no repository in the call path.
 * Together they are the evidence that the two layers are independent: this file
 * would still pass with RLS disabled, and that one would still pass with every
 * repository predicate removed.
 */

let container: TestDatabase
let db: Database
let control: postgres.Sql

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

let workspaceA = ''
let workspaceB = ''
let empty = ''
let fixtures: IsolationFixtures

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  control = postgres(container.superuserUrl, { max: 1, onnotice: () => undefined })
  db = createDatabase(
    loadDatabaseConfig({
      DATABASE_URL: container.databaseUrl,
      DATABASE_MIGRATION_URL: container.migrationUrl,
      DATABASE_POOL_MAX: '2',
    }),
  )

  const rows = await control<{ id: string; slug: string }[]>`
    insert into workspaces (slug, name)
    values ('iso-a', 'A'), ('iso-b', 'B'), ('iso-empty', 'Empty')
    returning id, slug
  `
  workspaceA = rows.find((row) => row.slug === 'iso-a')?.id ?? ''
  workspaceB = rows.find((row) => row.slug === 'iso-b')?.id ?? ''
  empty = rows.find((row) => row.slug === 'iso-empty')?.id ?? ''

  const users = await control<{ id: string; email: string }[]>`
    insert into users (email)
    values ('iso-own@example.com'), ('iso-foreign@example.com')
    returning id, email
  `
  const own = users.find((row) => row.email === 'iso-own@example.com')?.id ?? ''
  const foreign = users.find((row) => row.email === 'iso-foreign@example.com')?.id ?? ''

  await control`
    insert into workspace_members (workspace_id, user_id, role)
    values (${workspaceA}, ${own}, 'owner'), (${workspaceB}, ${foreign}, 'owner')
  `

  // One audit entry per workspace, each targeting that workspace's own user.
  //
  // Without these the audit read cases return nothing for either tenant, which
  // makes "returns nothing for another workspace" pass for the wrong reason. The
  // suite caught exactly that when the audit repository was registered, which is
  // what the `readOwn` half of every case is for.
  await control`
    insert into audit_logs (workspace_id, actor_type, actor_id, action, target_type, target_id)
    values
      (${workspaceA}, 'user', ${own}, 'isolation.seeded', 'user', ${own}),
      (${workspaceB}, 'user', ${foreign}, 'isolation.seeded', 'user', ${foreign})
  `

  fixtures = { ownUserId: userId(own), foreignUserId: userId(foreign) }
}, 120_000)

afterAll(async () => {
  await db.close()
  await control.end()
  await container.stop()
})

const REQUEST = requestId('isolation-suite')

function contextFor(id: string) {
  return workspaceContext({ workspaceId: workspaceId(id), requestId: REQUEST })
}

async function inScope<T>(id: string, work: (scope: RepositoryScope) => Promise<T>): Promise<T> {
  const context = contextFor(id)
  return db.withWorkspace(context, (tx) => work({ tx, context }))
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

describe.each(READ_CASES)('$name', (readCase) => {
  it('returns nothing for another workspace', async () => {
    const result = await inScope(empty, (scope) => readCase.readForeign(scope, fixtures))

    // Repositories return either a list or an optional single row. Both are
    // acceptable; anything present is a leak.
    if (Array.isArray(result)) {
      expect(result).toHaveLength(0)
    } else {
      expect(result).toBeUndefined()
    }
  })

  // Without this, the assertion above passes on a repository that is simply
  // broken and returns nothing for everyone.
  it('returns something for its own workspace', async () => {
    const result = await inScope(workspaceA, (scope) => readCase.readOwn(scope, fixtures))

    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThan(0)
    } else {
      expect(result).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

describe.each(WRITE_CASES)('$name', (writeCase) => {
  it('changes nothing in another workspace', async () => {
    const before = await control<{ role: string }[]>`
      select role from workspace_members where workspace_id = ${workspaceB}
    `

    // Either outcome is correct: the predicate matches no rows, or RLS rejects
    // the statement. What matters is that the other tenant's row is untouched.
    await inScope(workspaceA, (scope) => writeCase.writeForeign(scope, fixtures)).catch(
      () => undefined,
    )

    const after = await control<{ role: string }[]>`
      select role from workspace_members where workspace_id = ${workspaceB}
    `

    expect(after).toEqual(before)
  })

  it('reports that nothing matched rather than claiming success', async () => {
    const result = await inScope(workspaceA, (scope) =>
      writeCase.writeForeign(scope, fixtures),
    ).catch(() => false)

    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Completeness
//
// The part that makes the registry more than documentation.
// ---------------------------------------------------------------------------

describe('registry completeness', () => {
  const registered = new Set([...READ_CASES.map((c) => c.name), ...WRITE_CASES.map((c) => c.name)])

  const exportedNames = Object.entries(REPOSITORY_MODULES).flatMap(([moduleName, module]) =>
    Object.entries(module)
      .filter(([, value]) => typeof value === 'function')
      .map(([exportName]) => `${moduleName}.${exportName}`),
  )

  // A new repository method that nobody registered fails here. That is the
  // mechanism testing.md asks for: omission is a failure, not a silence.
  it.each(exportedNames)('%s is covered by the isolation suite or explicitly exempt', (name) => {
    const covered = registered.has(name) || name in ISOLATION_EXEMPT

    expect(
      covered,
      `${name} is not in READ_CASES or WRITE_CASES. Add it to the registry, or add it to ` +
        'ISOLATION_EXEMPT with the reason it cannot be driven with a foreign tenant id.',
    ).toBe(true)
  })

  // And a new repository *file* that nobody added to REPOSITORY_MODULES would
  // make the check above vacuous, so the file list is checked too.
  it('names every repository module', () => {
    const directory = new URL('.', import.meta.url).pathname

    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .filter((name) => !name.includes('.test.'))
      .filter((name) => name !== 'registry.ts' && name !== 'index.ts')
      .map((name) => name.replace(/\.ts$/, ''))

    expect(Object.keys(REPOSITORY_MODULES).sort()).toEqual(files.sort())
  })

  it('exempts nothing without a stated reason', () => {
    for (const [name, reason] of Object.entries(ISOLATION_EXEMPT)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20)
    }
  })
})
