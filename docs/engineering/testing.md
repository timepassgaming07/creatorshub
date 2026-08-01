# Testing Strategy

**Status:** Active
**Last updated:** 2026-07-27

> *"Build confidence through testing. Quality is engineered. Not inspected later."* — the manifesto

Testing here is about confidence in the money path first, and the product second. The strategy is
deliberately not "aim for X% coverage" — coverage is a diagnostic, not a goal.

---

## 1. What gets tested, and how heavily

Risk-weighted rather than uniform. Effort follows the cost of being wrong.

| Area | Cost of a bug | Coverage target |
|---|---|---|
| Ledger, money arithmetic | Unrecoverable — money is wrong | Exhaustive, including property-based |
| Tenant isolation | Unrecoverable — data leak | Exhaustive, enforced by registry |
| Payments, webhooks, refunds | Severe — lost or duplicated money | Exhaustive, all failure paths |
| Affiliate attribution and commission | Severe — disputes, fraud | Exhaustive |
| Entitlements and downloads | High — buyer can't access, or unpaid access | Thorough |
| Auth and authorisation | High — account takeover | Thorough |
| Catalogue, storefront, dashboard | Moderate — annoying, recoverable | Meaningful paths |
| Analytics, AI surfaces | Low — wrong number, fixable | Smoke plus key calculations |

---

## 2. Layers

### Unit tests — the majority

Pure functions, no I/O, milliseconds to run. This is where the domain layer's framework-free design
pays off: business rules are tested without a database or a server.

Covers: money arithmetic and allocation, pricing and discount rules, tax calculation, commission
calculation, attribution resolution, state machine transitions, validation schemas, ledger entry
construction.

### Integration tests — the important ones

Real Postgres (Testcontainers), real repositories, real transactions. Mocked external providers.

Covers: repository behaviour including tenant scoping, transaction boundaries and rollback, ledger
balance invariants under concurrency, webhook idempotency, outbox publication, job execution and
retry, RLS policy enforcement.

Each test runs in a transaction that rolls back, so tests are isolated and fast enough to run on
every commit.

### End-to-end tests — few, and only for what matters

Playwright against a real application with a provider in test mode. Slow, so reserved for journeys
where a break is unacceptable.

1. Sign up → create workspace → publish storefront
2. Create product → upload asset → set price → publish
3. Buyer visits storefront → checkout → payment → receives download link → downloads
4. Creator refunds → buyer access revoked → ledger balanced
5. Affiliate link → click → conversion → commission accrued → held
6. Refund inside hold period → commission clawed back
7. Keyboard-only navigation through checkout

### Accessibility tests

Automated axe on every page in CI. Manual screen-reader verification on checkout and product
creation before release. Automated checks catch perhaps half of real accessibility problems, which
is why the manual pass exists.

### Performance tests

Lighthouse CI against the budget in the [Definition of Done](./definition-of-done.md). Query plan
review on the ten hottest queries. Load tests before general availability.

---

## 3. Mandatory suites

Three suites where the pattern matters more than the individual tests, because they are designed so
that *forgetting* is a test failure.

### Tenant isolation

```ts
// Every repository registers here. A new repository not in the registry
// fails the completeness check — omission is not silent.
describe.each(ALL_REPOSITORIES)('%s isolates tenants', (repo) => {
  it('returns nothing for another workspace', async () => {
    const { a, b } = await seedTwoWorkspaces()
    const record = await repo.for(a).create(fixture())
    expect(await repo.for(b).findById(record.id)).toBeNull()
  })

  it('cannot update across tenants', async () => { /* ... */ })
  it('cannot delete across tenants', async () => { /* ... */ })
  it('list never includes another tenant', async () => { /* ... */ })
})
```

Plus a CI check that enumerates tenant tables from the schema and fails if any lacks `workspace_id`
or an RLS policy.

### Ledger invariants

Property-based, because the interesting failures are the input combinations nobody thinks to write
by hand.

```ts
test.prop([arbitraryOrder(), arbitraryProgramme()])(
  'every transaction balances',
  async (order, programme) => {
    const tx = await recordOrderPayment(order, programme)
    const { debits, credits } = await sumEntries(tx.id)
    expect(debits).toEqual(credits)
  }
)

test.prop([arbitraryOrder(), arbitraryRefundSequence()])(
  'balance after full refund returns to zero',
  async (order, refunds) => { /* ... */ }
)
```

Also asserted: `UPDATE` and `DELETE` on `ledger_entries` are rejected; unbalanced transactions
cannot commit; the balance derived from entries always equals the materialised rollup.

### Webhook idempotency

```ts
it('processes a duplicate provider event exactly once', async () => {
  const event = paymentSucceededFixture()
  await handleWebhook(event)
  await handleWebhook(event)   // provider retry

  expect(await countOrdersPaid(event.orderId)).toBe(1)
  expect(await countLedgerTransactions(event.id)).toBe(1)
  expect(await countCommissions(event.orderId)).toBe(1)
  expect(await countDeliveryEmails(event.orderId)).toBe(1)
})
```

Run for every provider event type we handle. This is the test that prevents double-paying a creator.

---

## 4. Failure paths are not optional

For every money operation, the failure cases carry equal weight to the success case:

- Payment declined, then retried successfully
- Provider timeout mid-authorisation
- Webhook arriving before the redirect completes
- Webhook arriving twice, and out of order
- Partial refund on a multi-item order where one item carried commission
- Refund landing inside the commission hold period
- Refund landing after commission vested
- Chargeback on an order already refunded
- Concurrent refunds on the same order
- Self-referral attempted through an affiliate link
- Attribution window expiring between click and purchase

A feature whose happy path is tested and whose failure paths are not is not done.

---

## 5. Fixtures and factories

Builders with sensible defaults and explicit overrides. Every test constructs the world it needs —
no shared mutable state, no reliance on test execution order.

```ts
const order = anOrder()
  .forWorkspace(workspace)
  .withItem(aProduct().priced(money(2500, 'GBP')))
  .withAffiliate(affiliate)
  .build()
```

Fixtures are deterministic. Random data belongs in property-based tests, where the framework
reports the failing seed.

---

## 6. What we deliberately don't test

Recorded so it reads as a decision rather than an oversight:

- Third-party library internals
- Framework behaviour
- Generated code, including migrations (the *behaviour* they produce is tested)
- Trivial getters and pass-throughs
- Exact visual appearance — no pixel snapshots; they break on every legitimate design change and
  train people to accept diffs blindly

---

## 7. Running

```bash
pnpm test              # unit + integration
pnpm test:unit         # fast, no database
pnpm test:integration  # requires Docker
pnpm test:e2e          # Playwright
pnpm test:a11y         # axe
pnpm test:watch        # development
```

CI runs unit and integration on every push, the full suite including E2E and accessibility on every
PR, and adds load tests before a release.

---

## 8. Coverage

Tracked, not targeted. A number is a diagnostic: if the ledger module's coverage drops, something
untested was added to the most critical code in the system, and that is worth investigating.

Chasing a global percentage produces tests written for the metric rather than for confidence. We
would rather have thirty excellent tests on the money path than a thousand that assert getters
return what was set.
