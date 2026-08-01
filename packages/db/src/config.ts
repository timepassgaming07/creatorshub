/**
 * Database configuration, validated at import.
 *
 * Responsibilities: turn environment variables into a checked, typed shape, and
 * fail loudly at boot if one is missing or malformed.
 * Dependencies: zod. No database calls.
 *
 * `security.md` requires a missing secret to fail at startup rather than at
 * first query. A connection string discovered to be absent during a checkout is
 * an outage; discovered at boot it is a failed deploy, which is the cheaper of
 * the two.
 *
 * There are two connection strings and they are not interchangeable. See
 * ADR-0015: the application role cannot bypass row-level security, the migration
 * role owns the schema. Pointing the application at the migration role would
 * make every RLS policy inert.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Postgres accepts both spellings and so do we, but nothing else. A URL that
 * silently defaults to some other protocol is a connection to something we did
 * not intend.
 */
const POSTGRES_URL = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'Expected a postgres:// or postgresql:// URL.',
  )

const configSchema = z.object({
  /**
   * The application connects as this role. It must not be a superuser and must
   * not hold BYPASSRLS, or tenant isolation degrades to a single layer while
   * still appearing to work.
   */
  databaseUrl: POSTGRES_URL,

  /** Migrations only. Owns the schema, holds DDL privilege. */
  databaseMigrationUrl: POSTGRES_URL,

  /**
   * Serverless functions each hold their own pool, so this is per instance
   * rather than per deployment. Ten is small on purpose: Postgres connections
   * are not free, and running out of them is a harder outage to diagnose than a
   * queue for one.
   */
  poolMax: z.coerce.number().int().positive().max(100).default(10),

  /** Seconds a connection may sit unused before it is returned. */
  idleTimeout: z.coerce.number().int().nonnegative().default(30),

  /** Seconds to wait for a connection before giving up and reporting it. */
  connectTimeout: z.coerce.number().int().positive().default(10),
})

export type DatabaseConfig = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseConfigError'
  }
}

/**
 * Read and validate configuration from an environment.
 *
 * Takes the environment as a parameter rather than reading the global directly,
 * so a test can supply one without mutating process state and leaking into
 * whatever runs next.
 *
 * The error names the missing variables and says what to do. It deliberately
 * does not echo the values back: a malformed connection string usually contains
 * a password, and an error message is the least controlled place it can land.
 */
export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const result = configSchema.safeParse({
    databaseUrl: env['DATABASE_URL'],
    databaseMigrationUrl: env['DATABASE_MIGRATION_URL'],
    poolMax: env['DATABASE_POOL_MAX'],
    idleTimeout: env['DATABASE_IDLE_TIMEOUT'],
    connectTimeout: env['DATABASE_CONNECT_TIMEOUT'],
  })

  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter((path) => path.length > 0)
      .sort()

    throw new DatabaseConfigError(
      `Database configuration is invalid: ${[...new Set(fields)].join(', ')}. ` +
        'Copy .env.example to .env and set DATABASE_URL and DATABASE_MIGRATION_URL. ' +
        'See docs/adr/0015-local-postgres.md.',
    )
  }

  return result.data
}
