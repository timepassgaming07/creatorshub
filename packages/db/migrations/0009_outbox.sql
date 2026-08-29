-- Slice 2 item 2.6: Transactional outbox pattern for atomic event publication.
-- See docs/adr/0009-postgres-queue-and-outbox.md and docs/architecture/data-model.md §11.

-- ---------------------------------------------------------------------------
-- outbox table
-- ---------------------------------------------------------------------------

CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  aggregate_type varchar(64) NOT NULL,
  aggregate_id varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);--> statement-breakpoint

-- Partial index for hot-path polling of unpublished events
CREATE INDEX outbox_unpublished_idx ON outbox (occurred_at) WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX outbox_workspace_occurred_idx ON outbox (workspace_id, occurred_at);--> statement-breakpoint
CREATE INDEX outbox_aggregate_idx ON outbox (aggregate_type, aggregate_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY outbox_tenant_isolation ON outbox
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY outbox_tenant_insert ON outbox
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY outbox_tenant_update ON outbox
  FOR UPDATE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON outbox FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON outbox TO creatorhub_app;
