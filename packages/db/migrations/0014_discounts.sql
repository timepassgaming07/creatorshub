-- Slice 3 item 3.6: Discounts and coupon codes schema.
-- See docs/product/implementation-plan.md §Slice 3.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Discounts Table
-- ---------------------------------------------------------------------------

CREATE TABLE discounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code varchar(50) NOT NULL,
  discount_type discount_type NOT NULL,
  discount_value bigint NOT NULL,
  currency varchar(3),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  min_order_amount bigint,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX discounts_workspace_code_uq ON discounts (workspace_id, code);--> statement-breakpoint
CREATE INDEX discounts_workspace_idx ON discounts (workspace_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Discount Products Table
-- ---------------------------------------------------------------------------

CREATE TABLE discount_products (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  discount_id uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX discount_products_uq ON discount_products (discount_id, product_id);--> statement-breakpoint
CREATE INDEX discount_products_workspace_idx ON discount_products (workspace_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security & Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE discounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY discounts_tenant_isolation ON discounts
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discounts_tenant_insert ON discounts
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discounts_tenant_update ON discounts
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discounts_tenant_delete ON discounts
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE discount_products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE discount_products FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY discount_products_tenant_isolation ON discount_products
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discount_products_tenant_insert ON discount_products
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discount_products_tenant_update ON discount_products
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY discount_products_tenant_delete ON discount_products
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON discounts, discount_products FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON discounts, discount_products TO creatorhub_app;
