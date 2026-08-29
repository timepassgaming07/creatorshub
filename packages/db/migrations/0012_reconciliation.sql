-- Slice 2 item 2.9: Ledger balance rollups and continuous reconciliation against live derived entries.
-- See docs/adr/0008-double-entry-ledger.md and docs/product/implementation-plan.md §Slice 2.

-- ---------------------------------------------------------------------------
-- Table & Indexes
-- ---------------------------------------------------------------------------

CREATE TABLE ledger_balance_rollups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE CASCADE,
  currency varchar(3) NOT NULL,
  total_debits bigint NOT NULL DEFAULT 0,
  total_credits bigint NOT NULL DEFAULT 0,
  derived_balance bigint NOT NULL DEFAULT 0,
  entry_count integer NOT NULL DEFAULT 0,
  last_entry_id uuid REFERENCES ledger_entries(id),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX ledger_balance_rollups_account_uq ON ledger_balance_rollups (account_id);--> statement-breakpoint
CREATE INDEX ledger_balance_rollups_workspace_idx ON ledger_balance_rollups (workspace_id, reconciled_at);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE ledger_balance_rollups ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_balance_rollups FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY ledger_balance_rollups_tenant_isolation ON ledger_balance_rollups
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_balance_rollups_tenant_insert ON ledger_balance_rollups
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_balance_rollups_tenant_update ON ledger_balance_rollups
  FOR UPDATE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_balance_rollups_tenant_delete ON ledger_balance_rollups
  FOR DELETE
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON ledger_balance_rollups FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ledger_balance_rollups TO creatorhub_app;
