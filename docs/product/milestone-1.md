# Milestone 1 — Scope Contract

**Status:** Active
**Owner:** Founding engineering team
**Last updated:** 2026-07-27

This document is the scope contract for CreatorHub's first production release. It exists so
that "is this in scope?" has a written answer rather than a conversational one.

The [manifesto](../../manifesto.md) defines the long-term vision. This document defines what
ships first. Where the manifesto describes a capability not listed here, that capability is
deferred — not cancelled.

---

## 1. The wedge

> **A complete digital commerce platform for creators.**

The success condition is not feature count. It is this sentence:

> A creator with no technical skill can go from signing up to receiving real money from a real
> customer, and can recruit other people to sell on their behalf and be paid for it.

Everything in scope serves that sentence. Everything that does not serve it waits.

### Why revenue is the metric

The manifesto's mission is to *"remove every technical barrier between expertise and income."*
The operative word is **income**. A milestone that produces a beautiful storefront but no
completed transaction has not tested the mission. So the first release is organised around one
end-to-end money path, built to the full [Definition of Done](../engineering/definition-of-done.md),
rather than many partial capabilities.

---

## 2. In scope

### 2.1 Identity and workspace

- Email/password and passkey sign-up and sign-in
- Email verification, password reset
- Workspace creation (a workspace is the tenant root and the unit of billing, data isolation,
  and ownership)
- Workspace members with roles: `owner`, `admin`, `member`
- Workspace settings: name, slug, timezone, default currency
- Session management, sign-out of all devices

### 2.2 Creator identity and storefront

- Public storefront at `{slug}.creatorhub.app`
- Custom domain support (verification, TLS provisioning)
- Storefront branding: logo, brand colour, accent, typography selection from curated sets
- Storefront content: headline, bio, social links, featured products
- Product detail pages, server-rendered for SEO (title, description, Open Graph, JSON-LD
  `Product` and `Offer`)
- Draft / published states with preview
- `sitemap.xml` and `robots.txt` per storefront

### 2.3 Digital product catalogue

- Create, edit, archive digital products
- Product types in M1: **downloadable file bundle** and **external/licence key delivery**
- Pricing: fixed price, pay-what-you-want with a minimum, and free
- Multi-currency at the workspace level (one selling currency per workspace in M1)
- Asset upload with resumable multipart upload, checksum verification, virus scanning hook
- Asset versioning — replacing a file does not break existing entitlements
- Discount codes: percentage and fixed amount, usage caps, expiry, per-product scoping

### 2.4 Checkout and payments

- Hosted checkout on the creator's storefront
- Card payments via the initial provider adapter; wallets where the provider supports them
- Automatic tax calculation and collection for digital goods
- Split settlement: creator earnings, platform fee, affiliate commission
- Receipts and invoices by email
- Full and partial refunds, initiated by the creator
- Chargeback/dispute ingestion and reflection in the ledger
- Idempotent webhook processing — every provider event is processed exactly once

### 2.5 Fulfilment

- Entitlement created on payment success; entitlement is the durable proof of purchase
- Signed, expiring, use-capped download links
- Customer-facing purchase library accessible by magic link (no customer account required)
- Delivery email with links, resend capability
- Entitlement revocation on refund or chargeback

### 2.6 Customers

- Customer records auto-created at first purchase, unique per `(workspace, email)`
- Purchase history, lifetime value, refund history
- Manual notes and tags
- CSV export

> **Not** a CRM. No pipelines, no sequences, no segments, no email campaigns. Explicitly deferred.

### 2.7 Orders

- Order list with filter and search
- Order detail: line items, payment state, tax, fees, commission attribution, refund history
- Order state machine with an auditable transition log

### 2.8 Analytics

- Revenue over time — gross, net, refunded, fees
- Orders and average order value
- Product performance
- Storefront traffic: views, unique visitors, conversion rate
- Traffic source attribution including affiliate referrals
- Payout balance: available, pending, held

M1 analytics are computed from the ledger and from a first-party event table. No third-party
analytics vendor, no client-side tracker beyond our own.

### 2.9 Affiliate programme

This is a first-class capability of M1, not an add-on.

- Enable an affiliate programme per workspace with: commission type (percentage or fixed),
  commission value, attribution window, hold period, optional per-product overrides
- Affiliate invitation by email; public application flow with creator approval
- Affiliate accounts with their own dashboard, scoped strictly to their own data
- Unique referral links per affiliate, and per affiliate-product pair
- Click tracking with a first-party cookie, bot filtering, and IP/UA hashing
- **Last-click attribution** within the window, recorded server-side at order creation
- Self-referral detection and rejection
- Commission accrual to the ledger on payment success, held until the hold period elapses
- Commission clawback on refund or chargeback via compensating ledger transactions
- Affiliate-facing stats: clicks, conversions, conversion rate, earned, pending, paid

### 2.10 Payouts

- Payout balances for creators and affiliates, derived from the ledger
- Payout method onboarding through the provider's KYC flow
- Payout history and statements
- **Payout execution is the final gated slice of M1.** See §5.

### 2.11 AI foundation

The manifesto states AI is platform infrastructure, not a feature. M1 therefore ships the
*gateway*, plus a small number of genuinely useful surfaces — not an assistant bolted to a sidebar.

- Provider-agnostic AI gateway: prompt registry, versioned prompts, structured output,
  per-workspace cost accounting, rate limiting, caching, evaluation harness
- Surfaces in M1: product description generation, storefront copy assistance, SEO metadata
  suggestions, plain-language explanation of an analytics change

No chat interface in M1. AI appears where the user is already working, or not at all.

### 2.12 Platform foundations

Non-negotiable and present from the first commit, because each is prohibitively expensive to retrofit:

| Foundation | Why it cannot wait |
|---|---|
| Double-entry ledger | Money correctness; every later monetisation feature inherits it |
| `workspace_id` on every tenant row + RLS | A cross-tenant leak is unrecoverable |
| Transactional outbox | A lost payment webhook side-effect means lost money |
| Idempotency keys | Duplicate charges and duplicate commissions |
| Append-only audit log | Regulatory and dispute evidence; cannot be reconstructed later |
| Structured logging, tracing, error tracking | You cannot debug money flows from stdout |

---

## 3. Explicitly out of scope

Deferred by decision, with the architectural seam that will receive them:

| Deferred capability | Attaches via |
|---|---|
| Courses and lessons | New product type in `catalog`; entitlements already generalise |
| Memberships and subscriptions | Recurring price on product variant; ledger already supports periodic accrual |
| Communities | New module; consumes `identity` and `entitlement` |
| Appointments and bookings | New product type + `availability` module |
| Advanced CRM, segments, sequences | New module reading `customers` and `orders` events |
| Email marketing | New module consuming domain events |
| Physical products, shipping, inventory | New product type + `fulfilment` adapter |
| Multi-currency selling per product | Price becomes currency-keyed; ledger is already multi-currency |
| Public developer API, webhooks out, OAuth apps | `/api/v1` exists in M1 for internal use and is versioned from day one |
| Team seats billing, enterprise SSO, audit export | `workspace_members` and `audit_logs` already model it |
| Mobile apps | API-first boundaries make this additive |

The obligation this table creates: **every M1 design decision must be checked against it.** If a
choice in M1 would force a rewrite to add a row from this table, the choice is wrong.

---

## 4. Non-goals

Things we are actively choosing *not* to be, so the product does not drift:

- Not a website builder. The storefront is a commerce surface, not a canvas.
- Not a payment processor. We orchestrate a licensed provider; we never hold funds as principal.
- Not a marketplace. There is no CreatorHub-wide product discovery. Each creator owns their audience.
- Not a CRM or an email service provider.
- Not an AI chat product.

---

## 5. Delivery slices

M1 ships as vertical slices, each independently reviewable and each meeting the Definition of
Done. Order is chosen so that the highest-risk, hardest-to-retrofit work lands first and the
riskiest money movement lands last.

| # | Slice | Rationale for position |
|---|---|---|
| 0 | Repo, CI, tooling, design tokens, primitive UI layer | Nothing is reviewable without it |
| 1 | Identity, workspace, tenancy + RLS, audit log | Every other slice depends on tenant isolation |
| 2 | **Ledger, outbox, idempotency** | Hardest to retrofit; all money flows through it |
| 3 | Catalogue: products, variants, assets, pricing | Nothing to sell without it |
| 4 | Storefront: routing, theming, SSR product pages, SEO | Public surface; validates tenant resolution |
| 5 | Checkout + payment adapter + webhooks | First real money; exercises slices 1–4 |
| 6 | Fulfilment: entitlements, signed downloads, delivery email | Completes the buyer's loop |
| 7 | Customers and orders management | Creator's operational surface |
| 8 | Affiliate: programme, links, click tracking, attribution | Depends on checkout being correct |
| 9 | Affiliate commission accrual, holds, clawback | Depends on ledger + attribution |
| 10 | Analytics + AI surfaces | Reads everything above |
| 11 | **Payout execution** (gated) | Money leaving the system; last for a reason |

Slice 2 before slice 5 is the most important ordering decision in this document. Building
checkout before the ledger would produce money code we would then have to rewrite.

### Why payout execution is gated

Accruing a balance is a database write we fully control. Sending money out is irreversible,
regulated, tax-relevant, and the primary fraud target on any affiliate platform. It ships only
when all of the following hold:

- Ledger reconciliation against the provider balance runs clean for a sustained period
- Self-referral and collusion detection is active and tested
- Hold-period and clawback logic is verified against real refund and chargeback events
- Payout operations have a documented reversal and incident runbook
- The operating entity's payout obligations (KYC, tax reporting) are confirmed for its jurisdiction

Until then M1 shows accurate accrued balances, which is honest and useful, rather than a button
that moves real money on new code.

---

## 6. Definition of done for the milestone

M1 is complete when an external person, with no help from us, can:

1. Sign up, create a workspace, and publish a storefront on a custom domain
2. Upload and price a digital product
3. Receive a real card payment from a third party, with tax correctly collected
4. Have that buyer receive the file automatically via a secure, expiring link
5. Refund that order and see the buyer's access revoked and the ledger balanced
6. Invite an affiliate, who generates a link, drives a click, and converts a sale
7. See that commission accrue, be held, and be clawed back correctly when the sale is refunded
8. Read accurate revenue, traffic, and payout-balance analytics derived from the ledger

...and every slice satisfies the [Definition of Done](../engineering/definition-of-done.md).

---

## 7. Open items

Tracked here rather than assumed. None blocks foundation work.

| # | Item | Needed by | Owner |
|---|---|---|---|
| 1 | Country of the operating entity — determines payment provider eligibility and payout rules | Slice 5 | Founder |
| 2 | Platform fee model: percentage, flat, subscription, or hybrid | Slice 2 (ledger account design accommodates all; the number is needed at slice 5) | Founder |
| 3 | Root domain for storefront subdomains | Slice 4 | Founder |
| 4 | Brand name lock, wordmark, and legal entity name | Slice 0 (design), slice 5 (receipts) | Founder |
| 5 | Whether affiliates are CreatorHub-wide identities or per-workspace | Slice 8 — recommendation: per-workspace in M1, with a nullable `user_id` so cross-workspace identity is additive | Engineering |
