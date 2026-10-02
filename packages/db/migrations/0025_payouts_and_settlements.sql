-- Migration 0025: Payouts, Beneficiary Accounts, and Settlements (Slice 11 §11.1, §11.4)
-- Description: Creates beneficiary_accounts, payouts, and payout_items tables with RLS tenant isolation.

CREATE TABLE IF NOT EXISTS beneficiary_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  payee_type varchar(32) NOT NULL DEFAULT 'workspace',
  payee_id text NOT NULL,
  account_holder_name text NOT NULL,
  account_type varchar(32) NOT NULL,
  account_number text,
  masked_account_number text,
  ifsc_code varchar(16),
  vpa text,
  status varchar(32) NOT NULL DEFAULT 'pending',
  is_default boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_beneficiary_ws_payee ON beneficiary_accounts (workspace_id, payee_type, payee_id);
CREATE INDEX IF NOT EXISTS idx_beneficiary_ws_created ON beneficiary_accounts (workspace_id, created_at DESC);

ALTER TABLE beneficiary_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiary_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY beneficiary_accounts_tenant_isolation ON beneficiary_accounts
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  payee_type varchar(32) NOT NULL DEFAULT 'workspace',
  payee_id text NOT NULL,
  beneficiary_account_id uuid NOT NULL REFERENCES beneficiary_accounts(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL DEFAULT 'INR',
  status varchar(32) NOT NULL DEFAULT 'requested',
  provider varchar(32) NOT NULL DEFAULT 'razorpay',
  provider_payout_id varchar(128) UNIQUE,
  ledger_transaction_id uuid REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_payouts_ws_status ON payouts (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_ws_created ON payouts (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_ws_payee ON payouts (workspace_id, payee_type, payee_id);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts FORCE ROW LEVEL SECURITY;

CREATE POLICY payouts_tenant_isolation ON payouts
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

CREATE TABLE IF NOT EXISTS payout_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  payout_id uuid NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  source_type varchar(32) NOT NULL,
  source_id text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_payout_items_payout ON payout_items (payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_items_ws_source ON payout_items (workspace_id, source_type, source_id);

ALTER TABLE payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_items FORCE ROW LEVEL SECURITY;

CREATE POLICY payout_items_tenant_isolation ON payout_items
  FOR ALL
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
