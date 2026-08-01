# ADR-0012 — Two-layer tenant isolation

**Status:** Accepted
**Date:** 2026-07-27

## Context

CreatorHub holds, for each creator: their customer list, their revenue, their sales history, and
their files. A cross-tenant leak does not degrade the product — it ends it. There is no
remediation that restores a creator's confidence after their customer list appears in someone
else's dashboard.

This is therefore treated as the highest-severity correctness requirement in the system, above
availability and well above velocity.

## Options considered

### Database per tenant

Strongest isolation, and genuinely correct for a small number of high-value enterprise tenants.
Rejected: with a long tail of free creators it means thousands of databases, thousands of
migrations per release, and connection-pool exhaustion. Operationally infeasible at our shape.

### Schema per tenant

Same problems at slightly lower cost, plus Postgres degrades with very large schema counts.

### Shared tables, application-enforced only

The common approach: `workspace_id` on every table, and every query filters by it.

Rejected **as the sole mechanism.** It is correct only as long as every query is written correctly,
forever, by everyone. It fails on exactly one forgotten `WHERE` clause in one endpoint, at any point
in the product's life. Trusting a lifetime of perfect discipline on the one failure that is
unrecoverable is not a risk posture, it is a hope.

### Shared tables with two independent enforcement layers

Application-layer structural enforcement, plus Row Level Security underneath.

## Decision

**Both layers. Deliberately redundant.**

### Layer 1 — structural, in the application

Feature code cannot express an unscoped query, because it never holds an unscoped client.

- All access goes through repositories constructed from a `WorkspaceContext` derived from the
  request.
- The raw database client is not exported from `packages/db`. A lint rule forbids importing it
  outside the two files that legitimately need it (migrations, and the RLS session setter).
- Repositories inject the tenant predicate; callers cannot omit it because callers never write it.
- Every tenant table's insert path requires `workspace_id`, enforced by the type system, not
  convention.

The point is that the *absence* of a tenant filter is not expressible, rather than merely
discouraged.

### Layer 2 — Row Level Security, in the database

- RLS enabled and `FORCE`d on every tenant table.
- Policies key off `current_setting('app.workspace_id')`, set per transaction by the connection
  wrapper.
- The application role is not a superuser and does not bypass RLS.
- A small number of legitimate cross-tenant operations (platform admin, reconciliation) use a
  distinct role, and every such access is written to `audit_logs`.

### Why both

Layer 1 catches the mistakes. Layer 2 catches the mistake *in layer 1*. They fail independently:
a bug in a repository does not weaken an RLS policy, and a misconfigured policy is still backed by
the repository predicate. A leak requires two independent failures at the same time.

### Verification, not assertion

- A test helper seeds two workspaces and asserts that every repository method returns nothing for
  the wrong tenant. New repositories are added to this suite by a registry, so **forgetting is a
  test failure**, not an omission.
- A CI check enumerates tenant tables from the schema and fails if any lacks `workspace_id` or an
  RLS policy.
- Cross-tenant access attempts are logged and alerted in production.

## Consequences

**Good**

- Tenant isolation survives ordinary human error, which is the only kind that matters here.
- One database, one migration, one connection pool.
- RLS gives a hard answer to the security-review question rather than "we always remember to."

**Bad, and accepted**

- RLS has a small per-query cost. Measured and negligible relative to network and I/O.
- The tenant context must be set on every connection; forgetting it means queries return nothing
  rather than leaking. The failure mode is loud and safe, which is the correct direction.
- Debugging is slightly harder — data can appear missing due to context rather than absence. A
  clear error is raised when a tenant-scoped query runs without a context set.
- Some legitimate cross-tenant work needs an explicit escape hatch. Made explicit, audited, and
  rare, which is better than being implicitly always available.

## Revisit when

An enterprise customer requires physical isolation or a specific data residency. The answer is a
dedicated deployment for that tenant, not a change to the shared model.
