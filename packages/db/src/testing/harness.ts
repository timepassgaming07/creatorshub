/**
 * Integration test harness.
 *
 * Responsibilities: start a throwaway Postgres with the same roles and the same
 * version production uses, and hand back both connection strings.
 * Dependencies: @testcontainers/postgresql. Test-only, never imported by
 * application code.
 *
 * The container runs `docker/postgres/init/01-roles.sh`, the identical script
 * the local compose database runs. Reimplementing the role setup here would
 * create a second definition that drifts from the first, and the drift would
 * surface as an RLS test passing in one place and failing in the other. One
 * script, both paths.
 *
 * Per ADR-0015 this is deliberately not the compose database. Tests get their
 * own container so a failed run cannot leave rows behind for the next one, and
 * so `pnpm db:reset` is never destructive to anything that matters.
 */
import { resolve } from 'node:path'

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { POSTGRES_IMAGE } from './postgres-image.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATABASE_NAME = 'creatorhub_test'
const SUPERUSER = 'postgres'
const SUPERUSER_PASSWORD = 'postgres'

/** Local-only, and the container is destroyed at the end of the run. */
const ROLE_PASSWORD = 'creatorhub_test'

const INIT_SCRIPT = resolve(process.cwd(), '../../docker/postgres/init/01-roles.sh')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TestDatabase = {
  /** Connects as `creatorhub_app`. Cannot bypass RLS. */
  readonly databaseUrl: string

  /** Connects as `creatorhub_migrator`. Owns the schema. */
  readonly migrationUrl: string

  /**
   * Connects as the superuser.
   *
   * Exists so a test can prove RLS is doing real work: a superuser bypasses
   * policies, so a query that returns rows here and none through `databaseUrl`
   * is evidence the policy is enforced rather than the table being empty.
   * Application code has no equivalent.
   */
  readonly superuserUrl: string

  readonly stop: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function connectionUrl(
  container: StartedPostgreSqlContainer,
  user: string,
  password: string,
): string {
  return `postgres://${user}:${password}@${container.getHost()}:${String(
    container.getMappedPort(5432),
  )}/${DATABASE_NAME}`
}

/**
 * Start a Postgres container with both application roles created.
 *
 * Slow by design: pulling and booting a real database is the cost of testing
 * against real RLS rather than a mock that always agrees with us.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE)
    .withDatabase(DATABASE_NAME)
    .withUsername(SUPERUSER)
    .withPassword(SUPERUSER_PASSWORD)
    .withEnvironment({
      CREATORHUB_APP_PASSWORD: ROLE_PASSWORD,
      CREATORHUB_MIGRATOR_PASSWORD: ROLE_PASSWORD,
    })
    .withCopyFilesToContainer([
      {
        source: INIT_SCRIPT,
        target: '/docker-entrypoint-initdb.d/01-roles.sh',
        // Executable, so the Postgres entrypoint runs it as a subprocess rather
        // than sourcing it. `set -euo pipefail` in a sourced script would apply
        // to the entrypoint shell itself.
        mode: 0o755,
      },
    ])
    .start()

  return {
    databaseUrl: connectionUrl(container, 'creatorhub_app', ROLE_PASSWORD),
    migrationUrl: connectionUrl(container, 'creatorhub_migrator', ROLE_PASSWORD),
    superuserUrl: connectionUrl(container, SUPERUSER, SUPERUSER_PASSWORD),
    stop: async () => {
      await container.stop()
    },
  }
}
