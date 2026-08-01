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
 * Contents arrive in slice 1 (users, workspaces, members, audit log, RLS,
 * the repository base) and grow per the implementation plan. This file is
 * intentionally near-empty until then rather than pre-built against a schema
 * that does not exist.
 */

export {}
