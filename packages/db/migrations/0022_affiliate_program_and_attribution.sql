-- Migration: 0022_affiliate_program_and_attribution
-- Description: Affiliate programs, promoter tracking, referral links, clicks, and order attributions (Slice 8 §8.1-§8.5).

CREATE TABLE IF NOT EXISTS affiliate_programs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT false,
  default_commission_bps integer NOT NULL DEFAULT 2000,
  cookie_window_days integer NOT NULL DEFAULT 30,
  allow_self_referral boolean NOT NULL DEFAULT false,
  auto_approve_affiliates boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT affiliate_programs_workspace_unique UNIQUE (workspace_id)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email citext NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending',
  custom_commission_bps integer,
  payout_account jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_earnings bigint NOT NULL DEFAULT 0,
  total_conversions integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT affiliates_workspace_email_unique UNIQUE (workspace_id, email)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS affiliate_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  code citext NOT NULL,
  destination_url text,
  clicks_count integer NOT NULL DEFAULT 0,
  conversions_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT affiliate_links_workspace_code_unique UNIQUE (workspace_id, code)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE RESTRICT,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  visitor_token text NOT NULL,
  ip_hash text NOT NULL,
  user_agent text,
  referer text,
  is_bot boolean NOT NULL DEFAULT false,
  clicked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS attributions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE RESTRICT,
  affiliate_click_id uuid REFERENCES affiliate_clicks(id) ON DELETE SET NULL,
  commission_bps integer NOT NULL,
  commission_amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL,
  rejection_reason text,
  attributed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT attributions_workspace_order_unique UNIQUE (workspace_id, order_id)
);--> statement-breakpoint

-- Indexes
CREATE INDEX IF NOT EXISTS idx_affiliate_programs_ws ON affiliate_programs (workspace_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_affiliates_ws_status ON affiliates (workspace_id, status);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_affiliates_ws_email ON affiliates (workspace_id, email);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_affiliate_links_ws_code ON affiliate_links (workspace_id, code);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_affiliate_links_ws_affiliate ON affiliate_links (workspace_id, affiliate_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_ws_link ON affiliate_clicks (workspace_id, affiliate_link_id, clicked_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_attributions_ws_order ON attributions (workspace_id, order_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_attributions_ws_affiliate ON attributions (workspace_id, affiliate_id, status);--> statement-breakpoint

-- Enable and force Row Level Security
ALTER TABLE affiliate_programs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE affiliate_programs FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE affiliates FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE affiliate_links FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE affiliate_clicks FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE attributions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE attributions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- RLS Policies: affiliate_programs
CREATE POLICY affiliate_programs_tenant_isolation ON affiliate_programs
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_programs_tenant_insert ON affiliate_programs
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_programs_tenant_update ON affiliate_programs
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_programs_tenant_delete ON affiliate_programs
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- RLS Policies: affiliates
CREATE POLICY affiliates_tenant_isolation ON affiliates
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliates_tenant_insert ON affiliates
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliates_tenant_update ON affiliates
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliates_tenant_delete ON affiliates
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- RLS Policies: affiliate_links
CREATE POLICY affiliate_links_tenant_isolation ON affiliate_links
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_links_tenant_insert ON affiliate_links
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_links_tenant_update ON affiliate_links
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_links_tenant_delete ON affiliate_links
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- RLS Policies: affiliate_clicks
CREATE POLICY affiliate_clicks_tenant_isolation ON affiliate_clicks
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_clicks_tenant_insert ON affiliate_clicks
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_clicks_tenant_update ON affiliate_clicks
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY affiliate_clicks_tenant_delete ON affiliate_clicks
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- RLS Policies: attributions
CREATE POLICY attributions_tenant_isolation ON attributions
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY attributions_tenant_insert ON attributions
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY attributions_tenant_update ON attributions
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY attributions_tenant_delete ON attributions
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- Grant privileges to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_programs TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliates TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_links TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_clicks TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON attributions TO creatorhub_app;
