-- Slice 4 item 4.7: Storefront telemetry events schema, indexes, and tenant isolation policies.
-- See docs/product/implementation-plan.md §Slice 4.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE storefront_event_type AS ENUM ('page_view', 'product_view', 'checkout_started');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Storefront Events Table
-- ---------------------------------------------------------------------------

CREATE TABLE storefront_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  event_type storefront_event_type NOT NULL,
  visitor_session_id text,
  referrer text,
  user_agent text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX storefront_events_workspace_id_idx ON storefront_events (workspace_id);--> statement-breakpoint
CREATE INDEX storefront_events_storefront_id_idx ON storefront_events (storefront_id);--> statement-breakpoint
CREATE INDEX storefront_events_product_id_idx ON storefront_events (product_id);--> statement-breakpoint
CREATE INDEX storefront_events_type_created_idx ON storefront_events (event_type, created_at);--> statement-breakpoint
CREATE INDEX storefront_events_workspace_created_idx ON storefront_events (workspace_id, created_at);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security & Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE storefront_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE storefront_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY storefront_events_tenant_select ON storefront_events
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY storefront_events_tenant_insert ON storefront_events
  FOR INSERT TO creatorhub_app
  WITH CHECK (true);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON storefront_events FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT ON storefront_events TO creatorhub_app;
