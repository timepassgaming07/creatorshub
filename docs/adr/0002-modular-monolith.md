# ADR-0002 — Modular monolith over microservices

**Status:** Accepted
**Date:** 2026-07-27

## Context

The manifesto states two constraints that pull in opposite directions:

> *"Assume millions of users. Assume multiple contributors. Assume rapid feature growth."*

> *"Avoid unnecessary complexity. Do not build enterprise architecture for startup problems.
> Do not build startup architecture that cannot evolve."*

The team today is one person. The team assumed by the repository design is a professional
engineering organisation. The product is a commerce platform where a single user action —
completing a purchase — must atomically update an order, post four or five ledger entries, create
an entitlement, accrue an affiliate commission, and publish several events.

## Options considered

### Microservices

Independent scaling and deployment, strong team autonomy, technology heterogeneity.

Rejected. The decisive problem is not operational overhead, though that alone would disqualify it
for a one-person team. It is that **splitting `commerce` from `ledger` replaces a database
transaction with a distributed one.** We would be trading a `BEGIN … COMMIT` that is correct by
construction for sagas, compensating actions, and eventual consistency — in the exact part of the
system where inconsistency means money is wrong. That is a large amount of new failure surface
purchased in exchange for scaling headroom we do not need and cannot currently use.

### Layered monolith (controllers / services / repositories)

Familiar and simple to start. Rejected because horizontal layers do not constrain the dependency
that actually matters. Nothing stops the affiliate service from importing the order repository
directly, and once that happens across enough call sites, extraction becomes archaeology. Layers
enforce *how* code is organised, not *what may depend on what*.

### Serverless functions

Rejected: cold starts on a storefront harm the perceived performance the manifesto demands,
per-function database connections fight Postgres connection limits, and local development and
debugging of a money flow spread across functions is materially worse.

### Modular monolith with package-enforced boundaries

Vertical modules by business capability, each a workspace package with an explicit public
interface. One deployable, one transaction boundary, compile-time boundary enforcement.

## Decision

**Modular monolith**, with modules as workspace packages and one rule:

> A module may only be reached through its public interface, and may only cause effects in another
> module by emitting a domain event.

Cross-module reads go through exported service interfaces. Cross-module writes do not happen.

Modules for M1: `identity`, `catalog`, `storefront`, `commerce`, `ledger`, `fulfilment`,
`affiliate`, `analytics`, `ai`.

## Consequences

**Good**

- Money operations are atomic without distributed transaction machinery.
- One log stream, one trace, one deploy. A payment bug is debuggable by one person.
- Boundary violations fail the build rather than being caught in review, or not at all.
- Any module that has genuinely only ever been reached through its interface can later be
  extracted behind a network call without changing its callers.

**Bad, and accepted**

- Everything scales together. A traffic spike on storefronts scales the dashboard too. Acceptable:
  the application is stateless and scales horizontally; Postgres is the real constraint and would
  be under any topology.
- One runtime for all workloads. If we later need a genuinely different profile — video
  transcoding, heavy batch analytics — that becomes a separate worker, which is a small change.
- Boundary discipline requires enforcement. Hence lint rules in CI, not good intentions.
- A single deploy means a bad release affects everything. Mitigated by preview environments,
  staged rollout, and fast rollback.

## Revisit when

Any of these becomes true:

- More than roughly four teams are committing, and deploy contention is measurably slowing them.
- A single module's resource profile is distorting capacity planning for everything else.
- A module needs an independent compliance or data-residency boundary.

Note that none of these is "we have a lot of users." Scale alone is not the trigger; **coupling
pain** is.
