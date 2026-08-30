-- Slice 6: Digital Fulfilment & Asset Delivery Schema (Entitlements, Download Grants, Download Events)
-- See docs/product/implementation-plan.md §Slice 6.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE entitlement_status AS ENUM (
  'active',
  'revoked',
  'suspended'
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- entitlements table
-- Durable proof of purchase, independent of the order
-- ---------------------------------------------------------------------------

CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  customer_email text NOT NULL,
  status entitlement_status NOT NULL DEFAULT 'active',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX idx_entitlements_order ON entitlements(workspace_id, order_id);--> statement-breakpoint
CREATE INDEX idx_entitlements_email ON entitlements(workspace_id, customer_email);--> statement-breakpoint
CREATE INDEX idx_entitlements_status ON entitlements(workspace_id, status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- download_grants table
-- Signed, expiring, use-capped download tokens. Tokens are stored hashed (SHA-256).
-- ---------------------------------------------------------------------------

CREATE TABLE download_grants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL REFERENCES entitlements(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  token_hash varchar(64) NOT NULL UNIQUE,
  max_downloads integer NOT NULL DEFAULT 5,
  download_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX idx_download_grants_entitlement ON download_grants(workspace_id, entitlement_id);--> statement-breakpoint
CREATE INDEX idx_download_grants_asset ON download_grants(workspace_id, asset_id);--> statement-breakpoint
CREATE INDEX idx_download_grants_token_hash ON download_grants(token_hash);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- download_events table
-- Tamper-evident download audit log tracking client IP hash and user agent
-- ---------------------------------------------------------------------------

CREATE TABLE download_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  download_grant_id uuid NOT NULL REFERENCES download_grants(id) ON DELETE CASCADE,
  ip_hash varchar(64),
  user_agent text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX idx_download_events_grant ON download_events(workspace_id, download_grant_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation for entitlements
-- ---------------------------------------------------------------------------

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY entitlements_tenant_isolation ON entitlements
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY entitlements_tenant_insert ON entitlements
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY entitlements_tenant_update ON entitlements
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY entitlements_tenant_delete ON entitlements
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation for download_grants
-- ---------------------------------------------------------------------------

ALTER TABLE download_grants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE download_grants FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY download_grants_tenant_isolation ON download_grants
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_grants_tenant_insert ON download_grants
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_grants_tenant_update ON download_grants
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_grants_tenant_delete ON download_grants
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation for download_events
-- ---------------------------------------------------------------------------

ALTER TABLE download_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE download_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY download_events_tenant_isolation ON download_events
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_events_tenant_insert ON download_events
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_events_tenant_update ON download_events
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY download_events_tenant_delete ON download_events
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint
