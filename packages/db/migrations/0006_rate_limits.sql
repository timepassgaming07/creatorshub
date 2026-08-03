-- `rate_limits`, the counter table behind item 1.9.
--
-- Hand-written, because Better Auth's own migration generator is never run
-- (ADR-0005 rule 2), and the shape has to match what the library expects. The
-- library declares this model as `key` (unique), `count`, and `lastRequest`,
-- with `lastRequest` a bigint holding epoch milliseconds. Those three columns
-- are its contract; the rest is ours.
--
-- Two dimensions are limited, and only one of them lives here in the way the
-- library intends.
--
--   Per IP, per path. The library owns this entirely: it derives the key from
--   the address and the endpoint, and this table is where it counts. Nothing in
--   our code reads or writes these rows.
--
--   Per account. The library cannot do this, because it never sees which account
--   a failed sign-in was for; a rate limiter keyed on IP alone is defeated by
--   anyone with a handful of addresses, and it also punishes an office behind one
--   NAT for the actions of one person. `packages/auth` writes those rows itself,
--   using the same table with a namespaced key.
--
-- Sharing one table is deliberate. Two counter tables with the same shape and
-- different cleanup jobs is how one of them stops being pruned.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

CREATE TABLE rate_limits (
	-- The library's own primary key is `id`, and it generates one. Ours is
	-- uuidv7() like every other table, and `advanced.database.generateId: false`
	-- keeps the library from supplying its own (ADR-0015).
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,

	-- What is being counted. The library uses `${ip}:${path}`; our per-account
	-- limiter uses a namespaced key so the two cannot collide, and so a query can
	-- tell them apart. Unique, because a second row for the same key is a counter
	-- that has silently forked and stopped limiting.
	"key" text NOT NULL,

	"count" integer DEFAULT 0 NOT NULL,

	-- Epoch milliseconds, not a timestamp, because that is the type the library
	-- writes. Storing it as `timestamptz` would be better and would also mean the
	-- library's own queries no longer work.
	"last_request" bigint NOT NULL,

	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX "uq_rate_limits__key" ON rate_limits USING btree ("key");--> statement-breakpoint

-- The cleanup job deletes rows whose window has passed. Without this it is a
-- full scan over every key ever seen, which on the sign-in path is every address
-- that has ever tried.
CREATE INDEX "idx_rate_limits__last_request" ON rate_limits USING btree ("last_request");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

-- Reached only by `creatorhub_auth`, like the other authentication tables
-- (ADR-0017). Rate limiting happens before there is a session, so before any
-- workspace is known, which is exactly the situation that role exists for.
--
-- The application role is revoked rather than simply not granted, because
-- ADR-0015's default privileges granted it everything the migrator creates. This
-- is the same trap that made the audit log partitions writable in 0005.
REVOKE ALL ON rate_limits FROM creatorhub_app;--> statement-breakpoint

-- DELETE is included, unlike the audit tables, because the cleanup job is this
-- role's work and an expired counter is not history worth keeping.
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO creatorhub_auth;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Scoped TO creatorhub_auth explicitly, so a role added later inherits nothing.
-- The policy admits every row to that role for the same reason ADR-0017 gives
-- for `sessions`: the lookup is by key before any tenant is known, so no row
-- predicate exists that permits the operation and also restricts it. The control
-- is the grant above, which bounds what a compromise of that role reaches.
CREATE POLICY rate_limits_auth_role ON rate_limits
  FOR ALL
  TO creatorhub_auth
  USING (true)
  WITH CHECK (true);
