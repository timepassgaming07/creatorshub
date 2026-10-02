# STATE

**Last updated:** 2026-10-02
**Branch:** `claude/dreamy-darwin-klduun` (launch-readiness pass, not yet merged)

This file is the live position of the project. `README.md` says what CreatorHub is, `CLAUDE.md` says
how to work here, the ADRs say why the architecture is what it is. This says where we are.

---

# Current Status

The slices below were built first. A launch-readiness pass on this branch then walked every creator
and buyer journey in a real browser against real Postgres, and rebuilt what did not work end to end:
the buyer path (checkout, verified payment, signed downloads, receipts), the dashboard (home,
products, orders, refunds, customers, storefront editor, discounts, settings, affiliates, payouts,
analytics), the AI copilot on Claude, the public site (landing, pricing, legal, errors), and the
operator commands that settle payouts.

| Gate | Result on this branch |
|---|---|
| `pnpm verify` (typecheck, lint, unit tests, build, exports, format) | Green. Lint was 573 errors before this pass |
| Unit tests | 1,053 across 75 files |
| `pnpm test:integration` (db) | 401 across 27 files, against Postgres 18 in Testcontainers |
| `pnpm test:e2e` | 56 Playwright tests, desktop and mobile, axe clean in light and dark on home, auth, pricing, legal, and 404 |

## Before launch

These are open, and each one is a decision or a task, not a bug report:

1. **Money still collects in the platform account.** ADR-0020's Route onboarding is not built, so
   creators are paid through operator-settled payouts. Get legal advice on holding merchant funds
   (RBI payment-aggregator rules) before taking live payments at volume. See
   [ADR-0021](./docs/adr/0021-tenant-before-sign-in.md).
2. **Settlement is operator-run, one workspace at a time** (`pnpm operator`). A cross-tenant queue
   needs a separate privileged role, which is the owner's call (ADR-0021).
3. **Plans are not billed or enforced.** Pricing lists Starter, Pro, and Team, but nothing charges
   the subscription or switches the fee rate.
4. **Legal pages are a starting text.** Fill `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL`,
   and have a lawyer review them.
5. **Money-path changes on this branch need the second reviewer** the definition of done requires:
   payouts and their ledger postings, refunds, affiliate settlement, and the analytics rewrite.
6. **Production configuration.** `.env.example` lists every variable; production refuses to start
   without the required ones.

---

# Completed Tasks

Slice 0, all items: foundation, monorepo tooling, design tokens, contracts, telemetry, and repo configuration.

Slice 1 (Identity, workspace, tenancy, audit log):
- [x] **1.1** `packages/db` — config validated at boot, pooled client, `withWorkspace`, migration runner with an advisory lock, Testcontainers harness
- [x] **1.2** Schema — `users`, `workspaces`, `workspace_members`, `audit_logs`, with citext, UUIDv7, one-owner index, and audit history protected by `ON DELETE restrict`
- [x] **1.3** RLS on all four tables, `ENABLE` plus `FORCE`, `USING` and `WITH CHECK`, and `audit_logs` append-only at both the policy and privilege level
- [x] **1.4** Tenant-scoped repository base, plus the first repository as the worked example
- [x] **1.5** Tenancy CI check reading the live catalogue, wired into the integration job
- [x] **1.6** Better Auth against the third role: Argon2id, sessions, verification, password reset, CSRF via trusted origins, revocation and device list
- [x] **1.7** Passkeys via `@better-auth/passkey`. Migration `0007_passkeys.sql` isolated to `creatorhub_auth`, WebAuthn options and credential management
- [x] **1.8** Authorisation policy in `packages/domain`. Closed permission union, exhaustive role table, workspace checked before role
- [x] **1.11** Authentication screens, workspace onboarding, member governance, and server actions with policy and audit log wiring
- [x] **1.12** Isolation suite with a registry and a completeness check
- [x] **1.13** Core UI primitives (Button, Input, Select, Dialog, Toast, Skeleton) on Radix primitives
- [x] **1.14** CSP investigation and recorded deferral ([ADR-0019](./docs/adr/0019-csp-deferred.md))

Slice 2 (Ledger, outbox, idempotency):
- [x] **2.1** Schema: `ledger_accounts`, `ledger_transactions`, `ledger_entries`
- [x] **2.2** Deferred constraint trigger enforcing debits equal credits per transaction (`verify_ledger_transaction_balanced`)
- [x] **2.3** Rules rejecting `UPDATE` and `DELETE` on `ledger_entries` (`block_ledger_entries_mutation_trigger` and role revocation)
- [x] **2.4** Ledger service: post a balanced transaction, derive a balance, never store one
- [x] **2.5** Property-based test suite for balance invariants (`fast-check` proving conservation of money, idempotency replay, and compensating refund invariants)
- [x] **2.6** Schema: `outbox`, and the publisher using `FOR UPDATE SKIP LOCKED`
- [x] **2.7** Schema: `jobs`, worker loop, retry with backoff, dead-letter handling
- [x] **2.8** Schema: `idempotency_keys`, and the middleware that enforces them
- [x] **2.9** Reconciliation job comparing derived balances against a materialised rollup

Slice 3 (Catalogue & digital asset pipeline):
- [x] **3.1** Schema: `products`, `product_variants`, `assets`, `product_assets`
- [x] **3.2** `packages/storage` — storage port, plus adapters (`MemoryStorageDriver` and `S3StorageDriver` AWS SigV4 presigner)
- [x] **3.3** Upload flow: presigned direct upload, size and content-type validation by inspection (`AssetStorageService`, `detectMimeType`, `validateMimeType`)
- [x] **3.4** Malware scanning; an asset is not deliverable until marked clean (`HeuristicMalwareScanner`, `AssetNotDeliverableError`, `assertAssetDeliverable`, `updateAssetScanStatus`)
- [x] **3.5** Pricing model, including the currency decision per workspace (`resolveEffectivePrice`, `validateProductPricing`, `calculateSavings`)
- [x] **3.6** Schema and rules for `discounts` (`discounts`, `discount_products`, `evaluateDiscount`, repository, and integration suite)
- [x] **3.7** Product create, edit, and publish screens (server actions with RBAC and audit logging, product list, create form, and detail/edit/publish screens)
- [x] **3.8** Asset management interface with upload progress and failure recovery (`AssetUploader`, direct presigned upload, deliverability validation, and workspace asset management)

Slice 4 (Storefront & Edge routing):
- [x] **4.1** Schema: `storefronts`, including domain and subdomain columns (`storefronts`, `citext` subdomains, custom domains, theme preferences, and RLS tenant policies)
- [x] **4.2** Hostname-to-workspace resolution in middleware (edge routing library `hostname.ts`, middleware subdomain/custom-domain URL rewriting, CSP preservation, `resolveStorefrontByHostname`, public loaders, and server actions)
- [x] **4.3** Custom domain verification and certificate provisioning (DNS TXT/CNAME challenge validation `domain-verification.ts`, token generator, `initiateCustomDomainAction`, `verifyCustomDomainAction`, `removeCustomDomainAction`, audit logging)
- [x] **4.4** Server-rendered storefront home and product detail pages (`/s/[subdomain]`, `/c/[domain]`, `/s/[subdomain]/p/[slug]`, `/c/[domain]/p/[slug]`, `StorefrontHeader`, `StorefrontHero`, `ProductGrid`, `ProductCard`, `ProductDetailView`, `StorefrontFooter`)
- [x] **4.5** Theme presets applied as token overrides (`theme.ts`, `StorefrontThemeProvider`, WCAG contrast calculation, font family stacks, and layout preset grids)
- [x] **4.6** SEO: metadata, Open Graph, structured data, sitemap, robots (`seo.ts`, dynamic `generateMetadata`, JSON-LD `WebSite`/`Product`/`Offer`, `sitemap.xml`, `robots.txt`)
- [x] **4.7** `storefront_events` capture for analytics (`storefront_events` schema & migration `0016`, `/api/events` beacon ingestion, `StorefrontTelemetry` component, UTM and referrer attribution)
- [x] **4.8** Storefront editor with live preview (`/workspaces/[id]/storefront`, `LivePreviewFrame` device switcher, `ThemeCustomizer`, `DomainSettings` DNS records, `StorefrontEditor` orchestrator, `getStorefrontEditorDataAction`, unit tests)

Slice 5 (Checkout, payments, refunds & disputes):
- [x] **5.1** `packages/payments` — the `PaymentProvider` port and its domain-level contract (`@creatorhub/payments` with `PaymentProvider` port, domain error hierarchy, `MemoryPaymentProvider` adapter, HMAC webhook verification, domain event translation, and `paymentProviderConformanceTests` test harness)
- [x] **5.2** Schema: `orders`, `order_items`, `order_transitions`, `payments`, `payment_accounts` (migration `0017`, Drizzle schemas, RLS tenant isolation, `orders` and `payments` repositories, exact integer minor units, and database integration suites)
- [x] **5.3** Order state machine with explicit, tested transitions (`packages/domain/src/orders/state-machine.ts`, deterministic order and payment lifecycle graphs, actor transition authorization, terminal predicates, and unit test suite)
- [x] **5.4** Server-authoritative pricing: totals computed from server state only (`packages/domain/src/orders/pricing.ts`, server catalog price resolution, zero-float proportional discount allocation, basis-point tax computation, line-item sum invariant, and unit test suite)
- [x] **5.5** Indian GST calculation rules (intra-state CGST + SGST vs inter-state IGST, HSN codes, reverse-charge exempt status, and unit tests)
- [x] **5.6** Checkout session creation, client-side payment flow, and order confirmation (`checkout-actions.ts`, `/checkout/[orderId]`, `PaymentElement`, status polling, and verification)
- [x] **5.7** Webhook ingestion: signature verification, deduplication, idempotency, and state transition processing (`/api/webhooks/[provider]`, `webhook_events` schema & migration `0018`, automated order transition to `paid`, and ledger posting)
- [x] **5.8** Refund lifecycle with ledger compensating entries and receipt generation (`refund-actions.ts`, `refunds` repository, `postRefundLedgerTransaction`, zero-float pro-rated tax and discount reversals, and unit tests)
- [x] **5.9** Dispute & chargeback lifecycle (`disputes` repository, migration `0020`, evidence submission, ledger dispute hold postings, and resolution transitions)

Slice 6 (Digital Fulfilment & Access Delivery):
- [x] **6.1** Time-limited, signed download tokens for purchased digital assets (`packages/domain/src/fulfillment/tokens.ts`, HMAC-SHA256 URL-safe signatures, expiration & download count policy, tampering prevention, unit tests)
- [x] **6.2** Schema: `fulfillment_tokens`, `asset_downloads` (migration `0021_fulfillment_tokens.sql`, Drizzle schema, composite indexes, RLS tenant isolation, repositories, and integration suite)
- [x] **6.3** Streaming asset delivery with resume & byte-range support (`/api/fulfillment/download/[token]`, `Range` header parsing, `206 Partial Content`, signed token verification, and download count increment)
- [x] **6.4** Order fulfillment pipeline: token generation, customer notification, and delivery receipt (`order-fulfillment.ts`, multi-product token generation, and `EmailService` receipt delivery)
- [x] **6.5** Customer fulfillment download portal (`/fulfillment/[token]`, `FulfillmentPortalView.tsx`, file metadata display, direct download action, and error states)
- [x] **6.6** Creator order inspection & fulfillment resend interface (`/workspaces/[id]/orders/[orderId]`, `OrderDetailView.tsx`, active download tokens table, token revocation, manual resend delivery action)

Slice 7 (Customer CRM, Relationship Ledger & Buyer Directory):
- [x] **7.1** Schema: `customers` and `customer_notes` (migration `0022_customers_and_notes.sql`, workspace-scoped unique email index, Drizzle schema, RLS tenant isolation, `customers` repository, and integration suite)
- [x] **7.2** Customer order fulfillment synchronization: automatic upsert on order payment, lifetime value (LTV) accrual, order count increment, and first/last seen timestamps (`order-fulfillment.ts`)
- [x] **7.3** Customer management server actions (`customer-actions.ts`, `listCustomersAction`, `getCustomerDetailAction`, `updateCustomerAction`, `addCustomerNoteAction`, `deleteCustomerNoteAction`, `exportCustomersCsvAction`, RBAC authorization, audit logging)
- [x] **7.4** Creator customer directory UI (`CustomerDirectoryView.tsx`, `/workspaces/[id]/customers`, search by name/email/phone, sorting by LTV/orders/recency, pagination, sanitized CSV export)
- [x] **7.5** Customer profile & purchase history detail UI (`CustomerProfileView.tsx`, `/workspaces/[id]/customers/[customerId]`, financial metrics header, chronological orders table, customer notes timeline, add note dialog)

Slice 8 (Affiliate Programme, Link Attribution & Referral Ledger):
- [x] **8.1** Domain attribution engine (`packages/domain/src/affiliates/attribution.ts`, last-touch attribution, 1-365 day configurable attribution window, self-referral prevention, commission basis points computation)
- [x] **8.2** Schema: `affiliate_programs`, `affiliates`, `affiliate_links`, `affiliate_clicks`, `attributions` (migration `0022_affiliates_and_attribution.sql`, Drizzle schema, RLS tenant isolation)
- [x] **8.3** Affiliates repository (`packages/db/src/repositories/affiliates.ts`, program management, affiliate directory, link generator, click tracking, order attribution)
- [x] **8.4** Storefront click tracking & referral cookie persistence (`/api/affiliate/click`, `ref` parameter capture, 30-day HttpOnly cookie)
- [x] **8.5** Checkout attribution integration: automatic referral linkage, commission computation, and double-entry ledger accrual (`order-fulfillment.ts`)
- [x] **8.6** Affiliate management server actions (`getAffiliateProgramAction`, `updateAffiliateProgramAction`, `listAffiliatesAction`, `createAffiliateLinkAction`, `exportAffiliatesCsvAction`)
- [x] **8.7** Creator affiliate dashboard (`AffiliateProgramView.tsx`, `/workspaces/[id]/affiliates`, commission rate slider, cookie window, promoter directory, approval workflow)
- [x] **8.8** Public promoter portal (`AffiliatePortalView.tsx`, `/affiliate/[code]`, copyable referral link, conversion funnel metrics, attribution activity ledger)
- [x] **8.9** RBAC authorization: `affiliate.view`, `affiliate.manage` permissions, audit logging for link generation, status changes, and settings updates

Slice 9 (Commission, holds, and clawback):
- [x] **9.1** Pure domain commission state machine (`packages/domain/src/commissions/state-machine.ts`, transitions `held -> vested -> paid`, `held/vested -> clawed_back`, pro-rated clawback calculation, hold window clamping $\ge$ refund window, unit test suite with 11 tests)
- [x] **9.2** Schema: `commissions` and `commission_clawbacks` (migration `0023_commissions_and_clawbacks.sql`, unique attribution constraint, foreign keys, composite indexes, RLS tenant isolation)
- [x] **9.3** Commissions repository (`packages/db/src/repositories/commissions.ts`, `createCommission`, `releaseHeldCommissions`, `applyClawback`, `getAffiliateLedgerBreakdown`, integration test suite against PostgreSQL 18)
- [x] **9.4** Order fulfillment integration: automatic commission creation on checkout capture with refund window hold constraint (`apps/web/src/lib/order-fulfillment.ts`)
- [x] **9.5** Refund fulfillment integration: automatic pro-rated and full clawback execution on order refund with `affiliate_payable` double-entry ledger debit posting (`apps/web/src/lib/refund-fulfillment.ts`)
- [x] **9.6** Commission server actions (`apps/web/src/lib/commission-actions.ts`, `listCommissionsAction`, `getAffiliateFinancialBreakdownAction`, `releaseVestedCommissionsAction`, `applyClawbackAction`, RBAC authorization, audit logging)
- [x] **9.7** Creator Commissions & Holds dashboard UI (`AffiliateProgramView.tsx`, "Commissions & Holds" tab, batch vesting release button with feedback toast, hold maturation countdowns, clawback status badges, clawback dialog)
- [x] **9.8** Public promoter financial breakdown UI (`AffiliatePortalView.tsx`, real-time Held vs Vested vs Paid balance cards, commission ledger timeline with maturation countdowns)
- [x] **9.9** Verification: 131 web tests passing, 199 domain tests passing, 30/30 turbo tasks green, integration suite verified against PostgreSQL 18

Slice 10 (Analytics, telemetry, and AI copywriting surfaces):
- [x] **10.1** Ledger-derived financial analytics queries (`packages/db/src/repositories/analytics.ts`, Gross GMV, Net Creator Sales after refunds, Tax collected, Affiliate expense, AOV, zero-float `bigint` precision)
- [x] **10.2** Storefront telemetry and conversion funnel engine (`uniqueVisitors`, `productViews`, `checkoutStarted`, `ordersCompleted`, step drop-off bps calculation, daily time-series)
- [x] **10.3** Product & Affiliate promoter performance matrices with sanitized CSV export (`listProductPerformance`, `listAffiliatePerformance`, `exportAnalyticsCsvAction`)
- [x] **10.4** `@creatorhub/ai` package: `AiGateway`, `MemoryAiProvider` (deterministic, offline-first fallback), Zod structured output validation with 1-retry fallback, and token cost accounting
- [x] **10.5** Versioned prompt registry (`packages/ai/src/prompts/registry.ts`, `product_copy_v1`, `storefront_copy_v1`, `seo_metadata_v1`, `analytics_insights_v1`, `email_campaign_v1`)
- [x] **10.6** Schema: `ai_usage` table (migration `0024_ai_usage_and_analytics.sql`, RLS tenant isolation, monthly quota enforcement 250k tokens, token and micro-cent cost accounting)
- [x] **10.7** AI server actions (`apps/web/src/lib/ai-actions.ts`, `generateProductCopyAction`, `generateStorefrontCopyAction`, `generateSeoMetadataAction`, `generateAnalyticsInsightsAction`, `getAiUsageSummaryAction`, RBAC `ai.generate`, audit logging)
- [x] **10.8** Analytics server actions (`apps/web/src/lib/analytics-actions.ts`, `getWorkspaceAnalyticsAction`, `getProductPerformanceAction`, `getAffiliatePerformanceAction`, `exportAnalyticsCsvAction`, RBAC `analytics.view`, audit logging)
- [x] **10.9** Modern creator UI surfaces:
  - `AnalyticsDashboardView.tsx` (`/workspaces/[id]/analytics`, timeframe selector `7d`/`30d`/`90d`/`ytd`/`all`, KPI cards, interactive SVG time-series chart, 4-stage funnel visualizer, product & affiliate performance tables, 1-click **AI Executive Growth Briefing**)
  - `AiCopilotModal.tsx` (reusable multi-mode copywriting drawer with tone picker, live shimmer, and 1-click "Apply to Form" integration)
  - Embedded AI Copywriting into `/workspaces/[id]/products/new` and `/workspaces/[id]/storefront`
  - Workspace Hub Navigation updated with **Analytics & AI Intelligence Hub** module card

---

# Active Task

Merge the launch-readiness branch, then work through "Before launch" above, starting with the
Route onboarding decision.

---

# Remaining Roadmap

| Slice | Goal | State |
|---|---|---|
| 0 | Foundation | **Complete** |
| 1 | Identity, workspace, tenancy, audit log | **Complete** |
| 2 | Ledger, outbox, idempotency | **Complete** |
| 3 | Catalogue | **Complete** |
| 4 | Storefront | **Complete** |
| 5 | Checkout and payments | **Complete** |
| 6 | Fulfilment | **Complete** |
| 7 | Customers and orders | **Complete** |
| 8 | Affiliate programme and attribution | **Complete** |
| 9 | Commission, holds, and clawback | **Complete** |
| 10 | Analytics and AI Surfaces | **Complete** |
| 11 | Payout Execution, Beneficiary Accounts & Creator/Promoter Settlement | **Complete** |

**Nothing that writes money merges before slice 2 is complete.** (Slice 2 ledger integrity is fully complete and enforced across all payment, refund, dispute, commission, and payout flows).

---

# Architectural Decisions

ADRs: [0015](./docs/adr/0015-local-postgres.md),
[0016](./docs/adr/0016-razorpay-first-adapter.md),
[0017](./docs/adr/0017-authentication-database-role.md),
[0018](./docs/adr/0018-email-verification-two-columns.md),
[0019](./docs/adr/0019-csp-deferred.md),
[0020](./docs/adr/0020-sub-merchant-onboarding.md),
[0021](./docs/adr/0021-tenant-before-sign-in.md).

### Two-Person Maker-Checker Rule for Payout Disbursements (Slice 11 §11.4)
In multi-member workspaces ($N \ge 2$), no creator can approve their own requested payout ($\text{requestedBy} \ne \text{approvedBy}$). Only an Admin or Owner who did not initiate the request may approve the disbursement. In single-member workspaces ($N = 1$), self-approval is bounded by a ₹5,00,000 velocity threshold.

### Double-Entry Balanced Payout Postings & Compensating Reversals (Slice 11 §11.1)
On payout approval, funds are debited from `creator_payable` / `affiliate_payable` and credited to `processor_clearing`. If a payout fails at the banking layer (e.g., account closed), an automatic balanced compensating reversal is posted:
$\text{Debit: processor\_clearing} = \text{Credit: creator\_payable}$.

### Beneficiary Safety Cooldown (Slice 11 §11.1)
Newly registered bank accounts and UPI VPAs are subject to a 24-hour safety review window for high-value payouts (> ₹50,000.00), preventing unauthorized exfiltration upon compromised credentials.

### Hold Period Invariant for Affiliate Commissions (Slice 9)
Commission hold periods are strictly clamped to at least the workspace refund window:
$\text{heldUntil} = \max(\text{orderDate} + \text{holdPeriodDays}, \text{orderDate} + \text{refundWindowDays})$.
This guarantees that affiliate earnings cannot be vested or disbursed to promoters before the customer's refund eligibility window has fully lapsed.

### Double-Entry Compensating Postings for Commission Clawbacks (Slice 9)
When an order is refunded, any associated affiliate commission is pro-rated and clawed back. The balanced refund ledger posting debits `affiliate_payable` and credits processor clearing cash outflow, perfectly balancing the accounts:
$\text{Debit: customer\_refunds\_expense} + \text{Debit: tax\_payable} + \text{Debit: affiliate\_payable} = \text{Credit: processor\_clearing}$.

### Ledger-Derived Financial Analytics Invariant (Slice 10)
All analytics revenue, fee, and refund figures derive strictly from transactional order and refund tables (`orders`, `refunds`, `commissions`) or `ledger_entries`, guaranteeing zero-float `bigint` minor-unit precision and complete alignment with the double-entry ledger.

### Offline-First AI Gateway Fallback (Slice 10)
`@creatorhub/ai` provides a resilient gateway abstraction with `MemoryAiProvider` as a deterministic default when no external LLM key is configured. This guarantees that automated CI builds, local developer environments, and offline eval test suites run without external network dependencies.

### Tenant Isolation Enforced Twice
Every table is scoped by `workspace_id` and protected by both explicit repository filtering and PostgreSQL Row Level Security (`FORCE ROW LEVEL SECURITY`, `USING (workspace_id = app_current_workspace_id())`).

---

# Technical Debt & Minor Non-Blockers

1. **CSP Nonce Automation (Deferred)**:
   - Evaluated in ADR-0019; deferred to edge proxy hardening milestone.
2. **Unused pre-tenant resolvers**: `resolveDownloadGrantByTokenHash` and
   `resolveAffiliateLinkByCode` on the database client are no longer called and return nothing
   under `FORCE` RLS. Remove them (ADR-0021).
3. **Superseded file names in the slice history**: the launch-readiness pass replaced several
   files the task list above names (`AiCopilotModal`, `commission-actions.ts`, the old storefront
   components). The list records what each slice delivered at the time.
4. **Dynamic Route Middleware Deprecation Notice**:
   - Next.js 16 emits a deprecation advisory to rename `middleware.ts` to `proxy.ts`. Kept backward-compatible until Next.js 17.
