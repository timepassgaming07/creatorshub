# ADR-0009 — Postgres-backed jobs with a transactional outbox

**Status:** Accepted
**Date:** 2026-07-27

## Context

When a payment succeeds we must, atomically: mark the order paid, post ledger entries, create an
entitlement, accrue a commission — and then, separately, send a delivery email, send a receipt,
schedule the hold expiry, and update analytics.

The first group must be one transaction. The second group must not be, because a slow email
provider must never roll back a payment.

This is the classic **dual-write problem**: two systems (database and message broker) that cannot
be updated atomically. Get it wrong and you either lose the side-effect — a buyer pays and never
receives their file — or you perform it for a transaction that rolled back.

## Options considered

### Redis-backed queue (BullMQ)

Fast, mature, good tooling. **Rejected on the decisive point:** you cannot enqueue to Redis inside
a Postgres transaction. The sequence is either

```
COMMIT; enqueue;     ← process dies between them → side-effect lost forever
enqueue; COMMIT;     ← transaction rolls back → side-effect fires for a payment that never happened
```

There is no ordering that is correct. On a payments system, "the buyer paid and never got the
file" is the worst bug the product can have, and this architecture makes it a matter of timing
rather than a matter of correctness. Redis persistence settings do not fix it — the gap is between
two systems, not inside one.

### SQS / cloud queue

Same dual-write problem, plus more infrastructure and a harder local development story.

### Kafka

Rejected as vastly over-scoped. We need reliable job execution and a few thousand events a day,
not a distributed log.

### Postgres-backed queue with a transactional outbox

The job and the outbox row are ordinary tables in the same database, so enqueueing is part of the
same `COMMIT` as the business write.

## Decision

**Jobs and events live in Postgres.**

- `outbox` — domain events written **inside** the business transaction. A publisher polls
  unpublished rows after commit and dispatches them.
- `jobs` — the work queue, claimed with `SELECT … FOR UPDATE SKIP LOCKED`, which gives safe
  concurrent consumption without extra infrastructure.

Rules:

1. **Domain events are written inside the transaction that caused them.** Never after.
2. **No external side effect occurs inside a database transaction.** No email, no HTTP, no
   provider call. Those are jobs.
3. **Every job is idempotent.** It will run more than once — delivery is at-least-once, and
   pretending otherwise is how duplicate emails and duplicate payouts happen.
4. **Every job has bounded retries with exponential backoff and jitter**, then a dead-letter state
   that alerts.
5. **Jobs carry `workspace_id` explicitly.** There is no ambient tenant context in a worker.
6. **Poison-message protection**: a job that fails deterministically is dead-lettered, never
   retried indefinitely.

Workers run in the same deployable as the web application in M1, on a separate process, and can be
split to their own service without code changes.

## Consequences

**Good**

- The dual-write problem is eliminated by construction. Not mitigated — eliminated.
- One datastore. One backup, one restore, one connection story, one local development setup.
- Job state is queryable with SQL. Debugging "why did this buyer not get their file?" is a `SELECT`.
- Transactional test setup is trivial, so job behaviour is genuinely testable.

**Bad, and accepted**

- Lower throughput ceiling than a dedicated broker. At our volumes Postgres handles this
  comfortably; the crossover is far beyond M1.
- Polling adds latency and load. Mitigated with `LISTEN/NOTIFY` to wake the publisher immediately,
  with polling as the safety net.
- Queue load and application load share a database. Mitigated by keeping payloads small, indexing
  the claim query with a partial index, and archiving completed jobs aggressively.
- We maintain queue mechanics ourselves. Bounded: claiming, retries, backoff, dead-letter. A few
  hundred lines, well-understood.

## Revisit when

Sustained job throughput approaches the point where the claim query becomes a measurable source of
database contention. The upgrade path is to keep the outbox in Postgres — that part is
architecturally required — and move *consumption* to a dedicated broker fed by the outbox
publisher. The outbox pattern is what makes that migration safe, which is a further reason to
start with it.
