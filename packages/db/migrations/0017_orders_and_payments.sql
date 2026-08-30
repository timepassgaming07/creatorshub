-- Slice 5 item 5.2: Orders, Order Items, Order Transitions, Payment Accounts, and Payments schema.
-- See docs/product/implementation-plan.md §Slice 5.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE order_status AS ENUM (
  'pending',
  'requires_payment',
  'processing',
  'paid',
  'cancelled',
  'refunded',
  'partially_refunded',
  'failed'
);--> statement-breakpoint

CREATE TYPE order_payment_status AS ENUM (
  'unpaid',
  'authorized',
  'paid',
  'refunded',
  'partially_refunded',
  'failed'
);--> statement-breakpoint

CREATE TYPE order_transition_actor_type AS ENUM (
  'system',
  'customer',
  'member',
  'webhook'
);--> statement-breakpoint

CREATE TYPE payment_provider AS ENUM (
  'razorpay',
  'stripe',
  'memory'
);--> statement-breakpoint

CREATE TYPE payment_status AS ENUM (
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded'
);--> statement-breakpoint

CREATE TYPE payment_account_status AS ENUM (
  'created',
  'onboarding_pending',
  'under_review',
  'active',
  'restricted',
  'disabled'
);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Orders Table
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  customer_email citext NOT NULL,
  customer_name varchar(255),
  customer_phone varchar(50),
  currency varchar(3) NOT NULL,
  subtotal_amount bigint NOT NULL,
  discount_amount bigint NOT NULL DEFAULT 0,
  tax_amount bigint NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  payment_status order_payment_status NOT NULL DEFAULT 'unpaid',
  checkout_session_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX orders_workspace_status_idx ON orders (workspace_id, status);--> statement-breakpoint
CREATE INDEX orders_workspace_customer_email_idx ON orders (workspace_id, customer_email);--> statement-breakpoint
CREATE INDEX orders_workspace_created_at_idx ON orders (workspace_id, created_at);--> statement-breakpoint
CREATE INDEX orders_checkout_session_id_idx ON orders (checkout_session_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Order Items Table
-- ---------------------------------------------------------------------------

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_title varchar(255) NOT NULL,
  variant_title varchar(255),
  unit_amount bigint NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  subtotal_amount bigint NOT NULL,
  discount_amount bigint NOT NULL DEFAULT 0,
  tax_amount bigint NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX order_items_workspace_order_idx ON order_items (workspace_id, order_id);--> statement-breakpoint
CREATE INDEX order_items_workspace_product_idx ON order_items (workspace_id, product_id);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Order Transitions Table
-- ---------------------------------------------------------------------------

CREATE TABLE order_transitions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status order_status NOT NULL,
  to_status order_status NOT NULL,
  reason text,
  actor_type order_transition_actor_type NOT NULL,
  actor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX order_transitions_workspace_order_created_idx ON order_transitions (workspace_id, order_id, created_at);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Payment Accounts Table
-- ---------------------------------------------------------------------------

CREATE TABLE payment_accounts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider payment_provider NOT NULL,
  provider_account_id varchar(255) NOT NULL,
  country varchar(2) NOT NULL,
  default_currency varchar(3) NOT NULL,
  status payment_account_status NOT NULL DEFAULT 'created',
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE UNIQUE INDEX payment_accounts_workspace_provider_account_uidx ON payment_accounts (workspace_id, provider, provider_account_id);--> statement-breakpoint
CREATE INDEX payment_accounts_workspace_status_idx ON payment_accounts (workspace_id, status);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Payments Table
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider payment_provider NOT NULL,
  provider_payment_id varchar(255) NOT NULL,
  provider_order_id varchar(255),
  provider_signature text,
  amount bigint NOT NULL,
  currency varchar(3) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  method varchar(50),
  captured_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX payments_workspace_order_idx ON payments (workspace_id, order_id);--> statement-breakpoint
CREATE INDEX payments_workspace_provider_payment_idx ON payments (workspace_id, provider, provider_payment_id);--> statement-breakpoint
CREATE INDEX payments_workspace_status_idx ON payments (workspace_id, status);--> statement-breakpoint
CREATE INDEX payments_idempotency_key_idx ON payments (idempotency_key);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security & Isolation
-- ---------------------------------------------------------------------------

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE orders FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY orders_tenant_isolation ON orders
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY orders_tenant_insert ON orders
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY orders_tenant_update ON orders
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY orders_tenant_delete ON orders
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY order_items_tenant_isolation ON order_items
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_items_tenant_insert ON order_items
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_items_tenant_update ON order_items
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_items_tenant_delete ON order_items
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE order_transitions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE order_transitions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY order_transitions_tenant_isolation ON order_transitions
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_transitions_tenant_insert ON order_transitions
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_transitions_tenant_update ON order_transitions
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY order_transitions_tenant_delete ON order_transitions
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payment_accounts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY payment_accounts_tenant_isolation ON payment_accounts
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payment_accounts_tenant_insert ON payment_accounts
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payment_accounts_tenant_update ON payment_accounts
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payment_accounts_tenant_delete ON payment_accounts
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY payments_tenant_isolation ON payments
  FOR SELECT TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payments_tenant_insert ON payments
  FOR INSERT TO creatorhub_app
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payments_tenant_update ON payments
  FOR UPDATE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());--> statement-breakpoint

CREATE POLICY payments_tenant_delete ON payments
  FOR DELETE TO creatorhub_app
  USING (workspace_id = app_current_workspace_id());--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

REVOKE ALL ON orders, order_items, order_transitions, payment_accounts, payments FROM creatorhub_auth;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON orders, order_items, order_transitions, payment_accounts, payments TO creatorhub_app;
