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
 * Tables allowed a nullable workspace_id because platform-level records
 * genuinely have no workspace. Policies are still asserted and enforced.
 */
const NULLABLE_WORKSPACE_ALLOWED = {
  audit_logs:
    'Platform-level actions have no workspace, so workspace_id is nullable. The policy admits only the current tenant, so platform rows stay invisible to every tenant.',
  ledger_accounts:
    'Platform-level, processor, and tax authority accounts have no workspace, so workspace_id is nullable. The policy isolates tenant-specific accounts to the current workspace.',
  ledger_transactions:
    'Platform-level transactions (e.g. system adjustments, processor fees) have no workspace, so workspace_id is nullable. Tenant transactions carry workspace_id.',
  ledger_entries:
    'Entries referencing platform-level accounts have no workspace, so workspace_id is nullable. Tenant entries carry workspace_id for reporting and RLS.',
  outbox:
    'Platform-level domain events have no workspace, so workspace_id is nullable. Scoped for tenant events.',
  jobs: 'Platform-level background jobs (e.g. partition maintenance) have no workspace, so workspace_id is nullable. Tenant jobs are scoped.',
  idempotency_keys:
    'Public checkout and platform endpoints have no workspace, so workspace_id is nullable. Authenticated tenant requests carry workspace_id.',
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
