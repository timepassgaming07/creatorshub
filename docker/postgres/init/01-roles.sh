#!/bin/bash
# Create application roles. See docs/adr/0015-local-postgres.md.
#
# Runs once, when the data directory is first initialized. Editing this after
# `docker compose up` has run has no effect until `pnpm db:reset` drops the
# volume.
#
# This is a shell script rather than plain .sql because the passwords arrive as
# environment variables, and psql's :'name' syntax reads psql variables, not the
# environment. --set bridges the two, and :'name' quotes the value as a literal
# so a password containing a quote cannot alter the statement.

set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set db_name="$POSTGRES_DB" \
  --set app_password="$CREATORHUB_APP_PASSWORD" \
  --set migrator_password="$CREATORHUB_MIGRATOR_PASSWORD" <<'SQL'

-- creatorhub_migrator owns the schema and runs migrations.
-- creatorhub_app is what the application connects as and cannot bypass RLS.
-- The split is what makes ADR-0012's second isolation layer testable: a
-- superuser ignores RLS policies silently, so a suite connecting as one would
-- pass whether the policies were correct, broken, or absent.

CREATE ROLE creatorhub_migrator WITH LOGIN PASSWORD :'migrator_password';
CREATE ROLE creatorhub_app WITH LOGIN PASSWORD :'app_password' NOBYPASSRLS;

-- Postgres 15 and later do not grant CREATE on public to anyone by default.
-- Ownership is what gives the migrator its DDL privilege.
ALTER SCHEMA public OWNER TO creatorhub_migrator;

-- Owning public does not confer CREATE on the database, which the migrator needs
-- for one thing: drizzle keeps its migration journal in a `drizzle` schema and
-- creates it on first run. Without this the very first migration fails on
-- CREATE SCHEMA rather than on anything to do with the schema being migrated.
--
-- Granted on the database rather than pre-creating the schema here, because the
-- journal's shape belongs to the migration tool. Pre-creating it would mean this
-- file has an opinion about drizzle's internals that would silently rot.
GRANT CREATE ON DATABASE :"db_name" TO creatorhub_migrator;

GRANT USAGE ON SCHEMA public TO creatorhub_app;

-- Every table the migrator creates from here on grants data-plane access to the
-- application role automatically. Without this, each migration would have to
-- remember a GRANT, and a forgotten one is a production runtime error.
--
-- Grants are not the tenancy control and are not treated as one. RLS is
-- (ADR-0012). Where a table needs less than this, the migration revokes
-- explicitly, which is how ledger_entries loses UPDATE and DELETE (ADR-0008).
ALTER DEFAULT PRIVILEGES FOR ROLE creatorhub_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO creatorhub_app;

ALTER DEFAULT PRIVILEGES FOR ROLE creatorhub_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO creatorhub_app;

-- citext backs case-insensitive email and slug uniqueness in the data model.
-- Creating an extension needs privileges the migrator does not have, so it
-- cannot be deferred into a migration.
CREATE EXTENSION IF NOT EXISTS citext;

SQL
