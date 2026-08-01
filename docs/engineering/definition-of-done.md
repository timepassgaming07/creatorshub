# Definition of Done

**Status:** Active
**Last updated:** 2026-07-27

This is a merge gate, not a wish list. A pull request that does not satisfy every applicable item is
not complete, regardless of whether the feature "works".

The manifesto states it plainly: *"Quality is engineered. Not inspected later."*

---

## Every change

- [ ] Typecheck passes with zero errors. No `any`, no `@ts-expect-error` without a comment
      explaining why and a linked issue.
- [ ] Lint passes, including module boundary rules.
- [ ] Tests pass. New behaviour has tests; fixed bugs have a regression test that fails without the fix.
- [ ] Migrations reviewed as SQL, forward-only, and safe to run against a populated table.
- [ ] No secrets, keys, tokens, or credentials in the diff.
- [ ] Documentation updated where the change affects it (README, ADR, module doc, standards).
- [ ] The diff contains only what the task requires. Unrelated refactors go in their own PR.

## Every user-facing feature

**Business logic**

- [ ] Complete — no stubs, no `TODO`, no half-built paths behind a flag that nothing sets.
- [ ] All input validated at the trust boundary with a zod schema from `contracts`.
- [ ] Authorisation checked through the policy module, never inline in a route.
- [ ] Tenant scoping verified — the tenant isolation test suite covers any new repository.
- [ ] Errors mapped to the error taxonomy; no raw exception reaches a user.

**Interface**

- [ ] Uses design system tokens and primitives only. No raw colours, no arbitrary spacing.
- [ ] Responsive at 375px, 768px, 1024px, and 1440px.
- [ ] **Loading state** — skeleton matching final layout, not a spinner.
- [ ] **Empty state** — educational: explains what belongs here and how to create it.
- [ ] **Error state** — what happened, why, what to do next. Never a stack trace, never blame.
- [ ] **Success state** — confirms the outcome and reinforces confidence.
- [ ] Optimistic updates where safe; never on money.

**Accessibility**

- [ ] Fully operable by keyboard alone.
- [ ] Visible focus indicator on every interactive element.
- [ ] Semantic HTML; ARIA only where semantics are genuinely insufficient.
- [ ] Form inputs labelled, errors programmatically associated.
- [ ] Text contrast at least 4.5:1; UI component contrast at least 3:1.
- [ ] Automated axe check passes.
- [ ] `prefers-reduced-motion` honoured.

**Performance**

- [ ] No N+1 queries. New queries on hot paths have their plan reviewed.
- [ ] Appropriate indexes exist for every new query pattern.
- [ ] Client JavaScript delta justified; Server Components used where interactivity isn't needed.
- [ ] Images optimised and correctly sized.
- [ ] Meets the performance budget below.

**Security**

- [ ] Input validated, output encoded. No `dangerouslySetInnerHTML` without server-side sanitisation.
- [ ] Parameterised queries only.
- [ ] Rate limiting on any endpoint that is expensive, authenticating, or abusable.
- [ ] State-changing actions on money, entitlements, or permissions write to `audit_logs`.
- [ ] `/security-review` run on changes touching auth, payments, or tenancy.

**Motion**

- [ ] Every transition maps to a state change. Nothing animates decoratively.
- [ ] Durations from the token scale.

## Money-path changes — additional gates

Applies to anything touching `commerce`, `ledger`, `affiliate` commission, refunds, or payouts.

- [ ] Amounts are `bigint` minor units with an adjacent currency. No floats anywhere in the path.
- [ ] All amounts computed server-side from server state. Client input is a product reference and a
      quantity, nothing more.
- [ ] Ledger transactions balance. The deferred constraint trigger is exercised by a test.
- [ ] Operation is idempotent; the idempotency key is tested by replaying the same request.
- [ ] Webhook handlers tested for duplicate delivery — the same provider event twice must produce
      one effect.
- [ ] Failure paths tested: declined payment, provider timeout, partial refund, chargeback.
- [ ] No external side effect inside a database transaction.
- [ ] Reconciliation still passes against the provider's reported balance.
- [ ] Reviewed by a second person. **This is the only mandatory two-person gate.**

## Performance budget

| Metric | Storefront | Dashboard |
|---|---|---|
| Largest Contentful Paint (p75) | < 1.5s | < 2.0s |
| Interaction to Next Paint (p75) | < 200ms | < 200ms |
| Cumulative Layout Shift | < 0.1 | < 0.1 |
| Server response, cached (p95) | < 100ms | — |
| Server response, dynamic (p95) | < 400ms | < 500ms |
| API p95 | < 300ms | < 300ms |
| Client JS, initial (gzipped) | < 100KB | < 250KB |

The storefront budget is tighter on purpose: it is the surface that converts, and the manifesto
requires *"every interaction should feel immediate."*

## Not done

Explicitly incomplete, no matter what else passed:

- Tests are failing or skipped without justification
- The happy path works and an error path is unhandled
- A loading, empty, or error state is missing
- Money uses a float, or is computed client-side
- A ledger transaction can commit unbalanced
- A tenant-scoped query can be written without the tenant predicate
- Documentation contradicts the code
- The feature "works on my machine" but has not run in a preview environment

## Judgement

This list is a floor, not a ceiling. It cannot enumerate every way a change can be wrong. The
standing question from the manifesto applies to every PR:

> *"Is this the best possible version of CreatorHub?"*

If the answer is no, it is not done.
