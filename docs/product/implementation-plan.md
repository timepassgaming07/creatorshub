# Implementation Plan — Milestone 1

**Status:** Active
**Last updated:** 2026-08-01

The [scope contract](./milestone-1.md) says what M1 is and why the slices are ordered as they are.
This document says how each slice gets built: the work items, the order inside a slice, and the
verifiable condition for calling it done.

## How to read this

Each **work item** is intended to be one pull request. If an item cannot be reviewed in one sitting,
it is two items and the plan is wrong — say so and split it.

Each slice has an **exit condition** stated as something observable. "Ledger implemented" is not an
exit condition. "A property-based test proves every transaction balances across ten thousand
generated orders" is.

Estimates are deliberately absent. They would be invented, and an invented estimate becomes a
commitment the moment it is written down. Sequence and dependency are what this plan controls.

---

## Dependency graph

```
0 ──┬─> 1 ──┬─> 2 ──┬─> 5 ──┬─> 6 ──> 7 ──┐
    │       │       │       │             ├─> 10
    │       └─> 3 ──┴─> 4 ──┘             │
    │                                     │
    └─────────────────> 8 ──> 9 ──────────┘
                                          │
                                          └─> 11 (gated)
```

Reading it: slice 3 (catalogue) needs only tenancy, so it can run alongside slice 2 (ledger) if two
people are available. Slice 5 (checkout) is the join point and needs 2, 3, and 4 all complete.
Slice 8 (affiliate links and attribution) needs tenancy and the catalogue but not the ledger — only
slice 9 (commission) needs the ledger.

**The one rule that must not bend:** nothing that writes money merges before slice 2 is complete.

---

## Slice 0 — Foundation

**Goal.** A repository where a change can be written, verified, and reviewed.

| # | Work item | Status |
|---|---|---|
| 0.1 | pnpm workspace, Turborepo, exact-pinned toolchain | Done |
| 0.2 | `packages/config` — TypeScript presets, ESLint flat configs, Vitest configs | Done |
| 0.3 | `packages/contracts` — the `Money` primitive with property-based tests | Done |
| 0.4 | CI — typecheck, lint, format, test, build, dependency audit, secret scan | Done |
| 0.5 | `packages/domain`, `packages/db`, `packages/telemetry` with enforced import boundaries | Done |
| 0.6 | Design tokens as CSS custom properties, Tailwind v4 theme wiring | Done |
| 0.7 | `MoneyDisplay` and `MoneyInput` primitives | Done |
| 0.8 | Core primitives: Button, Input, Select, Dialog, Toast, Skeleton | Deferred to slice 1 |
| 0.9 | `apps/web` — Next.js App Router shell, root layout, health route | Done |
| 0.10 | Playwright and axe harness, wired into CI | Done |

**Exit condition.** `pnpm verify` passes from a clean clone on a machine with only Node and pnpm.
A new engineer can run one command and see green.

**Met, 2026-08-01.** `pnpm verify` runs 22 tasks green — typecheck, lint, 220 unit tests, format.
`pnpm test:e2e` runs 18 Playwright tests green across two browser projects, including axe in both
light and dark. Slice 0 is closed apart from item 0.8, which was deliberately moved to slice 1.

**Risk.** Over-building the component library before any screen exists. Ship the primitives that
slices 1 and 3 actually consume; defer the rest to the slice that needs them.

Acted on: item 0.8 moved to slice 1, which builds the first real screens. Designing a Dialog with no
dialog to show produces an API shaped by imagination rather than use. The money primitives were the
exception because the design system makes them mandatory everywhere and their contract — exact minor
units, never a float — is fixed regardless of what screen consumes them.

### Why only three packages exist

The architecture names eleven packages. Five of them — `payments`, `storage`, `email`, `ai`, `jobs` —
were deliberately not created in slice 0.

An empty package with a placeholder `index.ts` is not architecture; it is a directory. The thing that
makes the module boundary real is the **enforcement**, and that is in place: `no-restricted-imports`
patterns in `packages/config/eslint/domain.js` already name every future package and every forbidden
driver, verified by linting a file that imports `drizzle-orm`, `stripe`, and `react` and confirming
all three are rejected with their ADR references.

Each remaining package is created by the slice that first needs it, against a real interface rather
than a guess: `storage` in slice 3, `payments` in slice 5, `email` in slice 6, `jobs` in slice 2,
`ai` in slice 10. `db` exists but is near-empty until slice 1, because its shape follows the schema.

---

## Slice 1 — Identity, workspace, tenancy

**Goal.** A person can create an account and a workspace, and no workspace can see another's data.

This slice is where tenant isolation is established. Every later slice inherits it. Getting it wrong
here is unrecoverable, which is why it precedes everything except the toolchain.

| # | Work item |
|---|---|
| 1.1 | **Done.** `packages/db` — Drizzle setup, migration runner, connection management |
| 1.2 | **Done.** Schema: `users`, `workspaces`, `workspace_members`, `audit_logs` |
| 1.3 | **Done.** RLS policies on every tenant table, plus the session-setting mechanism |
| 1.4 | **Done.** Tenant-scoped repository base — the only way feature code reaches the database |
| 1.5 | **Done.** CI check: every tenant table has `workspace_id` and an RLS policy, or the build fails |
| 1.6 | Better Auth integration: email/password with Argon2id, sessions, verification |
| 1.7 | Passkey (WebAuthn) registration and sign-in |
| 1.8 | Authorisation policy module — roles and permissions in one place |
| 1.9 | Rate limiting on all authentication endpoints |
| 1.10 | Audit log writer, plus the append-only constraint |
| 1.11 | Sign-up, sign-in, workspace creation, and member invitation screens |
| 1.12 | **Done.** Tenant isolation test suite with the registry completeness check |
| 1.13 | Core UI primitives — Button, Input, Select, Dialog, Toast, Skeleton (moved from 0.8) |
| 1.14 | Content Security Policy — nonce-based, generated per request in middleware (deferred from 0.9) |

**Exit condition.**

- The isolation suite passes for every registered repository, and adding an unregistered repository
  fails CI.
- A manually crafted request carrying workspace A's session and workspace B's record ID returns
  not-found, not forbidden — we do not confirm the record exists.
- Disabling the application-layer scoping in a test still yields zero rows, proving RLS is doing
  independent work rather than sitting inert behind the repositories.

That third check is the one that matters. Two layers that fail together are one layer.

**Risk.** RLS misconfiguration that silently permits everything. Mitigated by the test above, which
must be written before the policies are trusted.

---

## Slice 2 — Ledger, outbox, idempotency

**Goal.** The financial spine. Every later money operation is a client of this slice.

| # | Work item |
|---|---|
| 2.1 | Schema: `ledger_accounts`, `ledger_transactions`, `ledger_entries` |
| 2.2 | Deferred constraint trigger enforcing debits equal credits per transaction |
| 2.3 | Rules rejecting `UPDATE` and `DELETE` on `ledger_entries` |
| 2.4 | Ledger service: post a balanced transaction, derive a balance, never store one |
| 2.5 | Property-based test suite for balance invariants |
| 2.6 | Schema: `outbox`, and the publisher using `FOR UPDATE SKIP LOCKED` |
| 2.7 | Schema: `jobs`, worker loop, retry with backoff, dead-letter handling |
| 2.8 | Schema: `idempotency_keys`, and the middleware that enforces them |
| 2.9 | Reconciliation job comparing derived balances against a materialised rollup |

**Exit condition.**

- A property-based test generates orders, refunds, commissions, and fee combinations, and every
  resulting transaction balances. Ten thousand cases, no exceptions.
- An attempt to post an unbalanced transaction fails at the database, not in application code.
  Verified by issuing raw SQL that bypasses the service layer entirely.
- Killing the worker mid-job leaves the job claimable and produces no duplicate side effect.
- Replaying the same idempotency key returns the original result without re-executing.

**Risk.** The temptation to store balances for query speed. Do not. Derive them, and if a query is
slow, materialise a rollup that is continuously reconciled against the entries — never a mutable
balance column that can drift silently.

---

## Slice 3 — Catalogue

**Goal.** A creator can define something to sell.

| # | Work item |
|---|---|
| 3.1 | Schema: `products`, `product_variants`, `assets`, `product_assets` |
| 3.2 | `packages/storage` — storage port, plus the first adapter |
| 3.3 | Upload flow: presigned direct upload, size and content-type validation by inspection |
| 3.4 | Malware scanning; an asset is not deliverable until marked clean |
| 3.5 | Pricing model, including the currency decision per workspace |
| 3.6 | Schema and rules for `discounts` |
| 3.7 | Product create, edit, and publish screens |
| 3.8 | Asset management interface with upload progress and failure recovery |

**Exit condition.** A creator uploads a 500MB file, sets a price, publishes, and the product appears
via the public read path. An unscanned asset cannot be attached to a published product. A file whose
extension lies about its content is rejected.

**Risk.** Large-file upload failure handling. The unhappy path — connection drops at 80% — is the
one users will actually hit, and it needs designing, not patching.

---

## Slice 4 — Storefront

**Goal.** The public surface. First validation that tenant resolution works from a hostname rather
than a session.

| # | Work item |
|---|---|
| 4.1 | Schema: `storefronts`, including domain and subdomain columns |
| 4.2 | Hostname-to-workspace resolution in middleware |
| 4.3 | Custom domain verification and certificate provisioning |
| 4.4 | Server-rendered storefront home and product detail pages |
| 4.5 | Theme presets applied as token overrides |
| 4.6 | SEO: metadata, Open Graph, structured data, sitemap, robots |
| 4.7 | `storefront_events` capture for analytics |
| 4.8 | Storefront editor with live preview |

**Exit condition.** Two workspaces on two custom domains serve entirely separate content, verified
by an automated test that requests both. Storefront LCP at p75 is under 1.5 seconds against the
performance budget. Lighthouse SEO is at or above 95.

**Risk.** Tenant resolution by hostname is a new isolation path that the session-based tests do not
cover. It needs its own isolation tests, not an assumption that slice 1 handled it.

---

## Slice 5 — Checkout and payments

**Goal.** Real money arrives. This is the join point where slices 1 through 4 are exercised together.

**Unblocked, 2026-08-01.** The entity is Indian and the first adapter is Razorpay, recorded in
[ADR-0016](../adr/0016-razorpay-first-adapter.md). Currency is INR, tax is GST, and the platform fee
is configurable with a 5% default. Cross-border selling stays out of M1: an Indian entity taking
foreign payments has RBI reporting obligations that are their own slice.

| # | Work item |
|---|---|
| 5.1 | `packages/payments` — the `PaymentProvider` port and its domain-level contract |
| 5.2 | Schema: `orders`, `order_items`, `order_transitions`, `payments`, `payment_accounts` |
| 5.3 | Order state machine with explicit, tested transitions |
| 5.4 | Server-authoritative pricing: totals computed from server state only |
| 5.5 | Tax calculation and the `tax_payable` ledger posting |
| 5.6 | Checkout session creation and the hosted redirect |
| 5.7 | Schema: `webhook_events`; signature verification and exactly-once processing |
| 5.8 | Razorpay adapter: UPI, cards, netbanking, plus Route for split settlement (ADR-0016) |
| 5.9 | Payment success writes the balanced ledger transaction in one commit |
| 5.10 | Schema and flows for `refunds` and `disputes` |
| 5.11 | Checkout UI, including the failure and retry paths |

**Exit condition.**

- A real card payment in test mode produces an order, a balanced ledger transaction, and an
  entitlement, in a single database transaction.
- Delivering the same webhook twice produces exactly one of each. Verified per event type.
- A webhook arriving before the browser redirect completes still settles correctly.
- Every failure path in the testing strategy has a test: decline, timeout mid-authorisation,
  out-of-order delivery, concurrent refunds on one order.
- A client-supplied price is ignored, and the attempt is written to the audit log.

**Risk.** This slice has the most ways to lose money quietly. It is also the slice where the
two-person money-path review gate earns its cost. No exceptions to that gate here.

---

## Slice 6 — Fulfilment

**Goal.** The buyer receives what they paid for, automatically.

| # | Work item |
|---|---|
| 6.1 | Schema: `entitlements` — the durable proof of purchase, independent of the order |
| 6.2 | Entitlement granted on payment, revoked on refund and chargeback |
| 6.3 | Schema: `download_grants`, `download_events`; signed, expiring, use-capped URLs |
| 6.4 | Download endpoint checking the entitlement at request time |
| 6.5 | `packages/email` — email port and first adapter |
| 6.6 | Delivery email, sent via the outbox so it cannot be lost or duplicated |
| 6.7 | Buyer-facing download page, no account required |

**Exit condition.** Payment to delivered email in under 30 seconds. A refund revokes access
immediately, verified by an expired-link test. A leaked download URL stops working after its use cap
or expiry, whichever comes first. Download grants are stored hashed — the raw token appears nowhere
in the database.

**Risk.** Treating "has a paid order" as equivalent to "has access". It is not, and conflating them
is how refunded buyers keep their files. The entitlement is the authority.

---

## Slice 7 — Customers and orders

**Goal.** The creator's operational surface for the business they now have.

| # | Work item |
|---|---|
| 7.1 | Schema: `customers`, with PII confined to this table |
| 7.2 | Customer records created or matched at checkout |
| 7.3 | Order list and order detail screens |
| 7.4 | Refund initiation with role-based authorisation |
| 7.5 | Customer detail: purchase history, entitlements, downloads |
| 7.6 | Search and filtering across orders and customers |
| 7.7 | Data export per workspace |

**Exit condition.** A creator finds a specific order by customer email in under three seconds and
refunds it in two clicks with a confirmation naming the exact consequence. Export produces every
record the workspace owns and nothing it does not.

---

## Slice 8 — Affiliate programme and attribution

**Goal.** Someone other than the creator can drive a sale that is correctly credited.

| # | Work item |
|---|---|
| 8.1 | Schema: `affiliate_programs`, `affiliate_program_overrides` |
| 8.2 | Schema: `affiliates` — invitation, approval, suspension |
| 8.3 | Schema: `affiliate_links`, and link generation |
| 8.4 | Click tracking to `affiliate_clicks`, with hashed IP and bot filtering |
| 8.5 | Schema: `attributions`; last-click resolution server-side |
| 8.6 | Self-referral rejection with a recorded reason |
| 8.7 | Attribution window handling, including expiry between click and purchase |
| 8.8 | Affiliate portal: links, clicks, conversions |
| 8.9 | Creator-side programme management and affiliate approval |

**Exit condition.** A click followed by a purchase produces exactly one attribution. A self-referral
produces none, and the rejection reason is queryable. Attribution is resolved entirely server-side —
a forged client parameter changes nothing. Bot clicks are flagged rather than deleted, because
affiliates dispute click counts and deleted data cannot answer them.

**Risk.** Attribution disputes are inevitable. Every attribution decision must be reconstructable
from stored data months later. Design for the argument, not just the calculation.

---

## Slice 9 — Commission, holds, and clawback

**Goal.** Attribution becomes money owed, correctly and reversibly.

| # | Work item |
|---|---|
| 9.1 | Schema: `commissions` and the commission state machine |
| 9.2 | Commission accrual posted to the ledger inside the payment transaction |
| 9.3 | Hold period, constrained to be at least the refund window |
| 9.4 | Vesting job that releases held commission |
| 9.5 | Clawback on refund inside the hold period |
| 9.6 | Clawback on refund after vesting, including the uncollectable case |
| 9.7 | Partial refund on a multi-item order where one item carried commission |
| 9.8 | Affiliate balance views, all derived from the ledger |

**Exit condition.** Every case in the testing strategy's failure list passes, including a chargeback
on an already-refunded order and concurrent refunds on the same order. Affiliate balances always
equal the ledger. The hold period cannot be configured shorter than the refund window — enforced in
code, not documented as a policy.

**Risk.** Commission on money we may still owe back. The hold constraint is the control, and it
belongs in the type or the constructor, not in a validation function someone can forget to call.

---

## Slice 10 — Analytics and AI surfaces

**Goal.** The creator understands their business. First production AI.

| # | Work item |
|---|---|
| 10.1 | Analytics queries derived from ledger and event data |
| 10.2 | Dashboard home: revenue, orders, traffic, conversion |
| 10.3 | Product and affiliate performance views |
| 10.4 | `packages/ai` — gateway, prompt registry, versioned prompts |
| 10.5 | Structured output via Zod schemas, with retry on mismatch |
| 10.6 | Schema: `ai_usage`; per-workspace cost accounting and monthly caps |
| 10.7 | Product description and storefront copy assistance |
| 10.8 | SEO metadata generation |
| 10.9 | Analytics explanation in plain language |
| 10.10 | Offline eval harness for every shipped prompt |

**Exit condition.** Revenue shown on the dashboard equals the ledger, verified by a test that
compares them. Every AI surface degrades to the manual path when the model is unavailable, verified
by a test that simulates provider failure. No AI call sits on the critical path of taking a payment.
Per-workspace cost is attributable to the individual generation.

**Risk.** Analytics computed from order rows rather than the ledger. They will diverge the first
time a partial refund lands. The ledger is the single source of financial truth, including for
charts.

---

## Slice 11 — Payout execution (gated)

**Goal.** Money leaves the platform, correctly, to the right person.

Ships only when every gate in the [scope contract](./milestone-1.md#why-payout-execution-is-gated)
holds. Until then, accrued balances are displayed, which is honest and useful.

| # | Work item |
|---|---|
| 11.1 | Schema: `payouts`, `payout_items` |
| 11.2 | Payout provider port and adapter |
| 11.3 | Payout request, approval, and execution flow |
| 11.4 | Ledger postings for payout initiation and settlement |
| 11.5 | Failure and reversal handling |
| 11.6 | Anomaly detection: unusual conversion rates, volume spikes, geographic mismatch |
| 11.7 | Reconciliation against the provider balance |
| 11.8 | Incident and reversal runbook |

**Exit condition.** Reconciliation runs clean for a sustained period before the first real payout. A
failed payout returns the balance to the affiliate and leaves the ledger balanced. The runbook is
written and rehearsed before the feature is enabled, because the alternative is improvising while
money is missing.

---

## Cross-cutting workstreams

These are not slices. They run continuously and are part of every slice's definition of done.

**Accessibility.** Automated axe on every PR from slice 0. Manual screen-reader verification on
checkout and product creation before release.

**Performance.** Lighthouse CI against the budget from the moment there is a page. Query plan review
on the ten hottest queries as they emerge.

**Security.** `/cso` review on any change touching authentication, payments, tenancy, or file
access. External penetration test before general availability.

**Documentation.** ADRs written when the decision is made, not reconstructed afterwards.
`/document-release` after each slice lands.

---

## Sequencing for one engineer

If only one person is building, the parallel branches collapse to this order:

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11
```

Resist reordering to reach a demo sooner. Slices 1 and 2 produce nothing screenshot-worthy and are
the two whose absence cannot be repaired later.

---

## What would change this plan

Recorded so that revision reads as a decision rather than drift:

- **~~Open item 1 resolves against Stripe Connect.~~** Resolved. The entity is Indian and the first
  adapter is Razorpay ([ADR-0016](../adr/0016-razorpay-first-adapter.md)). The port and everything
  above it were unaffected, which is what ADR-0007 was for.
- **A second currency is needed in M1.** Slice 3's pricing model and the ledger account structure
  both change. Cheaper now than after slice 9.
- **Payout gates cannot be met.** Slice 11 moves to M2, and M1 ships with accrued balances only. The
  scope contract already permits this.
