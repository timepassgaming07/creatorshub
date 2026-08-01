# CLAUDE.md — CreatorHub

Operating manual for anyone, human or agent, working in this repository. Read this first, then the
document the task points you at.

---

## 1. Authority order

When two sources conflict, the higher one wins.

| # | Source | Governs |
|---|---|---|
| 1 | [`manifesto.md`](./manifesto.md) | Product vision, philosophy, standards. Highest authority. |
| 2 | Global `~/.claude/CLAUDE.md` | Engineering behaviour (see §2) |
| 3 | This file | Repository workflow and local invariants |
| 3a | [`STATE.md`](./STATE.md) | Where the project actually is right now. Read after this file. |
| 4 | [`docs/adr/`](./docs/adr/README.md) | Why the architecture is what it is |
| 5 | [`docs/engineering/`](./docs/engineering/) | How to write and verify code here |

If the manifesto and reality genuinely conflict, do not silently pick one. Write an ADR recording the
tension and the decision.

---

## 2. The four standing rules

From the global instructions, binding on every task in this repository:

1. **Think before coding.** State assumptions. Ask when a wrong guess would be costly. Do not guess.
2. **Simplicity first.** Minimum code that satisfies the requirement. No premature abstraction.
3. **Surgical changes.** Touch only what the task requires. Never reformat neighbouring code.
4. **Goal-driven.** Define verifiable success criteria before executing.

Rule 3 has teeth here: a diff containing unrelated reformatting is rejected in review regardless of
how correct the intended change is.

---

## 3. Where things are

```
apps/web            Next.js — dashboard, storefronts, affiliate portal, /api/v1
packages/domain     business logic — no framework imports, no database imports
packages/contracts  zod schemas — the shared vocabulary between layers
packages/db         drizzle schema, migrations, tenant-scoped repositories
packages/payments   PaymentProvider port + provider adapters
packages/storage    file storage port + adapters
packages/email      transactional email port + adapters
packages/ai         LLM gateway — prompt registry, cost accounting, evals
packages/jobs       Postgres queue + transactional outbox
packages/telemetry  logging, metrics, tracing
packages/ui         design system — tokens, primitives, patterns
packages/config     shared tsconfig, eslint, prettier, vitest config
```

Not all of these exist yet. Slice 0 creates the skeleton. See [Status](./README.md#status).

---

## 4. The invariants

These are the rules whose violation is expensive enough to enumerate here rather than leaving them
buried in a standards document. Each links to its full treatment.

**Money** — integer minor units in `bigint`, currency always attached, arithmetic only through the
`money` helpers, proportional splits only through `allocate`, formatting only at the view boundary.
`number` for money fails lint. → [coding-standards §2](./docs/engineering/coding-standards.md)

**The ledger is append-only.** Every money movement is a balanced double-entry transaction. Balances
are derived from entries, never stored as a mutable column. `UPDATE` and `DELETE` on `ledger_entries`
are rejected by the database. → [ADR-0008](./docs/adr/0008-double-entry-ledger.md)

**Tenancy is enforced twice.** Every tenant row carries `workspace_id`; access goes through
tenant-scoped repositories; Postgres RLS enforces the same rule independently underneath. Feature
code cannot obtain an unscoped client. → [ADR-0012](./docs/adr/0012-multi-tenancy.md)

**No external I/O inside a transaction.** No HTTP call, no email, no provider request. Side effects
are outbox events published after commit. → [ADR-0009](./docs/adr/0009-postgres-queue-and-outbox.md)

**The domain never names a provider.** `packages/domain` declares ports; adapters implement them.
A `stripe` import inside `domain` is a boundary violation that fails lint.
→ [ADR-0007](./docs/adr/0007-payment-provider-port.md)

**Module boundaries are compile-time.** A module is reached only through its public interface, and
causes effects in another module only by emitting a domain event. Deep imports are unresolvable
because `exports` maps make them so. → [ADR-0002](./docs/adr/0002-modular-monolith.md)

**Amounts are computed server-side.** The client submits a product reference and a quantity. A
client-supplied price is a bug, not an input. → [security §4](./docs/engineering/security.md)

**Webhooks are verified then deduplicated.** Signature check before any processing; exactly-once via
the unique constraint on `(provider, provider_event_id)`.

**Tokens only, no raw values.** No hex colours, no arbitrary pixel spacing in components.
→ [design-system §2](./docs/design/design-system.md)

---

## 5. Workflow

The repository is set up so the structured workflows do the routine verification. Use them; do not
reimplement what they already do.

| Stage | Do this |
|---|---|
| Shape a vague requirement | `/spec` |
| Lock an architecture or plan | `/plan-eng-review`, or `/autoplan` for the full pipeline |
| Brand, visual identity, design language | `/design-consultation` |
| Implement | Follow §2 and the standards docs |
| Something is broken | `/investigate` — root cause before fix |
| Verify behaviour in a browser | `/qa` to test and fix, `/qa-only` to report |
| Visual and interaction polish | `/design-review` |
| Security-sensitive change | `/cso` |
| Before landing | `/review` |
| Land it | `/ship`, then `/land-and-deploy` |
| After deploy | `/canary`, then `/document-release` |
| Code quality snapshot | `/health` |
| Weekly | `/retro` |

Full routing table lives in `~/.claude/skills/gstack/SKILL.md`. When a request matches a skill,
invoke the skill. A skill invoked unnecessarily costs little; an ad-hoc answer where a gated
workflow existed costs a defect.

---

## 5a. Local conventions the tooling assumes

These are not preferences. Breaking one produces a failing build, and the failure message rarely
names the cause, so they are written down.

**The gate is one command.** `pnpm verify` runs typecheck, lint, unit tests, and the format check.
It must be green before anything is offered for review. `pnpm test:e2e` is the second gate; it
builds the app first, because Playwright starts `next start`.

**Every package that runs tests owns a `vitest.config.ts`,** even when it has no tests yet. The file
is a one-line re-export of `@creatorhub/config/vitest/base`, which carries `passWithNoTests`. A
package with a `test` script and no config fails the build the moment turbo reaches it.

**Two tsconfigs per library package.** `tsconfig.json` includes tests so the editor and the
type-aware lint rules can see them. `tsconfig.build.json` excludes them so they are not emitted.
Typecheck uses the first, `build` the second.

**`allowDefaultProject` is sized to the package's tsconfig.** The shared ESLint base lets loose
`*.ts` config files into the default project, because a library tsconfig only includes `src/`. A
package whose tsconfig includes `**/*.ts` — `apps/web` does — must narrow that list to `*.js` and
`*.mjs`, or every root config file errors with "included by allowDefaultProject but also was found
in the project service".

**Versions are pinned exactly.** `save-exact=true` in `.npmrc`. Toolchain versions are pinned
*down* where the ecosystem has not caught up: TypeScript 6.0.3 and ESLint 9.39.5, both with the
reason recorded in [ADR-0003](./docs/adr/0003-typescript-everywhere.md). Before raising either,
run `pnpm peers check`.

**A dependency that runs code at install time is a supply-chain decision.** pnpm 11 blocks build
scripts by default; adding an entry to `allowBuilds` in `pnpm-workspace.yaml` is a deliberate act,
not a way to silence a warning.

## 5b. Testing practice

**Verify the enforcement, not just the rule.** A lint rule that is meant to block an import is
tested by writing a file that performs the import and confirming it is rejected with the intended
message, then deleting the file. An untested boundary rule is a comment.

**Test the tokens, not only the rendered page.** Axe checks what a page renders, so a design token
no component uses yet is unverified — that is exactly how a `caution` token shipped at 4.25:1.
`packages/ui/src/tokens/contrast.test.ts` reads the real `tokens.css` and checks every foreground
against every surface in both themes. Both checks are needed; neither replaces the other.

**Solve contrast against the worst-case surface.** In light mode that is the darkest surface, in
dark mode the lightest. A token fixed against `--surface-base` alone will fail on `--surface-sunken`.

**Component behaviour is tested where the component lives.** `packages/ui` uses jsdom; `apps/web`
uses the node environment, because what is unique to the app is server-side. App-level composition
is covered by Playwright against a real browser, not by a second DOM simulator.

**A test that passes on retry is a flaky test.** Playwright has zero retries locally and one in CI,
and the retry count is visible in the report rather than hidden in the config.

## 5c. Accessibility and design

**One token, one role.** `--border-default` is a decorative hairline, which WCAG 1.4.11 exempts.
`--border-control` is the boundary of an interactive control, which must reach 3:1. When a single
token is asked to satisfy two contrast rules, the answer is a second token, not a compromise value.

**Focus is defined once, globally,** in the `@layer base` block of `theme.css`. A component has to
actively fight the system to lose its focus ring.

**Dark mode is authored, not inverted.** Every colour is re-tuned per theme, and both themes are
checked independently.

---

## 6. Definition of done

The merge gate is [`docs/engineering/definition-of-done.md`](./docs/engineering/definition-of-done.md).
Do not report a change as complete until it passes.

Two gates worth repeating:

- **Money-path changes require a second reviewer.** The only mandatory two-person review in the
  repository.
- **Data surfaces ship four states** — loading, empty, error, populated. A table with only a
  populated state is not done.

---

## 7. Commits and history

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Branch from `main`. Never commit directly to `main`.
- One logical change per commit.
- Hooks are not skipped. `--no-verify` requires a stated reason.
- **Do not commit or push unless asked.** Prepare the change and say it is ready.

---

## 8. Writing

Applies to documentation, ADRs, commit messages, PR descriptions, and user-facing copy.

Direct and concrete. Name the file, the function, the command, the user-visible effect. Short
paragraphs. End with what to do next.

Avoid: em dashes, and the words *delve, crucial, robust, comprehensive, nuanced, multifaceted*.
Never corporate, never academic. User-facing errors answer three questions — what happened, why,
what to do next.

---

## 9. When you are unsure

In order:

1. Check the ADRs. The decision may already be recorded with its reasoning.
2. Check the milestone scope. It may be deliberately out of scope with a documented seam.
3. If the choice is reversible and low cost, make it and note the assumption.
4. If it is expensive to reverse — schema, money, tenancy, provider, public API — stop and ask.

Then record it. A decision a competent engineer would be puzzled by in a year, where guessing wrong
would be costly, gets an ADR. Everything else gets a comment explaining why.
