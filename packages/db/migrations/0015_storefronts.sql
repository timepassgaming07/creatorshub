-- Slice 4 item 4.1: Storefront schema, custom domain & subdomain columns, and tenant isolation policies.
-- See docs/product/implementation-plan.md §Slice 4.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE storefront_status AS ENUM ('draft', 'published', 'suspended');--> statement-breakpoint
CREATE TYPE custom_domain_status AS ENUM ('pending', 'verified', 'failed');--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Storefronts Table
-- ---------------------------------------------------------------------------

CREATE TABLE storefronts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subdomain citext NOT NULL,
  custom_domain citext,
  custom_domain_status custom_domain_status NOT NULL DEFAULT 'pending',
  custom_domain_verification_token text,
  custom_domain_verified_at timestamptz,
  title text NOT NULL,
  tagline text,
  description text,
  theme_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status storefront_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX storefronts_workspace_id_unique ON storefronts (workspace_id);--> statement-breakpoint
CREATE UNIQUE INDEX storefronts_subdomain_unique ON storefronts (subdomain);--> statement-breakpoint
CREATE UNIQUE INDEX storefronts_custom_domain_unique ON storefronts (custom_domain);--> statement-breakpoint
CREATE INDEX storefronts_workspace_id_idx ON storefronts (workspace_id);--> statement-breakpoint
CREATE INDEX storefronts_status_idx ON storefronts (status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security & Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE storefronts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE storefronts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY storefronts_tenant_isolation ON storefronts
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY storefronts_tenant_insert ON storefronts
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY storefronts_tenant_update ON storefronts
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY storefronts_tenant_delete ON storefronts
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON storefronts FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON storefronts TO creatorhub_app;
