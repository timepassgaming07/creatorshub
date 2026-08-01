/**
 * The Postgres image integration tests run against.
 *
 * Compose cannot import TypeScript, so this tag necessarily appears twice: here
 * and in docker-compose.yml. postgres-image.test.ts reads the compose file and
 * fails if the two disagree, which is what keeps "one version" true in practice
 * rather than only in the ADR.
 *
 * Postgres 18 for native uuidv7(). The data model requires UUIDv7 primary keys,
 * and on 17 or earlier that means an extension or generating them in
 * application code. See docs/adr/0015-local-postgres.md.
 */
export const POSTGRES_IMAGE = 'postgres:18.4-bookworm'
