/**
 * Test-only surface of @creatorhub/db.
 *
 * A separate entry point from the package root, so integration tests in other
 * packages can start a database without the root export carrying Testcontainers
 * into a production bundle. `packages/auth` is the first consumer: its tests
 * need the same container, the same migrations, and the same three roles.
 *
 * The migration runner is re-exported here rather than from the root for the
 * same reason it is used: a test applies migrations to a throwaway database, and
 * nothing in a request path ever should.
 */
export { startTestDatabase } from './harness.js'
export type { TestDatabase } from './harness.js'

export { POSTGRES_IMAGE } from './postgres-image.js'

export { runMigrations } from '../migrate.js'
