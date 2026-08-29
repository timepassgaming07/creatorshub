/**
 * @creatorhub/db — schema, migrations, and tenant-scoped repositories.
 *
 * Responsibilities: define every table, run migrations, and expose the *only*
 * route feature code has to the database.
 *
 * The central constraint (ADR-0012): feature code cannot obtain an unscoped
 * database client from this package. Access goes through a repository bound to a
 * workspace, and Postgres row-level security enforces the same rule
 * independently underneath. Two layers, deliberately redundant, because a leak
 * then requires two failures at once.
 *
 * What is deliberately absent from this file is the point of it. There is no
 * export of the `postgres` client, the Drizzle instance, or any function that
 * returns either. The `exports` map in package.json makes deep imports
 * unresolvable, so the omission cannot be worked around from outside.
 * `index.test.ts` fails if a driver handle ever appears here.
 *
 * The test harness is not exported either. It starts containers, and nothing in
 * a production bundle should be able to reach it.
 */
export { DatabaseConfigError, loadDatabaseConfig } from './config.js'
export type { DatabaseConfig } from './config.js'

export { createDatabase } from './client.js'
export type { Database, TenantTransaction } from './client.js'

export { MigrationError, runMigrations } from './migrate.js'
export type { MigrationResult } from './migrate.js'

export { CrossTenantWriteError, assertSameWorkspace, insertValues, scoped } from './repository.js'
export type { RepositoryScope, TenantTable } from './repository.js'

export * as workspaceMembers from './repositories/workspace-members.js'
export * as workspaces from './repositories/workspaces.js'
export type { WorkspaceRecord, WorkspaceStatus } from './repositories/workspaces.js'

/**
 * The audit log (item 1.10). Append-only and partitioned monthly, both enforced
 * by Postgres rather than by this module.
 */
export * as auditLog from './repositories/audit-log.js'

export { AuditSaltMissingError } from './repositories/audit-log.js'
export type {
  AuditActorType,
  AuditEntry,
  AuditOptions,
  AuditRecord,
} from './repositories/audit-log.js'

/**
 * Double-entry ledger repository (item 2.4).
 */
export * as ledger from './repositories/ledger.js'
export type { PostTransactionResult } from './repositories/ledger.js'
