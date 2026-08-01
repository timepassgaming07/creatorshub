# ADR-0008 — Double-entry ledger as the financial source of truth

**Status:** Accepted
**Date:** 2026-07-27

## Context

This is the most consequential decision in the M1 foundation.

A CreatorHub sale splits across up to five parties — creator, platform, affiliate, tax authority,
processor — with a hold period before commission vests and clawback if a refund arrives inside
that window. Later phases add subscriptions, proration, partial refunds on multi-item orders,
FX, and tax remittance.

The founder's stated reason for including affiliates in Milestone 1 was growth. The stronger
reason is this: **commissions force a ledger, and a ledger cannot be retrofitted.** Every
monetisation feature in the deferred list inherits the money model built now.

## Options considered

### Amount columns on domain tables

`orders.total`, `orders.commission_amount`, `orders.platform_fee`, a `balance` on the workspace.

This is what most products do and it is the option we are rejecting, so it deserves a real
account of why.

It works until the first partial refund on a multi-item order where one item carried an affiliate
commission that has already vested. At that point the correct new value of every affected column
depends on the full history of what happened, which the columns do not record. Teams respond by
adding more columns — `refunded_amount`, `commission_clawed_back` — and each one is a place where
two sources of truth can disagree. A stored `balance` is the first to drift, and drift on money is
indistinguishable from theft until you can prove otherwise. You cannot prove it without a history,
which is the thing this design lacks.

It is also unauditable. "Why is this creator owed £4,312.55?" has no answer beyond "that is what
the column says."

### Single-entry transaction log

Append-only, better than columns. Rejected: nothing enforces that money is conserved. A bug can
credit a creator without debiting anything, and no invariant catches it.

### Full event sourcing of the domain

Rejected as over-scoped. We want append-only immutability for *money*, not for products,
storefronts, and settings — where it would add substantial cost for little benefit. The ledger is
event-sourced; the rest of the domain stores current state.

### Double-entry ledger

Every financial fact is a balanced transaction of debits and credits across accounts. Six hundred
years of proving that money is conserved.

## Decision

**A double-entry ledger. All money flows through it. Balances are always derived.**

- `ledger_accounts` — one per (owner, kind, currency)
- `ledger_transactions` — one per financial event, with a unique idempotency key
- `ledger_entries` — **append-only, immutable**, positive amounts, direction carries the sign

Database-enforced invariants:

1. Debits equal credits per transaction per currency, checked by a **deferred constraint trigger**
   at commit — a half-written transaction cannot commit.
2. `UPDATE` and `DELETE` on `ledger_entries` are revoked at the role level and blocked by trigger.
3. No cross-currency entries within a transaction; FX is an explicit conversion transaction.
4. `amount > 0`, always.

Consequent rules:

- **Corrections are compensating transactions.** Nothing is ever edited. A refund does not reverse
  a row; it posts a new balanced transaction that moves the money back.
- **`orders.total` is a projection, not truth.** Where they disagree, the ledger is right and the
  projection is a bug.
- **No stored balance columns.** Balances are aggregations, with materialised rollups for
  performance that are rebuildable from entries at any time.
- **Continuous reconciliation.** A scheduled job compares ledger-derived balances against the
  provider's reported balance; divergence beyond tolerance pages a human.
- **Money is `bigint` minor units + currency.** No floats, no `NUMERIC` that JavaScript might
  coerce.

## Consequences

**Good**

- Money is conserved by construction. A bug that creates money fails to commit.
- Every balance is explainable down to the originating event. Disputes, audits, and creator
  questions all have real answers.
- Hold periods, clawbacks, partial refunds, and multi-party splits are naturally expressible
  rather than special cases.
- Subscriptions, proration, and tax remittance attach without a money-model change.
- If the application and the provider disagree, we find out on a schedule rather than from a
  customer.

**Bad, and accepted**

- More upfront work than amount columns, and it is the second slice rather than a later one.
  This is the single highest-value use of early effort in the whole milestone.
- Every engineer touching money must understand debits and credits. Addressed with a worked
  example in the [data model](../architecture/data-model.md#9-ledger) and a required reading list
  for money-path changes.
- Reporting means aggregation. Mitigated by rollups; the rollups are caches, never truth.
- The ledger grows without bound. Acceptable — it is narrow, and time-partitioned archival is
  straightforward.

## Revisit when

Never for the pattern itself. Rollup and partitioning strategy will evolve with volume; the
double-entry model will not.
