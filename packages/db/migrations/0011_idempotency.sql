-- Slice 2 item 2.8: Idempotency keys schema and enforcement middleware.
-- See docs/adr/0004-idempotency.md and docs/architecture/data-model.md §11.

-- ---------------------------------------------------------------------------
-- Table & Indexes
-- ---------------------------------------------------------------------------

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  scope varchar(128) NOT NULL,
  key varchar(255) NOT NULL,
  request_hash varchar(64) NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX idempotency_keys_scope_key_uq ON idempotency_keys (scope, key);--> statement-breakpoint
CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);--> statement-breakpoint
CREATE INDEX idempotency_keys_workspace_idx ON idempotency_keys (workspace_id, created_at);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY idempotency_keys_tenant_insert ON idempotency_keys
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY idempotency_keys_tenant_update ON idempotency_keys
  FOR UPDATE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY idempotency_keys_tenant_delete ON idempotency_keys
  FOR DELETE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON idempotency_keys FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO creatorhub_app;
