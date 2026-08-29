-- Slice 3 item 3.1: Products, product variants, assets, and product assets schema.
-- See docs/product/implementation-plan.md §Slice 3.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE product_status AS ENUM ('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE product_visibility AS ENUM ('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE variant_inventory_policy AS ENUM ('unlimited', 'tracked');--> statement-breakpoint
CREATE TYPE asset_scan_status AS ENUM ('pending', 'clean', 'infected', 'skipped');--> statement-breakpoint
CREATE TYPE product_asset_role AS ENUM ('cover_image', 'thumbnail', 'gallery', 'deliverable', 'preview');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Products Table
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  slug varchar(255) NOT NULL,
  description text,
  status product_status NOT NULL DEFAULT 'draft',
  currency varchar(3) NOT NULL,
  base_price bigint NOT NULL DEFAULT 0,
  compare_at_price bigint,
  visibility product_visibility NOT NULL DEFAULT 'public',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX products_workspace_slug_uq ON products (workspace_id, slug);--> statement-breakpoint
CREATE INDEX products_workspace_status_idx ON products (workspace_id, status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Product Variants Table
-- ---------------------------------------------------------------------------

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  sku varchar(100),
  price_override bigint,
  position integer NOT NULL DEFAULT 0,
  inventory_policy variant_inventory_policy NOT NULL DEFAULT 'unlimited',
  inventory_quantity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX product_variants_product_position_idx ON product_variants (product_id, position);--> statement-breakpoint
CREATE INDEX product_variants_workspace_idx ON product_variants (workspace_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Assets Table
-- ---------------------------------------------------------------------------

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type varchar(255) NOT NULL,
  byte_size bigint NOT NULL,
  checksum_sha256 varchar(64),
  scan_status asset_scan_status NOT NULL DEFAULT 'pending',
  scan_reason text,
  scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX assets_storage_key_uq ON assets (storage_key);--> statement-breakpoint
CREATE INDEX assets_workspace_scan_idx ON assets (workspace_id, scan_status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Product Assets Table
-- ---------------------------------------------------------------------------

CREATE TABLE product_assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  role product_asset_role NOT NULL DEFAULT 'deliverable',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX product_assets_product_asset_role_uq ON product_assets (product_id, asset_id, role);--> statement-breakpoint
CREATE INDEX product_assets_workspace_idx ON product_assets (workspace_id);--> statement-breakpoint
CREATE INDEX product_assets_asset_idx ON product_assets (asset_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security & Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE products ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE products FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY products_tenant_isolation ON products
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY products_tenant_insert ON products
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY products_tenant_update ON products
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY products_tenant_delete ON products
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_variants FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY product_variants_tenant_isolation ON product_variants
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_variants_tenant_insert ON product_variants
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_variants_tenant_update ON product_variants
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_variants_tenant_delete ON product_variants
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE assets FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY assets_tenant_isolation ON assets
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY assets_tenant_insert ON assets
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY assets_tenant_update ON assets
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY assets_tenant_delete ON assets
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE product_assets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE product_assets FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY product_assets_tenant_isolation ON product_assets
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_assets_tenant_insert ON product_assets
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_assets_tenant_update ON product_assets
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY product_assets_tenant_delete ON product_assets
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON products, product_variants, assets, product_assets FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON products, product_variants, assets, product_assets TO creatorhub_app;
