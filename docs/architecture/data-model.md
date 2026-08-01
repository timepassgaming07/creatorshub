# Data Model — Milestone 1

**Status:** Active
**Last updated:** 2026-07-27

Types below are Postgres. This document is the design; `packages/db/schema` is the
implementation and the two must not diverge — CI checks that migrations match the schema.

---

## 1. Global conventions

Non-negotiable, applied to every table.

| Rule | Reason |
|---|---|
| Primary keys are UUIDv7 | Time-ordered (index locality) without leaking sequential counts |
| Money is `BIGINT` minor units + `CHAR(3)` currency, always adjacent | Floats are unacceptable for money. `NUMERIC` invites accidental float coercion in JS |
| All timestamps `TIMESTAMPTZ`, stored UTC | Timezone bugs in a global product are silent and expensive |
| Every tenant table has `workspace_id NOT NULL` | Tenancy predicate is structural, not remembered |
| Soft delete only where recovery is a product requirement | `deleted_at` everywhere makes every query a footgun |
| `created_at`, `updated_at` on every table | Baseline forensics |
| Enums are Postgres `ENUM` types | Invalid states become unrepresentable at the storage layer |
| No `ON DELETE CASCADE` on money or audit tables | Financial history must survive the deletion of anything referencing it |

**Naming:** `snake_case` tables and columns, plural table names, `{table}_id` foreign keys,
`idx_{table}__{cols}` indexes, `uq_{table}__{cols}` unique constraints.

---

## 2. Identity and tenancy

```sql
users                       -- global, NOT tenant-scoped
  id, email UNIQUE (citext), email_verified_at, name, avatar_url,
  created_at, updated_at

-- sessions, accounts, verification_tokens, passkeys owned by the auth library,
-- living in our database. See ADR-0006.

workspaces
  id, slug UNIQUE (citext), name, timezone, default_currency CHAR(3),
  plan, status, created_at, updated_at
  -- slug is reserved-word checked against a denylist (app, api, www, admin, …)

workspace_members
  id, workspace_id → workspaces, user_id → users,
  role ENUM('owner','admin','member'), invited_by, joined_at,
  uq: (workspace_id, user_id)
  -- exactly one 'owner' per workspace, enforced by a partial unique index
```

**Invariant.** Every authorisation check answers one question: *does this user hold a role in this
workspace sufficient for this action?* Permissions are derived from role in a single policy module
(`domain/identity/policy.ts`) — never inline in a route handler. Scattered permission checks are
how tenancy leaks happen.

---

## 3. Storefront

```sql
storefronts
  id, workspace_id → workspaces UNIQUE,     -- one storefront per workspace in M1
  subdomain UNIQUE (citext),
  custom_domain UNIQUE NULLABLE (citext),
  domain_verified_at, domain_verification_token,
  headline, bio, logo_asset_id, social_links JSONB,
  theme JSONB,                               -- validated against a zod schema, never free-form
  status ENUM('draft','published'), published_at,
  seo_title, seo_description, og_image_asset_id,
  created_at, updated_at

storefront_events                            -- first-party analytics, high volume
  id, workspace_id, storefront_id,
  type ENUM('page_view','product_view','checkout_start','checkout_complete'),
  visitor_id,                                -- first-party cookie, rotating
  session_id, product_id NULLABLE,
  referrer, utm JSONB, affiliate_click_id NULLABLE,
  country, device_type,
  occurred_at
  -- partitioned monthly by occurred_at; raw rows retained 90 days, rollups kept indefinitely
```

`theme` is JSONB but **schema-validated on write** against a versioned zod schema with a
`version` discriminator. This gives theme flexibility without the usual JSONB outcome of an
un-migratable blob.

---

## 4. Catalogue

```sql
products
  id, workspace_id → workspaces,
  slug,                                      -- uq: (workspace_id, slug)
  name, description, description_html,       -- html is sanitised server-side on write
  type ENUM('digital_download','licence_key'),
  status ENUM('draft','published','archived'),
  cover_asset_id, gallery JSONB,
  seo_title, seo_description,
  published_at, created_at, updated_at

product_variants                             -- price lives here, never on products
  id, workspace_id, product_id → products,
  name, sku NULLABLE,
  pricing_model ENUM('fixed','pay_what_you_want','free'),
  price_amount BIGINT, price_currency CHAR(3),
  min_amount BIGINT NULLABLE,                -- pay-what-you-want floor
  position, status, created_at, updated_at
```

> **Why variants when M1 sells single-price digital files?**
> Because a course tier, a membership plan, and a licence tier are all variants of a product, and
> retrofitting a price table under existing orders means rewriting order history. One extra table
> now removes a migration on money data later. This is the pattern applied throughout: absorb
> small present cost to eliminate a future rewrite listed in the
> [deferred-capability table](../product/milestone-1.md#3-explicitly-out-of-scope).

```sql
assets
  id, workspace_id,
  kind ENUM('product_file','image','logo'),
  storage_key, filename, content_type, byte_size,
  checksum_sha256, scan_status ENUM('pending','clean','infected','error'),
  created_at

product_assets                               -- versioned attachment, so replacing a file
  id, workspace_id, product_id, asset_id,    -- does not break existing entitlements
  version INT, is_current BOOL, position,
  uq: (product_id, asset_id, version)

discounts
  id, workspace_id, code,                    -- uq: (workspace_id, upper(code))
  type ENUM('percentage','fixed_amount'),
  value BIGINT, currency CHAR(3) NULLABLE,
  max_redemptions, redemption_count,
  starts_at, ends_at, status,
  applies_to ENUM('all','products'), product_ids UUID[]
```

---

## 5. Customers and orders

```sql
customers
  id, workspace_id,
  email (citext),                            -- uq: (workspace_id, email)
  name, country,
  notes, tags TEXT[],
  first_order_at, last_order_at,
  created_at, updated_at
  -- lifetime value is DERIVED FROM THE LEDGER, never a stored counter.
  -- a denormalised total will drift the first time a refund is mishandled.

orders
  id, workspace_id, customer_id → customers,
  number,                                    -- uq: (workspace_id, number), human-facing
  status ENUM('pending','paid','partially_refunded','refunded','failed','cancelled'),
  currency CHAR(3),
  subtotal_amount, discount_amount, tax_amount, total_amount BIGINT,
  discount_id NULLABLE, tax_breakdown JSONB,
  buyer_email, buyer_country, buyer_ip_hash,
  idempotency_key UNIQUE,
  placed_at, paid_at, created_at, updated_at

order_items
  id, workspace_id, order_id → orders,
  product_id, variant_id,
  product_name_snapshot, variant_name_snapshot,   -- snapshot: an invoice must never
  unit_amount BIGINT, quantity, total_amount,     -- change because a product was renamed
  created_at

order_transitions                            -- append-only state machine log
  id, workspace_id, order_id,
  from_status, to_status, reason, actor_type, actor_id, occurred_at
```

Legal order state transitions:

```
pending ──▶ paid ──▶ partially_refunded ──▶ refunded
   │                        │
   ├──▶ failed              └──▶ refunded
   └──▶ cancelled
```

Enforced in the domain layer, logged in `order_transitions`. Any other transition is a bug and
raises.

---

## 6. Payments

Provider-agnostic by construction. No provider concept appears in a column name.

```sql
payment_accounts                             -- creator's connected payout account
  id, workspace_id UNIQUE,
  provider ENUM('stripe'),                   -- extensible; see ADR-0007
  provider_account_id UNIQUE,                -- the webhook → workspace lookup key
  status ENUM('pending','onboarding','active','restricted','disabled'),
  capabilities JSONB, requirements JSONB,
  payouts_enabled BOOL, charges_enabled BOOL,
  created_at, updated_at

payments
  id, workspace_id, order_id → orders,
  provider, provider_payment_id UNIQUE,
  status ENUM('requires_action','processing','succeeded','failed','cancelled'),
  amount BIGINT, currency CHAR(3),
  processor_fee_amount BIGINT,
  method_type, method_last4, method_brand,    -- display only. no PAN ever touches us
  failure_code, failure_message,
  created_at, updated_at

refunds
  id, workspace_id, payment_id → payments, order_id,
  provider_refund_id UNIQUE,
  amount BIGINT, currency, reason,
  status ENUM('pending','succeeded','failed'),
  initiated_by_user_id, created_at

disputes
  id, workspace_id, payment_id, provider_dispute_id UNIQUE,
  amount, currency, reason,
  status ENUM('needs_response','under_review','won','lost'),
  evidence_due_at, created_at, updated_at

webhook_events                               -- the exactly-once gate
  id, provider,
  provider_event_id,                         -- uq: (provider, provider_event_id)
  type, payload JSONB,
  received_at, processed_at, error, attempts
```

**The critical constraint in the whole system** is `uq (provider, provider_event_id)`. Providers
retry webhooks. Without this, a retry double-credits a creator and double-accrues a commission.
Processing inserts this row inside the same transaction as its effects; a duplicate hits the
constraint, the transaction aborts, and we return 200 without re-applying anything.

---

## 7. Fulfilment

```sql
entitlements                                 -- durable proof of purchase
  id, workspace_id, customer_id, product_id,
  order_id, order_item_id,
  status ENUM('active','revoked','expired'),
  revoked_at, revoked_reason,
  granted_at, expires_at NULLABLE,           -- nullable now; memberships will use it
  uq: (order_item_id)

download_grants                              -- short-lived, signed, use-capped
  id, workspace_id, entitlement_id, asset_id,
  token_hash UNIQUE,                         -- hash, not the token. treat as a credential
  expires_at, max_uses, use_count,
  created_at

download_events
  id, workspace_id, download_grant_id,
  ip_hash, user_agent_hash, byte_range, occurred_at
```

Entitlement is separated from order deliberately. It is the thing courses, memberships, and
communities will all attach to, and it must survive an order being partially refunded. Access is
always answered by *"is there an active entitlement?"* — never by *"is there a paid order?"*

Buyers do not need an account. A magic link authenticates the customer's purchase library, which
removes the largest source of checkout friction while keeping downloads non-public.

---

## 8. Affiliate

```sql
affiliate_programs
  id, workspace_id UNIQUE,                   -- one programme per workspace in M1
  status ENUM('inactive','active'),
  commission_type ENUM('percentage','fixed_amount'),
  commission_value BIGINT,                   -- basis points if percentage
  currency CHAR(3) NULLABLE,
  attribution_window_days INT DEFAULT 30,
  hold_period_days INT DEFAULT 30,           -- must be ≥ the refund window
  minimum_payout_amount BIGINT,
  auto_approve BOOL, terms_html,
  created_at, updated_at

affiliate_program_overrides                  -- per-product commission
  id, workspace_id, program_id, product_id,
  commission_type, commission_value,
  uq: (program_id, product_id)

affiliates
  id, workspace_id, program_id,
  user_id → users NULLABLE,                  -- nullable: see open item 5. cross-workspace
  email (citext),                            -- affiliate identity becomes additive, not a migration
  name, code UNIQUE (citext),                -- global uniqueness keeps referral URLs short
  status ENUM('pending','approved','rejected','suspended'),
  payout_account_id NULLABLE,
  approved_at, created_at, updated_at,
  uq: (program_id, email)

affiliate_links
  id, workspace_id, affiliate_id,
  product_id NULLABLE,                       -- null = storefront-wide link
  code UNIQUE, destination_path,
  created_at

affiliate_clicks                             -- high volume, partitioned monthly
  id, workspace_id, affiliate_link_id, affiliate_id,
  visitor_id, ip_hash, user_agent_hash,      -- hashed: a click log is not a reason to store PII
  referrer, landing_path,
  is_bot BOOL, country,
  occurred_at, expires_at                    -- occurred_at + attribution_window

attributions                                 -- exactly one per attributed order
  id, workspace_id, order_id UNIQUE,
  affiliate_id, affiliate_click_id,
  model ENUM('last_click'),                  -- enum now so first_click/linear are additive
  attributed_at

commissions
  id, workspace_id, order_id, order_item_id NULLABLE,
  affiliate_id, attribution_id,
  amount BIGINT, currency, rate_snapshot JSONB,   -- snapshot: changing programme terms must
  status ENUM('held','available','paid','clawed_back','void'),  -- not alter historical commissions
  hold_expires_at, available_at, paid_at,
  ledger_transaction_id,
  created_at, updated_at
```

### Attribution rules

1. `/r/{code}` records the click, sets a first-party cookie for `attribution_window_days`, 302s
   to the destination. Bot traffic is filtered and flagged, not silently dropped — affiliates
   dispute click counts.
2. At order creation, the **last** valid click within the window is attributed. Ties resolve to
   the most recent `occurred_at`.
3. **Self-referral is rejected**: the buyer's email matching the affiliate's email or linked user
   voids the attribution with a recorded reason. This is the most common affiliate fraud and it
   must be blocked in code, not policy.
4. `commissions.rate_snapshot` freezes the terms at the moment of sale. A creator lowering their
   commission rate must never retroactively reduce what an affiliate already earned.
5. Commission enters `held`, becomes `available` when `hold_expires_at` passes, and is
   `clawed_back` if a refund lands first. The hold period is constrained to be at least the
   refund window — otherwise we pay commission on money we may have to return.

---

## 9. Ledger

The financial core. Double-entry, append-only, immutable.

```sql
ledger_accounts
  id, workspace_id NULLABLE,                 -- null for platform-level accounts
  owner_type ENUM('platform','workspace','affiliate','processor','tax_authority'),
  owner_id NULLABLE,
  kind ENUM('processor_clearing','creator_payable','affiliate_payable',
            'platform_revenue','tax_payable','refunds_payable','fees_expense'),
  currency CHAR(3),
  uq: (owner_type, owner_id, kind, currency)

ledger_transactions
  id,
  kind ENUM('order_payment','refund','dispute','commission_accrual',
            'commission_clawback','payout','fee_adjustment'),
  reference_type, reference_id,              -- e.g. ('order', <uuid>)
  idempotency_key UNIQUE,
  occurred_at, created_at,
  description

ledger_entries                               -- APPEND-ONLY. no UPDATE, no DELETE, ever.
  id, transaction_id → ledger_transactions,
  account_id → ledger_accounts,
  direction ENUM('debit','credit'),
  amount BIGINT CHECK (amount > 0),
  currency CHAR(3),
  workspace_id NULLABLE,                     -- denormalised for tenant-scoped reporting
  created_at
```

### Invariants, enforced in the database

1. **Balanced transactions.** For every `transaction_id` and currency, sum of debits equals sum
   of credits. Enforced by a deferred constraint trigger checked at commit — so a partially
   written transaction cannot commit.
2. **Immutability.** `UPDATE` and `DELETE` on `ledger_entries` are revoked at the role level and
   blocked by trigger. Corrections are new compensating transactions.
3. **No cross-currency entries within one transaction.** FX becomes an explicit conversion
   transaction with its own accounts.
4. **Positive amounts only.** Direction carries the sign. Signed amounts plus direction is a
   double-negative bug waiting to happen.

### Worked example

A £100.00 sale, 20% VAT-inclusive, 5% platform fee, 20% affiliate commission, ~£1.70 processor fee:

| Account | Debit | Credit |
|---|---|---|
| `processor_clearing` | 10000 | |
| `tax_payable` | | 1667 |
| `platform_revenue` | | 417 |
| `affiliate_payable` (held) | | 1583 |
| `creator_payable` | | 6163 |
| `fees_expense` | 170 | |
| `processor_clearing` | | 170 |
| **Total** | **10170** | **10170** |

Balances are always derived by aggregation over `ledger_entries`, with materialised rollups for
performance. A stored balance column would be the first thing to drift, and drift on money is
indistinguishable from theft until proven otherwise.

```sql
payouts
  id, workspace_id NULLABLE,
  payee_type ENUM('workspace','affiliate'), payee_id,
  provider, provider_payout_id UNIQUE NULLABLE,
  amount BIGINT, currency,
  status ENUM('requested','processing','paid','failed','reversed'),
  ledger_transaction_id, requested_at, completed_at, failure_reason

payout_items                                 -- what this payout settles
  id, payout_id, source_type ENUM('order','commission'), source_id, amount
```

### Reconciliation

A scheduled job compares ledger-derived balances against the provider's reported balance and
records the result in `reconciliation_runs`. Divergence beyond a tolerance pages a human. This is
the mechanism that turns "we think the ledger is right" into "we know."

---

## 10. Platform tables

```sql
outbox                                       -- transactional event publication
  id, workspace_id NULLABLE,
  aggregate_type, aggregate_id,
  event_type, payload JSONB, metadata JSONB,
  occurred_at, published_at NULLABLE, attempts, last_error
  idx: (published_at) WHERE published_at IS NULL

jobs
  id, queue, type, payload JSONB,
  status ENUM('queued','running','succeeded','failed','dead'),
  run_after, attempts, max_attempts,
  locked_at, locked_by, last_error,
  idempotency_key UNIQUE NULLABLE,
  created_at, updated_at

audit_logs                                   -- append-only, partitioned monthly
  id, workspace_id NULLABLE,
  actor_type ENUM('user','system','affiliate','api_key','provider'), actor_id,
  action,                                    -- 'order.refunded', 'member.role_changed', …
  target_type, target_id,
  metadata JSONB, ip_hash, user_agent,
  occurred_at

idempotency_keys
  key, scope, request_hash, response_status, response_body JSONB,
  created_at, expires_at,
  uq: (scope, key)

ai_usage                                     -- per-workspace cost attribution
  id, workspace_id, prompt_id, prompt_version,
  provider, model, input_tokens, output_tokens,
  cached_input_tokens, cost_micros BIGINT,
  latency_ms, status, occurred_at
```

`audit_logs` is written for every state change to money, entitlements, and permissions. It is
append-only and never deleted by application code. This is the table that answers a dispute, a
security question, or a regulator — and it cannot be reconstructed after the fact, which is why
it exists in M1 rather than when it is first needed.

---

## 11. Indexing strategy

Beyond primary keys and the unique constraints above:

```
orders             (workspace_id, created_at DESC)      -- dashboard list
orders             (workspace_id, status, created_at DESC)
orders             (workspace_id, customer_id)
order_items        (order_id)
ledger_entries     (account_id, created_at)             -- balance aggregation
ledger_entries     (workspace_id, created_at)
ledger_entries     (transaction_id)
commissions        (affiliate_id, status)
commissions        (workspace_id, status, hold_expires_at)  -- hold-expiry sweep
affiliate_clicks   (visitor_id, occurred_at DESC)        -- attribution lookup
affiliate_clicks   (affiliate_id, occurred_at DESC)
entitlements       (customer_id, status)
storefront_events  (workspace_id, occurred_at DESC)
products           (workspace_id, status)
outbox             (published_at) WHERE published_at IS NULL   -- partial: hot path
jobs               (queue, status, run_after) WHERE status = 'queued'
```

Partitioned monthly by time: `affiliate_clicks`, `storefront_events`, `audit_logs`,
`download_events`. These are the only tables expected to reach a scale where partitioning matters,
and partitioning them from the start avoids a painful online migration later.

---

## 12. Retention and privacy

| Data | Retention | Reason |
|---|---|---|
| Ledger, orders, payments, refunds, disputes | Indefinite | Financial record |
| Audit logs | Indefinite (archived after 24 months) | Evidence |
| Raw `storefront_events`, `affiliate_clicks` | 90 days, then rolled up | Utility decays; PII exposure does not |
| Download events | 12 months | Abuse investigation |
| AI usage | 24 months | Cost analysis |

Design decisions that make future privacy compliance additive rather than a redesign:

- IP addresses and user agents are **hashed with a rotating salt** at write time, never stored raw
- PII is confined to `users`, `customers`, and `affiliates` — three tables, so a subject-access or
  erasure request has a bounded, known implementation
- Financial records are excluded from erasure by design (a legitimate retention basis), so
  erasure anonymises the customer record while the ledger stays intact and balanced

This is the whole of the M1 compliance posture: no policy documents, no consent framework, but the
data is shaped so that adding them later touches no money code.
