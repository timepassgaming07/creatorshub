# CreatorHub

**The operating system for digital businesses.**

CreatorHub removes the technical barriers between expertise and income. One workspace where anyone
can build, run, and grow a digital business — without developers, designers, or a dozen disconnected
tools.

> Slice 0 is complete: the monorepo, toolchain, CI, design tokens, money primitives, and the
> Next.js shell all build and verify green. Slice 1 — identity, workspace, tenancy — is next.
> See [Status](#status) and [STATE.md](./STATE.md).

---

## What we're building first

Milestone 1 is deliberately focused: **a complete digital commerce platform for creators.**

The success condition is one sentence:

> A creator with no technical skill can go from signing up to receiving real money from a real
> customer, and can recruit other people to sell on their behalf and be paid for it.

In scope: workspaces and identity, a branded storefront on a custom domain, digital products,
checkout with real payments, automatic delivery, customers, orders, analytics, a full affiliate
programme, and the AI foundation.

Deliberately out of scope for M1: courses, memberships, communities, bookings, CRM, email marketing.
Each has a documented seam for later — see the [scope contract](./docs/product/milestone-1.md).

---

## Documentation

Read in this order.

| # | Document | What it answers |
|---|---|---|
| 0 | [manifesto.md](./manifesto.md) | Product vision. **Highest authority in this repository.** |
| 1 | [Milestone 1 scope](./docs/product/milestone-1.md) | What ships first, what waits, and why |
| 2 | [Architecture](./docs/architecture/overview.md) | System shape, module boundaries, the money path |
| 3 | [Data model](./docs/architecture/data-model.md) | Every M1 table, with the reasoning |
| 4 | [Decision records](./docs/adr/README.md) | Why the stack and architecture are what they are |
| 5 | [Coding standards](./docs/engineering/coding-standards.md) | How to write code here |
| 6 | [Definition of done](./docs/engineering/definition-of-done.md) | The merge gate |
| 7 | [Testing strategy](./docs/engineering/testing.md) | What gets tested and how heavily |
| 8 | [Security standards](./docs/engineering/security.md) | Threat model and controls |
| 9 | [Design system](./docs/design/design-system.md) | The visual and interaction language |

---

## Architecture at a glance

**Modular monolith, TypeScript end to end, PostgreSQL, double-entry ledger.**

```
apps/web            Next.js — dashboard, storefronts, affiliate portal, /api/v1
packages/domain     business logic — no framework, no database imports
packages/contracts  zod schemas — the shared vocabulary
packages/db         drizzle schema, migrations, tenant-scoped repositories
packages/payments   PaymentProvider port + adapters
packages/ai         LLM gateway — prompts, cost accounting, evals
packages/ui         design system — tokens, primitives, patterns
packages/jobs       Postgres queue + transactional outbox
```

The five decisions that shape everything else:

1. **[Modular monolith](./docs/adr/0002-modular-monolith.md)** — one deployable, hard module
   boundaries enforced at compile time. A purchase updates an order, five ledger entries, an
   entitlement, and a commission in one database transaction.
2. **[Double-entry ledger](./docs/adr/0008-double-entry-ledger.md)** — all money flows through it,
   append-only, balanced by a database constraint. Balances are always derived, never stored.
3. **[Two-layer tenant isolation](./docs/adr/0012-multi-tenancy.md)** — tenant-scoped repositories
   *and* Postgres RLS. A leak requires two independent failures at once.
4. **[Provider-agnostic payments](./docs/adr/0007-payment-provider-port.md)** — the domain never
   names a payment provider. Stripe Connect is the first adapter.
5. **[Postgres queue with a transactional outbox](./docs/adr/0009-postgres-queue-and-outbox.md)** —
   a payment side-effect cannot be lost, because enqueueing is part of the same commit.

---

## Status

Slice 0 complete. Slice 1 next. Live detail in [STATE.md](./STATE.md).

| Slice | Status |
|---|---|
| 0 · Repo, CI, tooling, design tokens, money primitives, app shell | Complete |
| 1 · Identity, workspace, tenancy, audit log | Next |
| 2 · Ledger, outbox, idempotency | Planned |
| 3 · Catalogue | Planned |
| 4 · Storefront | Planned |
| 5 · Checkout and payments | Planned |
| 6 · Fulfilment | Planned |
| 7 · Customers and orders | Planned |
| 8–9 · Affiliate programme and commission | Planned |
| 10 · Analytics and AI surfaces | Planned |
| 11 · Payout execution (gated) | Planned |

Slice 2 before slice 5 is the most important ordering decision in the project: building checkout
before the ledger would produce money code we'd then rewrite.

---

## Open questions

Tracked in the [scope contract](./docs/product/milestone-1.md#7-open-items). None blocks slice 0.

The one that matters soonest: **the operating entity's country**, which determines payment provider
eligibility and cross-border payout rules. Needed before slice 5 wires live credentials.

---

## Getting started

Requires Node 24 (see `.nvmrc`) and pnpm 11. pnpm is pinned by the `packageManager` field, so
Corepack installs the exact version.

```bash
corepack enable                 # once, per machine
pnpm install
pnpm verify                     # typecheck, lint, unit tests, format check
pnpm build                      # all packages, then the app
pnpm dev                        # http://localhost:3000
```

Browser tests need Chromium installed once:

```bash
pnpm --filter @creatorhub/web exec playwright install chromium
pnpm test:e2e                   # builds the app, then runs e2e + axe
```

| Command | What it does |
|---|---|
| `pnpm verify` | The gate. Everything CI's `verify` job runs. |
| `pnpm test` | Unit tests across all packages |
| `pnpm test:e2e` | Playwright, including the axe accessibility specs |
| `pnpm format` | Rewrites formatting |

No environment variables are required yet. Slice 1 introduces the database and auth configuration,
and this section gains a `.env.example`.

---

## Contributing

Read the [manifesto](./manifesto.md) first, then the
[coding standards](./docs/engineering/coding-standards.md) and the
[definition of done](./docs/engineering/definition-of-done.md).

Two rules worth stating up front:

- **Money-path changes require a second reviewer.** It is the only mandatory two-person gate.
- **Architectural decisions get an ADR.** If a competent engineer arriving in a year would be
  puzzled by a constraint, and guessing wrong would be costly, write it down.
