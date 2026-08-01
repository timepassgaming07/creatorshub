# ADR-0015 — Postgres runs in Docker Compose locally, Testcontainers in tests

**Status:** Accepted
**Date:** 2026-08-01

## Context

Slice 1 needs a database. ADR-0005 chose PostgreSQL and Drizzle, and ADR-0012 requires Row Level
Security enforced by a role that cannot bypass it. Neither says how Postgres runs on a contributor's
machine or in CI, and item 1.1 cannot be written without that answer: the migration runner needs a
connection string, and the RLS session mechanism needs a non-superuser role to prove anything.

`docs/engineering/testing.md` already commits integration tests to Testcontainers. That decision
stands, and this record explains how it fits with local development rather than replacing it.

Two things must be true whatever is chosen. The Postgres version and extension set used locally must
match the one used in tests, or a migration passes in one place and fails in the other. And the
application must connect as a role without `BYPASSRLS`, or every RLS test passes for the wrong
reason.

## Options considered

**Postgres installed on the host, via Homebrew or an installer.** Fastest connection, no daemon
required, and `psql` is on the path. Rejected as the primary answer: the version is whatever the
contributor's package manager last shipped, extensions drift per machine, and there is no way to
pin either from the repository. On a system with a financial ledger, "works on my machine" applied
to the database is the failure mode this project can least afford. It stays viable as a fallback for
anyone who cannot run Docker, because nothing in the setup depends on the container beyond the
connection string.

**Docker Compose only, shared by development and tests.** One mechanism, one version pin, and the
container is already warm so tests start immediately. Rejected: tests would share a mutable database
with development. A failed run leaves rows behind, the next run interprets them as its own, and the
failure becomes order-dependent. Worse, it would reverse the Testcontainers decision in
`testing.md` for a convenience gain.

**Testcontainers only, no Compose.** Correct isolation, and CI needs no extra service definition.
Rejected as the whole answer: it gives a contributor no database to develop against. Running
`pnpm dev` would have nothing to connect to, and there would be nowhere to inspect a schema with
`psql` after a migration.

**A managed cloud database per developer.** ADR-0014 already buys managed Postgres with branching
for preview environments. Rejected for local work: it puts a network round trip in every test,
requires credentials before a contributor can run `pnpm verify`, and costs money per head.

## Decision

**Docker Compose for local development. Testcontainers for integration tests. One pinned version
shared by both.**

The two answer different questions. A developer needs a durable database that survives a restart and
can be opened with `psql`. A test needs a disposable database that no other test can observe. Those
requirements conflict, and one mechanism serving both would compromise the second.

### The version pin is the shared part

`docker-compose.yml` pins `postgres:18.4-bookworm`. Testcontainers reads the same tag from
`packages/db/src/testing/postgres-image.ts`, which is the single place the version is written. A
version bump is one edit, and a mismatch between local and CI is not expressible.

Postgres 18 specifically, because `uuidv7()` is built in. `docs/architecture/data-model.md` requires
UUIDv7 primary keys, and on Postgres 17 or earlier that means an extension or generating them in
application code. Native support removes that choice.

### Two roles, because RLS depends on it

`docker/postgres/init/01-roles.sh` creates:

| Role | Privileges | Used by |
|---|---|---|
| `creatorhub_migrator` | Owns the schema, can `CREATE` and `ALTER` | The migration runner only |
| `creatorhub_app` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables it does not own. No `BYPASSRLS`, not a superuser | The application and every integration test |

This separation is what makes ADR-0012's second layer testable. A superuser silently ignores RLS
policies, so a suite connecting as `postgres` would pass whether the policies were correct, broken,
or absent. Connecting as `creatorhub_app` means the slice 1 exit condition, application scoping
disabled and still zero rows, tests something real.

The migrator being a separate role also means the application cannot alter its own schema at
runtime, which is the property that lets `UPDATE` and `DELETE` on `ledger_entries` be revoked at the
role level per ADR-0008.

### What CI does

The `verify` job is unchanged and needs no database. `pnpm test:unit` stays Docker-free, which is
why `packages/config/vitest/base.js` separates unit from integration by file location.

Integration tests get a new job that starts Docker and runs `pnpm test:integration`. Testcontainers
brings up its own container per run, so the job needs no `services:` block and no duplicated version
string. GitHub's `ubuntu-latest` runners ship a working Docker daemon, so this costs one job
definition and the image pull.

The job is added in slice 1 alongside the first integration test. Adding it now, with nothing to
run, would produce a green check that proves nothing.

### Extensions

`citext` is created at init time. The data model uses it for case-insensitive email and slug
uniqueness, and creating an extension requires privileges the application role does not have, so it
cannot be done in a migration run by `creatorhub_migrator`.

### Two details that cost time if not written down

**The volume mounts at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.** Postgres 18 changed
this so the image can use major-version-specific subdirectories, which is what lets
`pg_upgrade --link` work without crossing a mount boundary. Mounting the old path on 18 starts the
container, fails the healthcheck, and reports a data-directory error that never mentions the mount
as the cause. Every Postgres tutorial written before 18 has the old path.

**The init script is a shell script, not plain SQL.** The role passwords arrive as environment
variables, and psql's `:'name'` syntax reads psql variables rather than the environment. A `.sql`
file in `docker-entrypoint-initdb.d` cannot see them. `01-roles.sh` bridges the two with `--set`,
which also quotes the value as a literal so a password containing a quote cannot alter the
statement.

## Verified

Checked on 2026-08-01 against `postgres:18.4-bookworm`, rather than assumed:

| Property | Result |
|---|---|
| `pnpm db:up` reaches healthy | Container healthy, both roles created by the init script |
| Neither role is a superuser | `rolsuper = f`, `rolbypassrls = f` for both |
| `public` is owned by the migrator | Owner is `creatorhub_migrator` |
| The app role cannot run DDL | `CREATE TABLE` fails with permission denied for schema public |
| Default privileges reach the app role | It can read a migrator-created table without an explicit `GRANT` |
| RLS applies to the app role | No tenant context returns 0 rows; a forged tenant returns 0; the correct tenant returns only its own row |
| A superuser bypasses RLS | Sees every row on the same table, which is why the app role exists |
| `citext` and `uuidv7()` are available | Both present |

The last two lines are the point of the whole record. If the application connected as a superuser,
the RLS row would read the same as the superuser row and the isolation tests in slice 1 would pass
whether or not the policies worked.

## Consequences

**Good**

- One command, `pnpm db:up`, and a contributor has the same Postgres as CI, down to the patch.
- Integration tests cannot leak state into each other or into the development database.
- RLS is tested against a role that genuinely cannot bypass it, so the second isolation layer is
  verified rather than assumed.
- No cloud credentials are needed to run the full suite. A fresh clone reaches green offline once
  the image is pulled.

**Bad, and accepted**

- Docker is required for integration tests. Accepted: `testing.md` already required it, and unit
  tests remain Docker-free so the fast loop is unaffected.
- Testcontainers adds a few seconds per integration run for container startup. This is why
  `integrationConfig` sets a 60 second timeout, so a slow start reads as slow rather than as a
  failure.
- Two mechanisms means two places Docker is invoked. Bounded by the single shared version constant,
  which is the part that would actually hurt if it diverged.
- The compose database is long-lived, so a developer can accumulate junk data in it.
  `pnpm db:reset` drops the volume, and no test depends on that database, so resetting is never
  destructive to anything that matters.

## Revisit when

Container startup becomes a material share of integration test time, which would argue for a shared
template database and per-test schemas instead of per-run containers. Or Postgres 18 stops being the
target, in which case the version constant moves and this record's reasoning about `uuidv7()` should
be re-checked rather than assumed.
