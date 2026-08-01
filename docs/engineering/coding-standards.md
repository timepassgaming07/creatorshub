# Coding Standards

**Status:** Active
**Last updated:** 2026-07-27

Written for an engineering organisation that does not exist yet. Every rule here exists because
breaking it costs more later than following it now.

The manifesto's engineering brief: *"Write software that will still be maintainable five years from
now. Code should explain itself. Comments should explain decisions."*

---

## 1. TypeScript

Strict mode, with the strictest practical settings enabled in `packages/config`:

```
strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
noImplicitOverride, noFallthroughCasesInSwitch, verbatimModuleSyntax,
noPropertyAccessFromIndexSignature
```

**Banned, enforced by lint:**

| Banned | Use instead |
|---|---|
| `any` | `unknown` plus a type guard, or a real type |
| Non-null assertion `!` | An explicit check, or a type that can't be null |
| `as` casts on external data | Zod parsing at the boundary |
| `enum` | `as const` object plus a derived union type |
| Default exports (except Next.js pages) | Named exports — greppable, refactor-safe |
| `number` for money | The branded `Money` type from `contracts` |

**Types are derived, never duplicated.** Database types come from the Drizzle schema; API types are
inferred from Zod schemas. A type written by hand that duplicates a schema is a future
inconsistency.

```ts
// Wrong — two sources of truth
interface Product { id: string; name: string }

// Right — one source
type Product = typeof products.$inferSelect
type CreateProductInput = z.infer<typeof createProductSchema>
```

**Make invalid states unrepresentable.** Prefer a discriminated union over a bag of optional fields.

```ts
// Wrong — allows { status: 'paid', paidAt: undefined }
type Order = { status: string; paidAt?: Date; refundedAt?: Date }

// Right
type Order =
  | { status: 'pending' }
  | { status: 'paid'; paidAt: Date }
  | { status: 'refunded'; paidAt: Date; refundedAt: Date }
```

---

## 2. Money

The rules with the highest cost of violation in the codebase.

```ts
// The only permitted representation
type Money = { amount: bigint; currency: CurrencyCode }
```

1. **Integer minor units, always.** £10.50 is `1050n`, never `10.50`.
2. **`bigint`, never `number`.** `number` loses precision above 2^53 and invites float arithmetic.
3. **Currency travels with the amount.** A bare amount is meaningless and eventually gets added to a
   different currency.
4. **No arithmetic outside the `money` helpers.** `add`, `subtract`, `multiply`, `allocate`,
   `percentage` — all currency-checked, all integer-safe.
5. **Proportional splits use `allocate`**, which distributes remainder pennies deterministically.
   Naive percentage splits lose or create money.
6. **Formatting only at the view boundary**, via `Intl.NumberFormat` with the workspace locale.

```ts
// Wrong — three separate bugs
const commission = order.total * 0.2
const net = order.total - commission - fee

// Right
const commission = money.percentage(order.total, basisPoints(2000))
const net = money.subtract(money.subtract(order.total, commission), fee)
```

`allocate` exists because £100 split three ways is `3334 + 3333 + 3333`, not `3333.33 × 3`. Getting
this wrong is how ledgers fail to balance.

---

## 3. File and module organisation

**One responsibility per file.** A file exporting unrelated things is two files.

**Soft limits:** 200 lines for a component, 300 for a module, 50 for a function. These are review
prompts, not hard failures — but a file at 500 lines needs a justification.

```
packages/domain/src/commerce/
├── index.ts              public interface — the only import surface
├── checkout.service.ts   orchestration
├── pricing.ts            pure calculation
├── order.state.ts        state machine
├── ports.ts              interfaces this module needs
├── events.ts             domain events emitted
└── __tests__/
```

**Only `index.ts` is public.** Package `exports` maps make deep imports unresolvable, so the
boundary is enforced by the module system rather than by review.

**Naming**

| Thing | Convention | Example |
|---|---|---|
| Files | `kebab-case` | `checkout-service.ts` |
| Components | `PascalCase` file and export | `ProductCard.tsx` |
| Types, interfaces | `PascalCase`, no `I` prefix | `PaymentProvider` |
| Functions, variables | `camelCase` | `calculateCommission` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_BYTES` |
| Booleans | `is`/`has`/`can`/`should` prefix | `hasActiveEntitlement` |
| Async functions | Verb naming, no `Async` suffix | `createOrder` |
| Database | `snake_case`, plural tables | `order_items` |
| Events | `Aggregate.PastTense` | `Order.Paid` |

**No magic values.** Every literal that carries meaning is a named constant. The manifesto is
explicit about this.

---

## 4. Functions

**One problem per function.** If you need "and" to describe it, split it.

**Parameters:** positional up to two; an options object beyond that. Options objects are
self-documenting at the call site and safe to extend.

**Return early.** Guard clauses over nested conditionals — the happy path should be the least
indented code in the function.

**Purity where possible.** Business calculations take data and return data. I/O lives at the edges,
which is what makes the domain layer testable without a database.

---

## 5. Error handling

Two categories, handled differently:

**Expected failures** — a card declined, a duplicate slug, insufficient permission. These are domain
outcomes, returned as values:

```ts
type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

**Unexpected failures** — a database is unreachable, an invariant is violated. These throw, and are
caught at the boundary, logged with full context, and mapped to a generic user-facing message.

**Never**

- Swallow an error silently (`catch {}`)
- Log and rethrow at every layer — log once, at the boundary
- Expose an internal message, stack trace, or SQL to a user
- Use an exception for ordinary control flow

**User-facing errors always answer three questions** — the manifesto requires this: what happened,
why, what to do next.

```ts
// Wrong
'Error: constraint violation on products_workspace_id_slug_key'

// Right
{
  title: 'That URL is already taken',
  detail: 'Another product in your store uses "summer-guide".',
  action: 'Choose a different URL, or edit the existing product.',
}
```

---

## 6. Comments

Comments explain **why**, never **what**.

```ts
// Wrong — restates the code
// Loop through items and add up the totals
for (const item of items) { total = money.add(total, item.total) }

// Right — explains a decision the code can't
// Hold period must be at least the refund window. Paying commission on money
// we may still owe back creates a clawback we can't always collect.
const holdDays = Math.max(programme.holdPeriodDays, REFUND_WINDOW_DAYS)
```

Write a comment for: a non-obvious constraint, a deliberate trade-off, a workaround with a link to
the upstream issue, a regulatory or business rule with no local expression. Not for: what the next
line does, where the code came from, or why your change is correct — that is review conversation,
and it becomes noise the moment the PR merges.

Every module has a header comment covering purpose, responsibilities, dependencies, and any
non-obvious constraint. The manifesto requires this.

---

## 7. React and Next.js

**Server Components by default.** `'use client'` requires a reason: state, effects, event handlers,
or browser APIs. Push the client boundary as deep into the tree as possible.

**No business logic in components.** Components render state and dispatch actions.

**No business logic in route handlers or Server Actions.** Parse, resolve tenant, call domain
service, map result. A business rule in a route file is a review failure (ADR-0004, rule 1).

**Composition over configuration.** A component with eight boolean props wants to be three
components.

**Keys are stable identifiers.** Never an array index.

**Client state, in order of preference:** derive it → URL state → local `useState` → context → a
store. Reach for a store only when the alternatives genuinely fail.

---

## 8. Database access

**Feature code never touches the database client.** Access goes through tenant-scoped repositories
(ADR-0012).

**Migrations**

- Generated by Drizzle, then read as SQL before committing.
- Forward-only. No down migrations — a rollback in production is a new forward migration.
- Additive first: add a nullable column, backfill, then add the constraint. Never a
  table-locking change during traffic.
- A migration touching a financial table needs explicit sign-off.
- Data migrations are jobs, not migration files, so they are resumable and observable.

**Transactions**

- One transaction per business operation.
- **No external I/O inside a transaction** — no HTTP, no email, no provider call. Those are outbox
  events (ADR-0009).
- Explicit isolation level on money operations.
- Keep them short; a long transaction is a lock-contention incident waiting to happen.

---

## 9. Testing

Full strategy in [testing.md](./testing.md). The rules that belong here:

- Tests assert behaviour, not implementation. A refactor that preserves behaviour should not break
  tests.
- Test names state the expectation: `rejects self-referral when buyer email matches affiliate`.
- No shared mutable state between tests. Each test builds its own world.
- Money and tenancy have mandatory test suites; new repositories register with the tenant isolation
  suite so that forgetting is a failure rather than an omission.

---

## 10. Dependencies

Adding a dependency is a decision with a maintenance cost.

Before adding one, ask: could this be twenty lines of our own code? Is it actively maintained? What
does it pull in transitively? Would removing it later be a project?

**Rules**

- Exact pinned versions in `package.json`. No open ranges.
- Lockfile committed, always.
- Prefer well-known, actively maintained packages.
- Flag anything whose name resembles a popular package — typosquatting is a live supply-chain risk.
- Automated dependency review in CI; security patches applied promptly.

---

## 11. Git

- Small, focused commits. One logical change each.
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Branch from `main`; never commit directly to `main`.
- PRs describe what changed, why, what was tested, and anything deliberately left out.
- No force-push to a shared branch.
- Hooks are not skipped — `--no-verify` requires a stated reason.

---

## 12. Enforcement

Tooling, not vigilance. Everything below fails CI:

| Check | Catches |
|---|---|
| `tsc --noEmit` | Type errors across all packages |
| ESLint | Style, banned constructs, module boundaries |
| Prettier | Formatting — never discussed in review |
| `vitest` | Unit and integration behaviour |
| `playwright` | Critical user journeys |
| `axe` | Accessibility regressions |
| Schema drift check | Migrations out of sync with schema |
| Tenant isolation check | A tenant table without `workspace_id` or an RLS policy |
| `depcheck` / audit | Unused and vulnerable dependencies |

Review discusses design, correctness, and trade-offs. It does not discuss formatting.
