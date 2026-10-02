-- Migration 0023: Commission, Holds, and Clawback (Slice 9 §9.1)
-- Description: Creates commissions and commission_clawbacks tables with RLS tenant isolation policies.

CREATE TABLE IF NOT EXISTS commissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  attribution_id uuid NOT NULL REFERENCES attributions(id) ON DELETE RESTRICT,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gross_sale_amount bigint NOT NULL DEFAULT 0,
  commission_bps integer NOT NULL,
  gross_amount bigint NOT NULL DEFAULT 0,
  net_amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'held',
  held_until timestamptz NOT NULL,
  vested_at timestamptz,
  paid_at timestamptz,
  clawed_back_at timestamptz,
  clawback_reason text,
  currency varchar(3) NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS commissions_workspace_attribution_unique ON commissions (workspace_id, attribution_id);
CREATE INDEX IF NOT EXISTS idx_commissions_ws_order ON commissions (workspace_id, order_id);
CREATE INDEX IF NOT EXISTS idx_commissions_ws_affiliate ON commissions (workspace_id, affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_ws_vesting ON commissions (workspace_id, status, held_until);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;

CREATE POLICY commissions_tenant_isolation ON commissions
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

CREATE TABLE IF NOT EXISTS commission_clawbacks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  commission_id uuid NOT NULL REFERENCES commissions(id) ON DELETE RESTRICT,
  refund_id uuid NOT NULL REFERENCES refunds(id) ON DELETE RESTRICT,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'applied',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_commission_clawbacks_ws_commission ON commission_clawbacks (workspace_id, commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_clawbacks_ws_refund ON commission_clawbacks (workspace_id, refund_id);

ALTER TABLE commission_clawbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_clawbacks FORCE ROW LEVEL SECURITY;

CREATE POLICY commission_clawbacks_tenant_isolation ON commission_clawbacks
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
