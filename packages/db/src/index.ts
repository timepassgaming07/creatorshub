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
