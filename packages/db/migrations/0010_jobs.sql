-- Slice 2 item 2.7: Postgres-backed asynchronous jobs queue, worker loop, and dead-letter handling.
-- See docs/adr/0009-postgres-queue-and-outbox.md and docs/architecture/data-model.md §11.

-- ---------------------------------------------------------------------------
-- Enums & Table
-- ---------------------------------------------------------------------------

CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead');--> statement-breakpoint

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  queue varchar(64) NOT NULL DEFAULT 'default',
  type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  locked_by varchar(128),
  last_error text,
  idempotency_key varchar(255),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- Partial index for hot-path polling and claiming of queued jobs
CREATE INDEX jobs_queued_idx ON jobs (queue, status, run_after) WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX jobs_workspace_created_idx ON jobs (workspace_id, created_at);--> statement-breakpoint
CREATE UNIQUE INDEX jobs_idempotency_key_idx ON jobs (idempotency_key) WHERE idempotency_key IS NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY jobs_tenant_isolation ON jobs
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY jobs_tenant_insert ON jobs
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY jobs_tenant_update ON jobs
  FOR UPDATE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON jobs FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO creatorhub_app;
