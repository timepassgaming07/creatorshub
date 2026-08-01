# ADR-0013 — pnpm workspaces with Turborepo

**Status:** Accepted
**Date:** 2026-07-27

## Context

ADR-0002 chose a modular monolith whose central rule is that modules may only be reached through
their public interfaces. A rule that is only enforced in code review is not enforced — it decays
at exactly the moment the team is busy, which is when boundary violations are most tempting.

The founder's direction is to design for a professional engineering organisation, not for a solo
developer's convenience.

## Options considered

**Single application, folder-based modules.** Simplest to start. Rejected: folders cannot express
"module A may not import module B's internals." Every violation is invisible to tooling, and after
enough of them the modular monolith is just a monolith.

**Multiple repositories.** Real enforcement through publishing. Rejected: version coordination
across repositories for a single feature is a serious tax on a small team, atomic
cross-cutting changes become multi-repository dances, and local development requires linking.

**Nx.** Powerful, excellent dependency-graph tooling and generators. Rejected as heavier than
needed and more opinionated about project structure than we want this early. A reasonable future
migration if the graph gets complex.

**pnpm workspaces + Turborepo.** Package boundaries give compile-time enforcement, one repository
keeps changes atomic, and Turborepo gives caching and task orchestration with a small
configuration surface.

## Decision

**pnpm workspaces with Turborepo.** Layout as in the
[architecture overview](../architecture/overview.md#2-repository-layout).

Boundary enforcement, in three independent mechanisms:

1. **pnpm strictness.** Undeclared dependencies are not resolvable. A package cannot import
   something it did not declare.
2. **Explicit package exports.** Each package declares an `exports` map. Deep imports into another
   package's internals fail to resolve — the module's public interface is enforced by the module
   system.
3. **Lint boundary rules.** `domain` may not import `db`, `payments`, `storage`, `ai`, or any
   framework. Violations fail CI.

Turborepo provides the task graph and caching for `build`, `lint`, `typecheck`, and `test`, so CI
only rebuilds what changed.

## Consequences

**Good**

- The architectural rule is enforced by tooling rather than vigilance. A boundary violation is a
  build failure.
- Atomic changes across the schema, domain, and UI in a single reviewable commit.
- One toolchain configuration, shared and versioned once.
- Cached CI keeps feedback fast as the repository grows.
- Extracting a module to a service later is mechanical, because its consumers already only touch
  its public interface.

**Bad, and accepted**

- More initial configuration than a single application. A one-time cost paid in slice 0.
- Contributors must understand workspace mechanics. Documented in the developer guide.
- Cross-package refactors touch more files. Acceptable — the friction is proportional to the
  architectural significance of the change, which is the right incentive.
- Turborepo caching can mask stale state. Mitigated by explicit input declarations and a documented
  cache-clearing path.

## Revisit when

The dependency graph becomes complex enough that Turborepo's configuration is harder to reason
about than Nx's project graph, or build times regress despite caching.
