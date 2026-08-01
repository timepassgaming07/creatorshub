# ADR-0014 — Managed hosting with a portability constraint

**Status:** Accepted
**Date:** 2026-07-27

## Context

CreatorHub needs: a Next.js application with server rendering, a Postgres database with branching
for preview environments, object storage for creator files, a CDN for storefronts, background
workers, and wildcard plus custom domain support with automatic TLS.

The founder's direction is to design for production from day one without premature enterprise
complexity. The manifesto names vendor lock-in and operational cost as explicit evaluation criteria.
There is no ops team.

## Options considered

**Self-managed on raw cloud VMs or Kubernetes.** Maximum control and lowest per-unit cost at scale.
Rejected for this stage: it converts a product engineering effort into an infrastructure one. With
no ops team, we would be running our own Postgres failover, TLS issuance, and CDN configuration —
work that produces zero customer value at our volume.

**Fully managed PaaS with a proprietary runtime.** Excellent developer experience. Rejected as an
architectural commitment, though partly adopted as a deployment choice — see below.

**Managed services, chosen so each is individually replaceable.** Adopted.

## Decision

**Managed services, with one hard constraint: no proprietary runtime primitive may appear in
application code.**

| Concern | Choice | Why replaceable |
|---|---|---|
| Application hosting | Vercel | Next.js runs on any Node host; deployment config is not application code |
| Database | Managed Postgres with branching (Neon or equivalent) | Plain Postgres, no proprietary extensions; `pg_dump` is the exit |
| Object storage | S3-compatible (Cloudflare R2 or S3) | Behind our `ObjectStorage` port; S3 API is a de facto standard |
| CDN | Provider default | Configuration, not code |
| Email | Transactional provider behind our `Mailer` port | One adapter |
| Observability | Managed (Sentry + OpenTelemetry-compatible tracing) | OTel is vendor-neutral by design |

### The constraint, concretely

Application code uses standard Node and Web APIs. It does **not** use edge-runtime-only KV stores,
platform-specific queue primitives, proprietary cron syntax, or per-request platform globals.
Everything platform-shaped lives in an adapter or in deployment configuration.

The test: *could this application run on a plain Node host with a Postgres URL and an S3 endpoint?*
If a change makes the answer no, the change is wrong.

This is why the queue is Postgres-backed (ADR-0009) rather than a platform queue, why auth is
self-hosted (ADR-0006), and why storage sits behind a port. Each of those decisions was made partly
to keep this answer yes.

### Why Vercel despite the lock-in concern

The lock-in that matters is **data and identity** — users, money, and files. Vercel holds none of
those; it runs stateless application code. Migrating hosts is a redeploy. Migrating an identity
provider or a database is a project. We are spending our lock-in budget where it is cheap and
guarding it where it is expensive.

Preview environments with per-PR database branches are the specific capability being bought. They
let a reviewer exercise a real migration against real-shaped data before it reaches production —
which on a system with a financial ledger is a correctness tool, not a convenience.

### Cost posture

M1 runs comfortably in the low tens of dollars per month across these services. Cost is
monitored per service with alerts on anomalies. The database is the first thing to outgrow its
tier, and that is a vertical scale before it is an architectural change.

## Consequences

**Good**

- Near-zero operational burden; engineering time goes to product.
- Preview environments with database branching, which materially improves migration safety.
- Automatic TLS for wildcard subdomains and creator custom domains — a genuinely fiddly problem,
  solved.
- Every dependency is individually replaceable, so no single vendor decision is existential.

**Bad, and accepted**

- Higher per-unit cost than self-managed at scale. Correct trade now; revisit at volume.
- Platform-specific build and function behaviour still constrains us at the edges, even with the
  no-proprietary-primitives rule.
- Provider pricing can change unilaterally. Bounded by portability: any single provider is a
  migration, not a rewrite.
- Serverless function limits shape long-running work. Already handled — background jobs run in a
  separate worker process (ADR-0009).

## Revisit when

Infrastructure spend becomes a material line item relative to revenue; a compliance or data
residency requirement demands specific control; or platform limits begin dictating architecture
rather than the reverse.
