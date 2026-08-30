-- Slice 5 item 5.7: Webhook Events Schema with signature verification and exactly-once processing.
-- See docs/product/implementation-plan.md §Slice 5 item 5.7.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE webhook_event_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- webhook_events table
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status webhook_event_status NOT NULL DEFAULT 'received',
  signature_verified boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (workspace_id, provider, provider_event_id)
);--> statement-breakpoint

CREATE INDEX idx_webhook_events_status ON webhook_events(workspace_id, status);--> statement-breakpoint
CREATE INDEX idx_webhook_events_event_type ON webhook_events(workspace_id, event_type);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY webhook_events_tenant_isolation ON webhook_events
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY webhook_events_tenant_insert ON webhook_events
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY webhook_events_tenant_update ON webhook_events
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY webhook_events_tenant_delete ON webhook_events
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON webhook_events FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_events TO creatorhub_app;
