-- Slice 5 item 5.10: Refunds and Disputes Schema with tenant isolation and double-entry integration.
-- See docs/product/implementation-plan.md §Slice 5 item 5.10.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE refund_status AS ENUM (
  'pending',
  'succeeded',
  'failed'
);--> statement-breakpoint

CREATE TYPE dispute_status AS ENUM (
  'needs_response',
  'under_review',
  'won',
  'lost'
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- refunds table
-- ---------------------------------------------------------------------------

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider_refund_id text NOT NULL,
  amount bigint NOT NULL,
  currency varchar(3) NOT NULL,
  reason text,
  status refund_status NOT NULL DEFAULT 'pending',
  initiated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_refunds_provider_refund UNIQUE (workspace_id, provider_refund_id)
);--> statement-breakpoint

CREATE INDEX idx_refunds_order ON refunds(workspace_id, order_id);--> statement-breakpoint
CREATE INDEX idx_refunds_payment ON refunds(workspace_id, payment_id);--> statement-breakpoint
CREATE INDEX idx_refunds_status ON refunds(workspace_id, status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- disputes table
-- ---------------------------------------------------------------------------

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider_dispute_id text NOT NULL,
  amount bigint NOT NULL,
  currency varchar(3) NOT NULL,
  reason text,
  status dispute_status NOT NULL DEFAULT 'needs_response',
  fee_amount bigint NOT NULL DEFAULT 0,
  evidence_due_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_disputes_provider_dispute UNIQUE (workspace_id, provider_dispute_id)
);--> statement-breakpoint

CREATE INDEX idx_disputes_order ON disputes(workspace_id, order_id);--> statement-breakpoint
CREATE INDEX idx_disputes_payment ON disputes(workspace_id, payment_id);--> statement-breakpoint
CREATE INDEX idx_disputes_status ON disputes(workspace_id, status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation for refunds
-- ---------------------------------------------------------------------------

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY refunds_tenant_isolation ON refunds
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY refunds_tenant_insert ON refunds
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY refunds_tenant_update ON refunds
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY refunds_tenant_delete ON refunds
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS: Tenant Isolation for disputes
-- ---------------------------------------------------------------------------

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE disputes FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY disputes_tenant_isolation ON disputes
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY disputes_tenant_insert ON disputes
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY disputes_tenant_update ON disputes
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY disputes_tenant_delete ON disputes
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON refunds FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON refunds TO creatorhub_app;--> statement-breakpoint

REVOKE ALL ON disputes FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON disputes TO creatorhub_app;
