# Architecture Decision Records

An ADR records a decision that is **expensive to reverse**. If a choice can be changed in an
afternoon, it belongs in code review, not here.

The manifesto requires that technology be chosen on merit and that the reasoning be written down.
These documents are that record. They are also the answer to the question a new engineer asks in
their second week: *"why is it like this?"*

## Index

| # | Decision | Status |
|---|---|---|
| [0001](./0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](./0002-modular-monolith.md) | Modular monolith over microservices | Accepted |
| [0003](./0003-typescript-everywhere.md) | TypeScript across the whole stack | Accepted |
| [0004](./0004-nextjs-app-router.md) | Next.js App Router as the web framework | Accepted |
| [0005](./0005-postgres-and-drizzle.md) | PostgreSQL with Drizzle ORM | Accepted |
| [0006](./0006-self-hosted-auth.md) | Self-hosted authentication | Accepted |
| [0007](./0007-payment-provider-port.md) | Provider-agnostic payments | Accepted, first adapter amended by [0016](./0016-razorpay-first-adapter.md) |
| [0008](./0008-double-entry-ledger.md) | Double-entry ledger as the financial source of truth | Accepted |
| [0009](./0009-postgres-queue-and-outbox.md) | Postgres-backed jobs with a transactional outbox | Accepted |
| [0010](./0010-ai-gateway.md) | AI as a platform module, not a feature | Accepted |
| [0011](./0011-own-design-system.md) | Own design system on unstyled primitives | Accepted |
| [0012](./0012-multi-tenancy.md) | Two-layer tenant isolation | Accepted |
| [0013](./0013-monorepo.md) | pnpm workspaces with Turborepo | Accepted |
| [0014](./0014-hosting.md) | Managed hosting with a portability constraint | Accepted |
| [0015](./0015-local-postgres.md) | Postgres in Docker Compose locally, Testcontainers in tests | Accepted |
| [0016](./0016-razorpay-first-adapter.md) | Razorpay is the first payment adapter, and the entity is Indian | Accepted |

## Format

Each record carries: **Context** (the forces at play), **Options considered** (with honest
trade-offs, including for the option we rejected), **Decision**, **Consequences** (including the
bad ones), and **Revisit when** (the concrete signal that should reopen the question).

That last section matters most. A decision without a stated expiry becomes dogma.

## Status values

`Proposed` · `Accepted` · `Deprecated` · `Superseded by ADR-XXXX`

Records are immutable once accepted. A changed mind produces a new ADR that supersedes the old one;
the original stays, because the reasoning that was true at the time is part of the history.
