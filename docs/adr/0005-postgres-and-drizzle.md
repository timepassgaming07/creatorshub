# ADR-0005 — PostgreSQL with Drizzle ORM

**Status:** Accepted
**Date:** 2026-07-27

## Context

The data is relational and financial: orders reference customers, items reference products,
ledger entries must balance within a transaction, commissions reference attributions which
reference clicks. Correctness under concurrency is the primary requirement.

## Part 1 — The database

**PostgreSQL.** This is not a close decision and the alternatives are listed only for the record.

- **MySQL** — viable, but weaker JSONB, no partial or expression indexes of equivalent power, no
  transactional DDL, and a less capable extension ecosystem.
- **Document databases** — disqualified. Multi-document transactions exist but the data model is
  inherently relational, and giving up foreign keys on financial data is not a trade we would make.
- **SQLite / Turso** — excellent for edge reads, wrong for a write-heavy multi-tenant ledger with
  concurrent transactions.

Postgres capabilities we actively depend on:

| Capability | Used for |
|---|---|
| Serialisable and repeatable-read isolation | Ledger transaction integrity |
| Deferred constraint triggers | Enforcing debits = credits at commit |
| Row Level Security | Second layer of tenant isolation (ADR-0012) |
| Partial indexes | Hot paths on `outbox` and `jobs` |
| Declarative partitioning | Click, event, and audit tables |
| JSONB with schema validation on write | Theme configuration, event payloads |
| `SELECT … FOR UPDATE SKIP LOCKED` | The job queue (ADR-0009) |
| `citext` | Case-insensitive email and slug uniqueness |

## Part 2 — The data access layer

### Options considered

**Prisma.** Best-in-class developer experience and the most mature ecosystem. Rejected on two
grounds specific to this system: query generation is opaque, which is a poor fit when the queries
in question move money and must be read and reasoned about during review; and its schema-first
migration model is less transparent than plain SQL when a migration has to be audited before
touching financial tables.

**Raw SQL with a query builder (Kysely).** Maximum transparency and excellent types. Rejected
narrowly — no integrated migration story, and more boilerplate for the large volume of ordinary
CRUD the dashboard needs.

**TypeORM / Sequelize.** Rejected: weaker type inference, heavier runtime, active-record patterns
that leak persistence into the domain.

**Drizzle.** SQL-first with the SQL visible at the call site, full type inference from schema,
migrations generated as **plain reviewable SQL files**, no separate engine binary or code
generation step.

### Decision

**Drizzle**, with these constraints:

1. **The domain layer never imports Drizzle.** It depends on repository interfaces it declares
   itself. `packages/db` implements them. This keeps `domain` unit-testable without a database and
   makes the ORM replaceable.
2. **All migrations are reviewed as SQL.** Generated, then read, then committed. A migration
   touching a financial table requires explicit sign-off.
3. **Every repository is tenant-scoped by construction** — see ADR-0012.
4. **Money never round-trips through `number`.** `BIGINT` maps to `bigint`, and the branded
   `Money` type in `contracts` is the only permitted representation.

## Consequences

**Good**

- The SQL being executed is visible in the code, which matters most on the paths that matter most.
- Migrations are plain SQL — reviewable, auditable, and hand-editable when a data migration needs
  care.
- Full inference: a schema change surfaces as a compile error at every affected call site.
- Works in constrained runtimes; no binary engine to deploy.

**Bad, and accepted**

- A smaller ecosystem and fewer answered questions than Prisma. Accepted: the escape hatch is raw
  SQL, which we are comfortable with.
- Drizzle is younger and its API has moved. Contained by rule 1 — the ORM sits behind interfaces,
  so churn touches one package.
- More manual work for complex relational reads. Acceptable, and often clearer than the generated
  alternative.
- No built-in query-plan analysis. Addressed by explicit `EXPLAIN` review on the ten hottest
  queries as part of the performance budget.

## Revisit when

Drizzle's maintenance slows materially, or repository-implementation boilerplate becomes a
measurable drag. Rule 1 is what makes this a one-package change rather than a rewrite.
