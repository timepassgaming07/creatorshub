-- Slice 2 items 2.1, 2.2, 2.3: Double-entry ledger schema, deferred balance constraint, and immutability triggers.
-- See docs/adr/0008-double-entry-ledger.md and docs/architecture/data-model.md §9.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE ledger_account_owner_type AS ENUM (
  'platform',
  'workspace',
  'affiliate',
  'processor',
  'tax_authority'
);--> statement-breakpoint

CREATE TYPE ledger_account_kind AS ENUM (
  'processor_clearing',
  'creator_payable',
  'affiliate_payable',
  'platform_revenue',
  'tax_payable',
  'refunds_payable',
  'fees_expense'
);--> statement-breakpoint

CREATE TYPE ledger_transaction_kind AS ENUM (
  'order_payment',
  'refund',
  'dispute',
  'commission_accrual',
  'commission_clawback',
  'payout',
  'fee_adjustment'
);--> statement-breakpoint

CREATE TYPE ledger_entry_direction AS ENUM (
  'debit',
  'credit'
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_type ledger_account_owner_type NOT NULL,
  owner_id text,
  kind ledger_account_kind NOT NULL,
  currency varchar(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX ledger_accounts_owner_kind_currency_uq
  ON ledger_accounts (owner_type, owner_id, kind, currency) NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX ledger_accounts_workspace_id_idx ON ledger_accounts (workspace_id);--> statement-breakpoint
CREATE INDEX ledger_accounts_kind_currency_idx ON ledger_accounts (kind, currency);--> statement-breakpoint

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  kind ledger_transaction_kind NOT NULL,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX ledger_transactions_reference_idx ON ledger_transactions (reference_type, reference_id);--> statement-breakpoint
CREATE INDEX ledger_transactions_workspace_id_idx ON ledger_transactions (workspace_id);--> statement-breakpoint
CREATE INDEX ledger_transactions_occurred_at_idx ON ledger_transactions (occurred_at);--> statement-breakpoint

CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  direction ledger_entry_direction NOT NULL,
  amount bigint NOT NULL CONSTRAINT ledger_entries_amount_positive CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX ledger_entries_transaction_id_idx ON ledger_entries (transaction_id);--> statement-breakpoint
CREATE INDEX ledger_entries_account_id_idx ON ledger_entries (account_id);--> statement-breakpoint
CREATE INDEX ledger_entries_workspace_id_idx ON ledger_entries (workspace_id);--> statement-breakpoint
CREATE INDEX ledger_entries_account_created_at_idx ON ledger_entries (account_id, created_at);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Invariant 2.3: Immutability triggers on ledger_entries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION block_ledger_entries_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: UPDATE and DELETE are prohibited';
END;
$$;--> statement-breakpoint

CREATE TRIGGER block_ledger_entries_mutation_trigger
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION block_ledger_entries_mutation();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Invariant 2.2: Deferred constraint trigger enforcing debits equal credits
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION verify_ledger_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_unbalanced_count int;
BEGIN
  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  -- Check per currency within this transaction:
  -- 1. sum of debits must equal sum of credits
  -- 2. total debit amount must be > 0 (non-empty)
  SELECT COUNT(*)
  INTO v_unbalanced_count
  FROM (
    SELECT currency,
           SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS balance_diff,
           SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS total_debits,
           SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS total_credits
    FROM ledger_entries
    WHERE transaction_id = v_tx_id
    GROUP BY currency
    HAVING SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) <> 0
        OR SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) = 0
        OR SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) = 0
  ) sub;

  IF v_unbalanced_count > 0 THEN
    RAISE EXCEPTION 'Ledger transaction % does not balance: debits must equal credits (> 0) per currency', v_tx_id;
  END IF;

  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER verify_ledger_transaction_balanced_trigger
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION verify_ledger_transaction_balanced();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_transactions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ledger_accounts policies
CREATE POLICY ledger_accounts_tenant_isolation ON ledger_accounts
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id IS NULL OR workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_accounts_tenant_insert ON ledger_accounts
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ledger_transactions policies
CREATE POLICY ledger_transactions_tenant_isolation ON ledger_transactions
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_transactions_tenant_insert ON ledger_transactions
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ledger_entries policies
CREATE POLICY ledger_entries_tenant_isolation ON ledger_entries
  FOR SELECT
  TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY ledger_entries_tenant_insert ON ledger_entries
  FOR INSERT
  TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Role permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON ledger_accounts, ledger_transactions, ledger_entries FROM creatorhub_auth;--> statement-breakpoint

REVOKE UPDATE, DELETE ON ledger_entries FROM creatorhub_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON ledger_transactions FROM creatorhub_app;--> statement-breakpoint

GRANT SELECT, INSERT ON ledger_accounts TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT ON ledger_transactions TO creatorhub_app;--> statement-breakpoint
GRANT SELECT, INSERT ON ledger_entries TO creatorhub_app;
