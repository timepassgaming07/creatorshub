-- Migration: 0021_customers_and_orders_management
-- Description: Customers schema, customer lifecycle metrics, and order linkage (Slice 7 §7.1).

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  email citext NOT NULL,
  name text,
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_spend bigint NOT NULL DEFAULT 0,
  orders_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT customers_workspace_email_unique UNIQUE (workspace_id, email)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_customers_workspace_id ON customers (workspace_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customers_workspace_last_seen ON customers (workspace_id, last_seen_at DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customers_workspace_total_spend ON customers (workspace_id, total_spend DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_customers_workspace_email ON customers (workspace_id, email);--> statement-breakpoint

-- Enable and force Row Level Security on customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE customers FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY customers_tenant_isolation ON customers
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY customers_tenant_insert ON customers
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY customers_tenant_update ON customers
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY customers_tenant_delete ON customers
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- Grant privileges to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO creatorhub_app;
