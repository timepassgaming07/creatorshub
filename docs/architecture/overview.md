# System Architecture

**Status:** Active
**Last updated:** 2026-07-27

Companion documents: [Data Model](./data-model.md) · [Module Boundaries](./modules.md) ·
[Decision Records](../adr/README.md)

---

## 1. Shape of the system

CreatorHub is a **modular monolith** written in TypeScript, deployed as one application, with
hard internal module boundaries enforced at compile time by package separation.

```
                        ┌─────────────────────────────────────────┐
   creator ────────────▶│  app.creatorhub.app    (dashboard)      │
   buyer ──────────────▶│  {slug}.creatorhub.app (storefront)     │
   affiliate ──────────▶│  custom domains        (storefront)     │
   internal clients ───▶│  /api/v1               (versioned REST) │
                        └────────────────┬────────────────────────┘
                                         │  all four surfaces call the same
                                         ▼  domain services — no logic in routes
                        ┌─────────────────────────────────────────┐
                        │            domain modules               │
                        │  identity  catalog   commerce  ledger   │
                        │  storefront fulfilment affiliate        │
                        │  analytics  ai                          │
                        │      pure logic — zero I/O              │
                        └────────────────┬────────────────────────┘
                                         │  ports (interfaces)
                        ┌────────────────▼────────────────────────┐
                        │              adapters                   │
                        │  postgres  payments  storage  email     │
                        │  llm       queue     telemetry          │
                        └─────────────────────────────────────────┘
```

### Why a modular monolith

The manifesto asks for two things that appear to conflict: *"assume millions of users"* and
*"do not build enterprise architecture for startup problems."* The resolution is that
**scale-readiness belongs in the data model and the module seams, not in the deployment topology.**

A modular monolith gives us:

- One deploy, one log stream, one database transaction boundary — critical when money moves
  across `commerce`, `ledger`, and `affiliate` in a single operation
- Compile-time enforcement of boundaries via workspace packages, which is stronger than the
  runtime-only discipline of a folder-based monolith
- A migration path: any module whose public interface is already the only way in can be extracted
  behind a network call without touching its callers

Microservices are rejected at this stage. Splitting `commerce` from `ledger` across a network
would replace a database transaction with a distributed one — the single highest-risk change we
could make to a payments system, in exchange for scaling headroom we do not need. ADR-0002
records this in full.

### The one rule that keeps it modular

> A module may only be reached through its public interface, and may only cause effects in
> another module by emitting a domain event.

Cross-module *reads* go through the target module's exported service interface. Cross-module
*writes* never happen — a module emits an event and the interested module reacts. This is what
makes later extraction mechanical rather than archaeological.

---

## 2. Repository layout

```
creatorhub/
├── apps/
│   └── web/                    Next.js — the only deployable in M1
│       ├── app/
│       │   ├── (dashboard)/    creator app, authenticated
│       │   ├── (storefront)/   public, tenant-resolved, SSR
│       │   ├── (affiliate)/    affiliate portal, authenticated
│       │   ├── (marketing)/    public marketing site
│       │   └── api/v1/         versioned REST + provider webhooks
│       └── middleware.ts       tenant resolution, not business logic
├── packages/
│   ├── domain/                 business logic. no imports from db/http/sdk
│   ├── contracts/              zod schemas — the shared vocabulary
│   ├── db/                     drizzle schema, migrations, tenant-scoped repositories
│   ├── payments/               PaymentProvider port + adapters
│   ├── storage/                ObjectStorage port + adapters
│   ├── email/                  Mailer port + adapters + templates
│   ├── ai/                     LLM gateway: prompts, structured output, cost, evals
│   ├── jobs/                   queue port, worker runtime, outbox publisher
│   ├── telemetry/              logging, tracing, metrics, error reporting
│   ├── ui/                     design system: tokens + primitives + patterns
│   └── config/                 shared tsconfig, eslint, tailwind preset
├── docs/
│   ├── product/                vision, milestone scope
│   ├── architecture/           this directory
│   ├── adr/                    decision records
│   ├── engineering/            standards, testing, security, a11y, release
│   └── design/                 design system specification
└── manifesto.md                the product authority
```

### Dependency direction

Enforced by ESLint boundary rules and verified in CI:

```
apps/web ──▶ domain ──▶ contracts
   │           │
   │           └──▶ (ports only — never a concrete adapter)
   │
   └──▶ db, payments, storage, email, ai, jobs, telemetry, ui
```

`domain` declares the interfaces it needs and never imports an implementation. Adapters are
injected at the application boundary. This is what makes the domain testable without Docker,
and swappable without a rewrite.

---

## 3. Tenancy

`workspace` is the tenant root. Every tenant-owned row carries `workspace_id`. Isolation is
enforced **twice**, deliberately:

1. **Application layer** — all data access goes through a tenant-scoped repository constructed
   from a request-derived `WorkspaceContext`. There is no ambient database client available to
   feature code. A query cannot omit the tenant predicate, because the caller never writes the
   predicate.
2. **Database layer** — Postgres Row Level Security on every tenant table, keyed off a
   session-local setting applied per transaction.

Two mechanisms, not one, because a cross-tenant leak on a platform holding people's customer
lists and revenue is not a bug you recover from. The application layer is the one that catches
mistakes; RLS is the one that catches the mistake in the application layer.

Deliberately *not* tenant-scoped: `users`, `sessions`, and the global `audit_logs` partition for
platform-level actions.

### Tenant resolution

| Surface | How the tenant is determined |
|---|---|
| Dashboard | Active workspace from session, authorised against `workspace_members` |
| Storefront (subdomain) | `Host` header → `storefronts.subdomain` |
| Storefront (custom domain) | `Host` header → `storefronts.custom_domain`, verified |
| `/api/v1` | API key or session, scoped to a single workspace |
| Webhooks | Provider event → `payments.provider_account_id` → workspace. **Never** from the request path |
| Jobs | `workspace_id` carried explicitly in the job payload |

Middleware resolves the tenant and attaches it to the request. It performs no business logic and
touches no money.

---

## 4. The money path

The most important flow in the system. Illustrated for a purchase with an affiliate referral.

```
1. Buyer clicks affiliate link  /r/{code}
      ├─ record click (bot-filtered, IP+UA hashed)
      ├─ set first-party attribution cookie (window from programme config)
      └─ 302 → storefront

2. Buyer checks out
      ├─ price + tax computed server-side. client input is never trusted for money
      ├─ resolve attribution: last click within window, self-referral rejected
      └─ create order (status=pending) + idempotency key

3. Provider processes payment
      └─ redirect / confirm

4. Provider webhook: payment_succeeded
      ├─ verify signature
      ├─ INSERT INTO webhook_events (provider_event_id UNIQUE)   ← exactly-once gate
      └─ BEGIN TRANSACTION
         ├─ order → paid
         ├─ ledger transaction: buyer payment split across
         │     processor_clearing / creator_payable / platform_revenue
         │     / affiliate_payable(held) / tax_payable
         ├─ entitlement created
         └─ outbox: OrderPaid, EntitlementGranted, CommissionAccrued
         COMMIT

5. Outbox publisher (after commit)
      ├─ EntitlementGranted → send delivery email
      ├─ OrderPaid          → analytics projection
      └─ CommissionAccrued  → schedule hold expiry
```

Four invariants this flow protects:

- **Exactly-once webhooks.** The unique constraint on `provider_event_id` is the gate. Providers
  retry; we must not double-credit.
- **Atomic money.** Order state, ledger entries, entitlement, and event emission commit together
  or not at all. This is the concrete reason `ledger` is not a separate service.
- **No side effects inside the transaction.** Emails and downstream work go to the outbox and run
  after commit. An email provider timeout must never roll back a payment.
- **Server-authoritative pricing.** Amounts, tax, discounts, and commission are computed from
  server state. The client sends a product reference and a quantity, nothing more.

### Refund is not an undo

A refund posts a **compensating ledger transaction**. Entries are append-only and immutable.
Commission is clawed back the same way. The ledger is a history, not a current-state table —
which is what makes disputes answerable months later.

---

## 5. Asynchronous work

Postgres-backed queue with a transactional outbox. No Redis, no SQS in M1.

The reason is not simplicity for its own sake — it is that a Redis-based queue cannot enqueue
inside the same transaction as the database write. That gap is where lost payment side-effects
live. With an outbox table, "record the payment" and "schedule the delivery email" are the same
commit. ADR-0009 records the upgrade path when volume justifies a dedicated broker.

Job classes in M1: delivery email, receipt email, hold expiry, download-link cleanup, analytics
rollups, reconciliation, custom-domain verification, asset post-processing.

Every job is **idempotent and retryable with backoff**, and has a dead-letter path with an alert.

---

## 6. AI architecture

AI is a platform capability, per the manifesto — so it is a module with an interface, not SDK
calls scattered through features.

The `ai` package owns: a versioned prompt registry, provider abstraction, schema-validated
structured output, per-workspace cost accounting and rate limits, response caching, and an
offline evaluation harness. Feature code calls `ai.run('product.description.v2', input)` and
receives a typed, validated result. It never sees a model name or a raw completion.

This buys three things the manifesto requires: prompts become reviewable artefacts with history;
model swaps are a config change, not a refactor; and AI spend is attributable per workspace,
which any AI-native SaaS needs before it needs anything else.

---

## 7. Observability

Structured JSON logs with a correlation ID spanning request → job → webhook. Distributed tracing
on every external call. Error tracking with release tagging and source maps.

Money-specific, beyond ordinary application monitoring:

- **Continuous reconciliation** — the ledger's derived balance is compared against the provider's
  reported balance on a schedule. Divergence pages a human. This is the single most valuable
  alarm in the system.
- Audit log for every state-changing action on money, entitlements, and permissions
- Alerting on webhook backlog, outbox lag, dead-letter depth, and refund-rate anomalies

---

## 8. Environments

| Environment | Purpose | Data | Payments |
|---|---|---|---|
| Local | Development | Seeded | Provider test mode + local webhook forwarding |
| Preview | Per-pull-request | Branched database per PR | Provider test mode |
| Staging | Release candidate | Anonymised | Provider test mode |
| Production | Live | Real | Live |

Database branching per preview environment is a deliberate requirement, not a convenience: it
lets a reviewer exercise a real migration against real-shaped data before it reaches production.

---

## 9. What this architecture deliberately does not do

Recorded so future contributors know these were choices, not oversights:

- **No microservices.** §1.
- **No event sourcing.** The ledger is append-only, but aggregates are stored as current state.
  Event-sourcing the whole domain would add substantial cost for benefit we only need in the ledger.
- **No CQRS as a global pattern.** Analytics uses read projections; nothing else needs them.
- **No GraphQL.** Server Components remove most of the client-fetching problem GraphQL solves,
  and a versioned REST surface is a better public contract for the Phase 3 developer platform.
- **No custom payment processing.** We orchestrate a licensed provider and never hold funds as
  principal.
- **No multi-region writes.** Single-region primary with read replicas when needed. Multi-region
  write topology is a solution to a problem we do not have and would compromise ledger consistency.
