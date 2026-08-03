-- `audit_logs`, partitioned monthly by `occurred_at`. See security.md.
--
-- Hand-written, because drizzle-kit emits neither partitioned tables nor the
-- function that creates partitions.
--
-- Why now, while the table is empty. Converting a populated append-only table
-- means copying every row under a lock, and the table this affects is the one
-- that answers a dispute or a regulator, so a botched copy is unrecoverable
-- evidence. Empty, the conversion is a rename and a DDL statement.
--
-- Postgres cannot add partitioning to an existing table, so the shape is:
-- rename the old one aside, create a partitioned parent with the same columns,
-- copy nothing (it is empty), and drop the old one. The rename rather than a
-- straight DROP is deliberate: if the table turns out not to be empty, the
-- INSERT ... SELECT below moves the rows, and dropping a table that still had
-- data would be the one mistake with no undo.

-- ---------------------------------------------------------------------------
-- Set the old table aside
-- ---------------------------------------------------------------------------

ALTER TABLE audit_logs RENAME TO audit_logs_unpartitioned;--> statement-breakpoint

-- Renaming a table renames neither its indexes nor its constraints, so every one
-- of them still holds its original name and would collide with the new table's.
-- The primary key is the one that bites: `audit_logs_pkey` is an index name, and
-- `CREATE TABLE ... PRIMARY KEY` fails with 42P07 rather than anything that
-- mentions the rename.
--
-- Policies are dropped rather than renamed, because the new table gets its own
-- and the old table is about to disappear.
DROP POLICY audit_logs_tenant_isolation ON audit_logs_unpartitioned;--> statement-breakpoint
DROP POLICY audit_logs_tenant_insert ON audit_logs_unpartitioned;--> statement-breakpoint
ALTER TABLE audit_logs_unpartitioned RENAME CONSTRAINT audit_logs_pkey TO audit_logs_old_pkey;--> statement-breakpoint
ALTER TABLE audit_logs_unpartitioned RENAME CONSTRAINT audit_logs_workspace_id_workspaces_id_fk TO audit_logs_old_workspace_fk;--> statement-breakpoint
ALTER INDEX idx_audit_logs__workspace_occurred RENAME TO idx_audit_logs_old__workspace_occurred;--> statement-breakpoint
ALTER INDEX idx_audit_logs__target RENAME TO idx_audit_logs_old__target;--> statement-breakpoint
ALTER INDEX idx_audit_logs__actor RENAME TO idx_audit_logs_old__actor;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The partitioned parent
-- ---------------------------------------------------------------------------

-- Column definitions are identical to migration 0000 apart from the primary key.
--
-- The primary key is `(id, occurred_at)` rather than `id`. Postgres requires
-- every unique constraint on a partitioned table to include the partition key,
-- because it enforces uniqueness per partition and cannot check across them
-- without a global index. `id` is still a UUIDv7 and still unique in practice;
-- the composite key is a storage-engine requirement, not a statement that two
-- rows may share an id.
CREATE TABLE audit_logs (
	"id" uuid DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT audit_logs_pkey PRIMARY KEY ("id", "occurred_at")
) PARTITION BY RANGE ("occurred_at");--> statement-breakpoint

-- ON DELETE restrict, same as before: audit history outlives the workspace it
-- describes. A workspace cannot be deleted while rows reference it, which is the
-- intended obstacle rather than an inconvenience.
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_workspace_id_workspaces_id_fk
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- Indexes on the parent propagate to every partition, existing and future.
CREATE INDEX idx_audit_logs__workspace_occurred ON audit_logs USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX idx_audit_logs__target ON audit_logs USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX idx_audit_logs__actor ON audit_logs USING btree ("actor_type","actor_id");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Creating partitions
-- ---------------------------------------------------------------------------

-- A month with no partition rejects every insert into it. That fails the write
-- path outright rather than degrading it, and the write path is the audit log, so
-- the failure would be "the thing that records what happened stopped recording".
-- Partitions are therefore created ahead of need, by this function, called both
-- by the migration below and by a scheduled job.
--
-- Idempotent: `IF NOT EXISTS` on the table, and the whole body is guarded by
-- whether the partition already existed, so calling it twice for the same month
-- does nothing the second time. The job needs no state of its own.
--
-- SECURITY DEFINER, unlike the trigger in 0004, and deliberately. Creating a
-- table requires privileges `creatorhub_app` does not have and must never have.
-- The function is owned by the migrator and runs as it. `search_path` is pinned
-- to defeat the standard attack on a DEFINER function, where a caller creates a
-- shadowing object in a schema earlier on the path.
CREATE FUNCTION create_audit_log_partition(month date) RETURNS void AS $$
DECLARE
  start_of_month date := date_trunc('month', month)::date;
  start_of_next  date := (date_trunc('month', month) + interval '1 month')::date;
  partition_name text := 'audit_logs_' || to_char(start_of_month, 'YYYY_MM');
BEGIN
  -- Nothing to do if it exists. Checked up front rather than relying on
  -- IF NOT EXISTS alone, because CREATE POLICY below has no such clause and
  -- would fail on the second call.
  IF to_regclass(format('public.%I', partition_name)) IS NOT NULL THEN
    RETURN;
  END IF;

  -- Bounds are inclusive of the lower and exclusive of the upper, which is what
  -- FOR VALUES FROM ... TO means. Adjacent months therefore meet exactly, with
  -- no gap a row could fall into and no overlap Postgres would reject.
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_of_month, start_of_next
  );

  -- Everything below is about one fact: **a partition is a table, and a
  -- statement can name it directly.** Postgres checks the parent's privileges
  -- and policies for a query written against the parent, and the partition's own
  -- for a query written against the partition. The parent being locked down
  -- therefore protects nothing on its own.
  --
  -- This was found by writing the obvious test, watching it pass, and then
  -- trying the statement the test did not: `UPDATE audit_logs_2026_08 ...`
  -- succeeded and changed a row while `UPDATE audit_logs ...` was correctly
  -- refused. Audit history was editable and deletable by the application role.
  --
  -- Two separate mistakes, and each alone is enough to lose the guarantee.

  -- First: ADR-0015 sets default privileges granting creatorhub_app everything on
  -- every table the migrator creates, and a partition is created by the migrator.
  -- So it arrives with UPDATE and DELETE already granted, and the parent's REVOKE
  -- does not reach it. Revoke first, then grant exactly what is allowed.
  EXECUTE format('REVOKE ALL ON %I FROM creatorhub_app', partition_name);
  EXECUTE format('GRANT SELECT, INSERT ON %I TO creatorhub_app', partition_name);

  -- Second: row level security is per table and is not inherited. A partition
  -- with RLS disabled is readable in full by anyone with SELECT on it, whatever
  -- the parent says, so every partition needs it enabled and forced.
  --
  -- The policies themselves do come from the parent: Postgres applies the
  -- parent's policies to a partition when the query goes through the parent, and
  -- the partition's own when it does not. So each partition gets its own copy of
  -- the same two.
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);

  EXECUTE format(
    'CREATE POLICY %I ON %I FOR SELECT TO creatorhub_app USING (workspace_id = app_current_workspace_id())',
    partition_name || '_tenant_isolation', partition_name
  );

  EXECUTE format(
    'CREATE POLICY %I ON %I FOR INSERT TO creatorhub_app WITH CHECK (workspace_id = app_current_workspace_id())',
    partition_name || '_tenant_insert', partition_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;--> statement-breakpoint

REVOKE ALL ON FUNCTION create_audit_log_partition(date) FROM PUBLIC;--> statement-breakpoint

-- The application may call it but not redefine it. This is what lets the write
-- path create a missing partition on demand rather than failing, without giving
-- the application role the ability to create tables generally.
GRANT EXECUTE ON FUNCTION create_audit_log_partition(date) TO creatorhub_app;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- The first partitions
-- ---------------------------------------------------------------------------

-- Last month, this month, and the next three. Last month because a migration run
-- shortly after a month boundary may still receive a row timestamped before it,
-- and the future ones so a fresh database accepts writes for a quarter without
-- the job having run once.
SELECT create_audit_log_partition((date_trunc('month', now()) - interval '1 month')::date);--> statement-breakpoint
SELECT create_audit_log_partition(now()::date);--> statement-breakpoint
SELECT create_audit_log_partition((date_trunc('month', now()) + interval '1 month')::date);--> statement-breakpoint
SELECT create_audit_log_partition((date_trunc('month', now()) + interval '2 months')::date);--> statement-breakpoint
SELECT create_audit_log_partition((date_trunc('month', now()) + interval '3 months')::date);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Move anything that was there, then drop the old table
-- ---------------------------------------------------------------------------

-- Expected to move zero rows. Written anyway, because "the table is empty" is an
-- assumption about every environment this migration will ever run in, and the
-- cost of being wrong is lost audit history.
INSERT INTO audit_logs (
  id, workspace_id, actor_type, actor_id, action, target_type, target_id,
  metadata, ip_hash, user_agent, request_id, occurred_at
)
SELECT
  id, workspace_id, actor_type, actor_id, action, target_type, target_id,
  metadata, ip_hash, user_agent, request_id, occurred_at
FROM audit_logs_unpartitioned;--> statement-breakpoint

DROP TABLE audit_logs_unpartitioned;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security, again
-- ---------------------------------------------------------------------------

-- Everything migration 0001 established for this table has to be re-established,
-- because none of it survived the rename and recreate. That is the trap in this
-- migration: the table has the same name and the same columns, and looks
-- finished, while being readable by every tenant and writable in place.
--
-- The tenancy check catches a missing policy. It does not catch a missing REVOKE,
-- which is why the append-only assertions in the integration suite matter.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Policies on the parent apply to every partition, so these are written once.
--
-- Identical to 0001: SELECT admits only the current tenant, so platform rows,
-- which carry a null workspace_id, are invisible to every tenant. A creator has
-- no business reading platform audit history.
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY audit_logs_tenant_insert ON audit_logs
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- The append-only guarantee, at the privilege level rather than the policy level.
--
-- A policy can be dropped by whoever owns the table; a missing privilege cannot
-- be worked around by the application at all. There is deliberately no UPDATE or
-- DELETE policy either, so both layers agree, and ADR-0008 uses the same
-- mechanism for `ledger_entries`.
REVOKE UPDATE, DELETE ON audit_logs FROM creatorhub_app;--> statement-breakpoint

-- Default privileges from ADR-0015 grant creatorhub_app every table the migrator
-- creates, which is why the REVOKE above is needed rather than merely tidy. The
-- explicit grant states what the application is allowed to do, so a reader does
-- not have to reason about defaults.
GRANT SELECT, INSERT ON audit_logs TO creatorhub_app;
