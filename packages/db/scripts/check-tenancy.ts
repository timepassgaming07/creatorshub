/**
 * CI entry point for the tenancy check (item 1.5).
 *
 * Starts a throwaway Postgres, applies every migration, inspects the resulting
 * catalogue, and exits non-zero on any violation.
 *
 * It runs against a migrated database rather than the Drizzle schema files
 * deliberately. Tables created by hand-written SQL, and the ones the auth library
 * creates in 1.6, never appear in `schema/index.ts`. A check that read TypeScript
 * would pass while an unprotected table sat in production.
 *
 * Usage: pnpm --filter @creatorhub/db check:tenancy
 */
import postgres from 'postgres'

import { runMigrations } from '../src/migrate.js'
import { AUTH_TABLES_WITHOUT_WORKSPACE } from '../src/schema/auth.js'
import { NON_TENANT_TABLES } from '../src/schema/identity.js'
import {
  findTenancyViolations,
  formatViolations,
  type CatalogueReader,
} from '../src/schema/tenancy-check.js'
import { startTestDatabase } from '../src/testing/harness.js'

/**
 * audit_logs is the single table allowed a nullable workspace_id, because
 * platform-level actions genuinely have no workspace. Its policy is still
 * asserted, so this exempts it from one rule rather than from tenancy.
 */
const NULLABLE_WORKSPACE_ALLOWED = {
  audit_logs:
    'Platform-level actions have no workspace, so workspace_id is nullable. The policy admits only the current tenant, so platform rows stay invisible to every tenant.',
} as const

async function main(): Promise<void> {
  const container = await startTestDatabase()
  const sql = postgres(container.superuserUrl, { max: 1, onnotice: () => undefined })

  try {
    await runMigrations({
      migrationUrl: container.migrationUrl,
      migrationsFolder: new URL('../migrations', import.meta.url).pathname,
    })

    // postgres's Sql type carries overloads for helpers and fragments that
    // CatalogueReader deliberately does not describe. Narrowing to the one call
    // shape the check uses is what keeps tenancy-check.ts free of a driver
    // dependency, so it stays unit-testable against a fake.
    const violations = await findTenancyViolations(sql as unknown as CatalogueReader, {
      exempt: {
        ...NON_TENANT_TABLES,
        ...AUTH_TABLES_WITHOUT_WORKSPACE,
        ...NULLABLE_WORKSPACE_ALLOWED,
      },
    })

    process.stdout.write(`${formatViolations(violations)}\n`)

    if (violations.length > 0) {
      process.exitCode = 1
    }
  } finally {
    await sql.end()
    await container.stop()
  }
}

await main()
