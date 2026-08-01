# STATE

**Last updated:** 2026-08-01
**Branch:** `chore/slice-0-foundation`
**Committed:** slice 0 is in history as eight commits, branched from an empty root commit on `main`.
Not pushed, and no remote is configured. See [Repository changes](#repository-changes).

This file is the live position of the project. `README.md` says what CreatorHub is, `CLAUDE.md` says
how to work here, the ADRs say why the architecture is what it is. This says where we are.

---

# Current Status

**Slice 0 is complete.** The repository builds, verifies, and tests green from one command. Slice 1
— identity, workspace, tenancy — has not started.

| Gate | Result |
|---|---|
| `pnpm verify` | 22/22 turbo tasks green (typecheck, lint, test), plus `prettier --check` clean |
| `pnpm test` | 220 unit tests across 7 files |
| `pnpm test:e2e` | 18 Playwright tests across 2 browser projects, axe clean in light and dark |
| `pnpm build` | 6 tasks green — 5 packages plus the Next app |

Package inventory, against the eleven the architecture names:

| Package | State |
|---|---|
| `packages/config` | TypeScript presets, three ESLint flat configs, Vitest configs |
| `packages/contracts` | The `Money` primitive. 45 tests, property-based |
| `packages/domain` | `Result<T, E>` and `DomainError`. 15 tests. Import boundaries enforced |
| `packages/telemetry` | Log redaction. 35 tests |
| `packages/ui` | Design tokens, Tailwind v4 wiring, `MoneyDisplay`, `MoneyInput`, contrast harness. 125 tests |
| `packages/db` | Skeleton. Shape follows the slice 1 schema |
| `apps/web` | Next 16 App Router shell, health route, security headers, Playwright + axe |
| `payments`, `storage`, `email`, `ai`, `jobs` | Deliberately not created — see [Architectural decisions](#architectural-decisions) |

Nothing touches a database, an auth provider, or a payment provider yet. There is no money path in
the running sense — only the primitives every money path will be built from.

---

# Session Summary

The session picked up mid-slice-0 with the tooling and packages already standing, and closed the
slice. What actually happened, in order:

1. **Authored `CLAUDE.md`.** The repository had a manifesto, ADRs, and standards docs but no
   operating manual — nothing that told an arriving agent which document wins when two disagree.
   `CLAUDE.md` now carries the authority order, the four standing rules, the package map, the eight
   invariants, the skill routing table, and the escalation procedure.

2. **Authored `docs/product/implementation-plan.md`.** The milestone scope said what M1 is; the plan
   says how each of the twelve slices gets built. Work items sized as one PR each, exit conditions
   stated as observable facts rather than adjectives, plus the dependency graph and the
   single-engineer collapse order.

3. **Built the money primitives.** `packages/contracts/src/money.ts` — `bigint` minor units, branded
   `CurrencyCode`, `allocate` by largest remainder, basis points for rates. Minor-unit exponents
   derive from `Intl` rather than a hand-maintained table.

4. **Built `Result<T, E>` and `DomainError`,** with `code`, `title`, `detail`, and `action` all
   required, so the manifesto's "what happened, why, what next" is enforced by the compiler rather
   than by review.

5. **Built log redaction** with two independent strategies — key-fragment matching and value-pattern
   matching for known secret shapes.

6. **Built the design token system** in oklch, Tailwind v4 `@theme inline` wiring, `MoneyDisplay`,
   and `MoneyInput`. Then found three real WCAG failures in the tokens and fixed them properly,
   which is the most instructive thing in this session — see
   [Architectural decisions](#architectural-decisions).

7. **Built `apps/web`** — App Router shell, security headers, a health route that deliberately does
   not check downstream dependencies, skip link, zoom never blocked.

8. **Wired the browser suites into CI** and closed slice 0.

---

# Completed Tasks

- [x] `CLAUDE.md` — repository operating manual, authority order, invariants
- [x] `docs/product/implementation-plan.md` — all twelve slices, work items, exit conditions
- [x] pnpm 11 workspace, Turborepo, exact-pinned toolchain, `.npmrc`, `.nvmrc`
- [x] `packages/config` — tsconfig presets (base / library / next), ESLint flat configs (base / react / domain), Vitest configs (unit / integration)
- [x] `packages/contracts` — `Money`, `allocate`, `percentage`, `BasisPoints` (45 tests)
- [x] `packages/domain` — `Result<T, E>`, `DomainError` (15 tests)
- [x] `packages/telemetry` — recursive, cycle-safe redaction (35 tests)
- [x] `packages/db` — skeleton with enforced boundaries
- [x] `packages/ui` — tokens, Tailwind v4 theme, `MoneyDisplay`, `MoneyInput`, `format`/`parse` (125 tests)
- [x] Design token WCAG 2.2 AA correction across both themes, with a token-level contrast test
- [x] `apps/web` — Next 16 App Router, root layout, health route, security headers
- [x] Playwright config, smoke suite, axe accessibility suite (18 tests, 2 projects)
- [x] `.github/workflows/ci.yml` — verify, browser, audit, secret-scan jobs
- [x] Import-boundary enforcement verified by linting a deliberate violation, then deleting it
- [x] `pnpm verify` green end to end — slice 0 exit condition met

---

# Active Task

**Slice 1, work item 1.1 — `packages/db`: Drizzle setup, migration runner, connection management.**

Not started. It is the first item of slice 1 and everything else in the slice depends on it. Read
[ADR-0005](./docs/adr/0005-postgres-and-drizzle.md) and
[ADR-0012](./docs/adr/0012-multi-tenancy.md) before writing any of it — the connection layer is
where the tenant session variable is set, and getting that wrong makes RLS decorative.

**One blocker remains.** Slice 0 is committed, so the risk of losing it to a stray git command is
gone. How Postgres runs locally is step 2 of [Next Immediate Actions](#next-immediate-actions) and
is still open. Do not start 1.1 until it is closed; `packages/db` has migrations that need a
database to run against.

---

# Next Immediate Actions

Execute in this order. Step 1 is done. Step 2 is the remaining blocker before `packages/db`.

1. **Get slice 0 into git history. Done.** Eight commits on `chore/slice-0-foundation`, branched
   from an empty root commit on `main`, with `pnpm verify` confirmed green beforehand. Not pushed;
   no remote exists. Detail and the reason for the empty root commit are in
   [Repository changes](#repository-changes).

2. **Decide and record how Postgres runs locally.** The first genuinely open decision of slice 1,
   and it is in no ADR. Docker Compose is the default answer. Whatever is chosen must also be what
   integration tests run against, and it needs a `.env.example` entry, a README entry, and an ADR —
   it is a toolchain decision every contributor inherits. Read
   `docs/adr/0005-postgres-and-drizzle.md` before deciding.

3. **Read the other two files that constrain this work**: `docs/adr/0012-multi-tenancy.md` and
   `docs/architecture/data-model.md`. The schema for slice 1 is already specified there; do not
   redesign it.

4. **Build 1.1 — `packages/db`.** Drizzle client, migration runner, connection management. The
   exported client must be tenant-scoped by construction. Feature code cannot be able to obtain an
   unscoped connection; if it can, item 1.4 is unbuildable and RLS is the only real defence.

5. **Build 1.2 — the schema**: `users`, `workspaces`, `workspace_members`, `audit_logs`. Every
   tenant table carries `workspace_id`.

6. **Build 1.3 — RLS policies and the session-setting mechanism**, then immediately write the test
   from the slice 1 exit condition that disables application-layer scoping and asserts zero rows.
   Write that test *before* trusting the policies. Two layers that fail together are one layer.

7. **Build 1.5 — the CI check** that fails the build when a tenant table lacks `workspace_id` or an
   RLS policy. It is cheap now and unenforceable later.

Items 1.6 onward (auth, screens, rate limiting) follow the plan. Items 1.13 (UI primitives) and
1.14 (CSP) are the two things deferred out of slice 0 into this slice; do not let them slip again.

---

# Remaining Roadmap

| Slice | Goal | State |
|---|---|---|
| 0 | Foundation | **Complete** |
| 1 | Identity, workspace, tenancy, audit log | **Next** |
| 2 | Ledger, outbox, idempotency | Planned |
| 3 | Catalogue | Planned |
| 4 | Storefront | Planned |
| 5 | Checkout and payments | Planned, partly gated on the entity-country question |
| 6 | Fulfilment | Planned |
| 7 | Customers and orders | Planned |
| 8 | Affiliate programme and attribution | Planned |
| 9 | Commission, holds, clawback | Planned |
| 10 | Analytics and AI surfaces | Planned |
| 11 | Payout execution | Gated |

The ordering rule that must not bend: **nothing that writes money merges before slice 2 is
complete.** Full detail, including per-slice exit conditions, in
[`docs/product/implementation-plan.md`](./docs/product/implementation-plan.md).

---

# Architectural Decisions

Decisions made or refined this session. Those with lasting architectural weight are recorded in the
ADRs; the rest are recorded here and in code comments at the point of effect.

### Build fewer packages than the architecture names

Five packages — `payments`, `storage`, `email`, `ai`, `jobs` — were not created. An empty package
with a placeholder `index.ts` is a directory, not architecture. What makes a module boundary real is
the enforcement, and that exists: `packages/config/eslint/domain.js` already names every future
package and every forbidden driver. Each package gets created by the slice that first needs it,
against a real interface rather than a guess. Recorded in the implementation plan.

### Build fewer UI components than the design system names

Work item 0.8 (Button, Input, Select, Dialog, Toast, Skeleton) moved to slice 1. Designing a Dialog
with no dialog to show produces an API shaped by imagination. The money primitives were the
exception because their contract — exact minor units, never a float — is fixed regardless of which
screen consumes them, and the design system makes them mandatory everywhere.

### `--border-control` as a distinct token

The most substantive design decision of the session. One `--border-default` token was serving two
roles: decorative hairlines (card edges, table rules), which WCAG 1.4.11 explicitly exempts, and
interactive control outlines, which must reach 3:1. At 1.44:1 it was correct for the first role and
a violation in the second. The fix was a second token, not a compromise value. When one token is
asked to satisfy two contrast rules, that is the shape of the answer.

### Contrast is verified numerically, at the token level

Three failures were found: `--content-tertiary` at 3.53:1, `--caution` at 4.25:1, and
`--border-default` at 1.44:1. Axe caught the first and third because something rendered them. It
structurally could not catch `--caution`, because no component uses it yet.

So `packages/ui/src/tokens/contrast.ts` implements oklch → oklab → LMS → linear sRGB → WCAG
luminance, and `contrast.test.ts` reads the real `tokens.css` and checks every foreground against
every surface in both themes. Exhaustive rather than hand-picked, because hand-picking is how
`--content-tertiary` passed on `--surface-base` while failing on `--surface-sunken`. The test also
asserts the primary > secondary > tertiary hierarchy survives, so a contrast fix cannot silently
flatten the type hierarchy.

### `apps/web` unit tests run in node, not jsdom

Component behaviour is tested in `packages/ui`, where the components live. What is unique to the app
is server-side. Adding a React plugin and a DOM environment to `apps/web` would be buying a second
DOM simulator to test compositions that Playwright already covers against a real browser.

### `allowDefaultProject` is sized per package

The shared ESLint base admits loose `*.ts` config files into the default project because a library
tsconfig only includes `src/`. `apps/web` includes `**/*.ts`, so its root config files are already
in the project service and the escape hatch becomes an error. Narrowed locally in
`apps/web/eslint.config.js` rather than by weakening the base — which would have cost every library
package type-aware linting of its `vitest.config.ts`.

The side effect is worth noting: `next.config.ts` is now genuinely type-aware linted, and
immediately surfaced a real `require-await` finding.

### CSP deliberately absent until slice 1

A nonce-based policy with no `unsafe-inline` must be generated per request in middleware. Shipping a
permissive policy now would be worse than shipping none, because it would look like the control
exists. Recorded in `apps/web/next.config.ts` and now tracked as work item 1.14.

### The health route does not check downstream dependencies

A health check that fails when Postgres is briefly unreachable causes the orchestrator to kill a
process that would have recovered. Liveness and readiness are different questions; this route
answers liveness.

### Toolchain pinned below latest, with reasons

TypeScript 6.0.3 (not 7.0.2) because `typescript-eslint@8.65.0` declares `typescript <6.1.0`.
ESLint 9.39.5 (not 10.8.0) because `eslint-plugin-jsx-a11y@6.10.2` supports ESLint `<=9`. Recorded
as an amendment to [ADR-0003](./docs/adr/0003-typescript-everywhere.md) with the constraint table,
so the next person to try upgrading knows what to check first.

### `Intl.NumberFormat` is given a string, never a number

`formatMoney` passes the decimal string. Passing a number would reintroduce float imprecision at the
last possible moment, after all the care taken upstream. String input is exact at any magnitude, and
the smoke suite renders `9_007_199_254_740_993n` to prove it.

### `parseMoneyInput` rejects excess precision rather than rounding

Silently turning a typed `10.005` into £10.01 is the kind of helpfulness that produces a support
ticket about a penny. It returns a discriminated result with `empty | malformed | too-precise`.

### `DomainError` requires all four fields

`code`, `title`, `detail`, `action` are non-optional. The manifesto says a user-facing error answers
what happened, why, and what to do next. Making the fields required moves that from a review
checklist item to a compile error.

---

# Documentation Updated

Created this session:

| File | What it is |
|---|---|
| `CLAUDE.md` | Repository operating manual. Authority order, standing rules, invariants, workflow |
| `docs/product/implementation-plan.md` | Executable expansion of all twelve slices |
| `STATE.md` | This file |

Modified this session:

| File | Change |
|---|---|
| `docs/adr/0003-typescript-everywhere.md` | Amendment recording the TypeScript 6 / ESLint 9 version pins and their causes |
| `README.md` | Status table updated to slice 0 complete; real "Getting started" section with commands |
| `CLAUDE.md` | Added §5a (tooling conventions), §5b (testing practice), §5c (accessibility and design); `STATE.md` added to the authority order |
| `docs/product/implementation-plan.md` | Slice 0 items 0.9 and 0.10 marked done, exit condition marked met, items 1.13 and 1.14 added to slice 1 |

Unchanged and still authoritative: `manifesto.md`, `docs/product/milestone-1.md`,
`docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/adr/0001`–`0014`,
`docs/engineering/coding-standards.md`, `docs/engineering/definition-of-done.md`,
`docs/engineering/testing.md`, `docs/engineering/security.md`, `docs/design/design-system.md`.

---

# Repository Changes

**Slice 0 is committed.** Eight commits on `chore/slice-0-foundation`, 107 files. Not pushed, and no
remote is configured, so the lost-machine risk is reduced rather than removed.

```
0e8115a  chore: initialise repository                                   (on main, empty)
860c792  chore: pnpm workspace, toolchain, and CI
f0d0f44  feat(contracts): money as bigint minor units
41cc77c  feat(domain): Result and DomainError
effa999  feat(telemetry): log redaction
dc118a6  feat(db): package skeleton with enforced import boundaries
ad8cfa1  feat(ui): design tokens and money components
34e8ad8  feat(web): app shell, health route, security headers
         docs: manifesto, ADRs, standards, operating manual, and plan
```

**Why `main` carries an empty root commit.** `CLAUDE.md` §7 says branch from `main` and never commit
to it. `main` had no commits, so there was nothing to branch from and no merge target existed. One
commit carrying no work makes `main` real and keeps the rule intact in substance. It was approved
explicitly before being run. Every commit with content is on the branch.

Two things a reviewer should know. Only the branch tip is verified green; intermediate commits are
not individually runnable, because workspace packages reference each other, which is normal for an
initial import. And the eight-commit split replaces the five-commit sketch that used to be in
[Recommendations](#recommendations), which had no home for `domain`, `telemetry`, or `db`.

The 107 files, by area:

| Area | Files |
|---|---|
| Root config | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.nvmrc`, `.gitignore`, `.prettierrc.json`, `.prettierignore` |
| CI | `.github/workflows/ci.yml` |
| Docs | 24 files across `docs/adr`, `docs/architecture`, `docs/engineering`, `docs/design`, `docs/product`, plus `manifesto.md`, `README.md`, `CLAUDE.md`, `STATE.md` |
| `packages/config` | 8 files — tsconfig presets, ESLint configs, Vitest configs |
| `packages/contracts` | `money.ts` + 45 tests |
| `packages/domain` | `result.ts` + 15 tests |
| `packages/telemetry` | `redact.ts` + 35 tests |
| `packages/db` | Skeleton |
| `packages/ui` | Tokens, theme, money components, contrast harness + 125 tests |
| `apps/web` | App shell, health route, Playwright config, 2 e2e suites |

Changes made in the final stretch of this session, listed because they are recent and unreviewed:

- `apps/web/vitest.config.ts` — new; one-line re-export so `passWithNoTests` applies
- `apps/web/eslint.config.js` — narrowed `allowDefaultProject` to `*.js`, `*.mjs`
- `apps/web/next.config.ts` — targeted `require-await` disable on `headers()` with its reason
- `turbo.json` — added the `test:e2e` task, depending on the package's own `build`
- `package.json` — added the `test:e2e` script
- `.prettierignore` — added `next-env.d.ts`, which Next rewrites on every build
- `.github/workflows/ci.yml` — added the `browser` job

---

# Technical Debt

| # | Item | Why it is debt | When it should be paid |
|---|---|---|---|
| 1 | No Content Security Policy | The app ships security headers but no CSP. A nonce-based policy needs middleware | Slice 1, item 1.14 |
| 2 | Typeface families unresolved | Tokens use `ui-serif` / `ui-sans-serif` stacks pending brand lock | Whenever open item 4 resolves. One-token change by design |
| 3 | Colour values are a working foundation | Verified against WCAG, not chosen by a brand process | Brand lock. The contrast test protects the change |
| 4 | `packages/db` is an empty skeleton | Its shape follows the schema, which slice 1 defines | Slice 1, item 1.1 |
| 5 | No integration test infrastructure | `integrationConfig` exists in `packages/config`; nothing runs against a real Postgres | Slice 1, alongside the database decision |
| 6 | CI has no Turborepo remote cache | Every job re-runs identical work. Fine at this size, wasteful later | When CI time becomes annoying, not before |
| 7 | Playwright runs Chromium only | Both projects are Chromium-based. No Firefox or WebKit coverage | Before a public storefront ships (slice 4) |
| 8 | `test:a11y` script has no CI job of its own | Its specs run inside `test:e2e`; a separate job would rebuild the app to re-run a subset | Only if a distinct PR status check is wanted |
| 9 | No `.env.example` | Nothing needs configuration yet | Slice 1 |
| 10 | Lighthouse CI not wired up | The performance budget exists in the docs; nothing enforces it | Slice 4, when there is a page worth measuring |

---

# Risks & Open Questions

### Carried from the scope contract

**Open item 1 — the operating entity's country.** Determines payment provider eligibility and
cross-border payout rules. Blocks slice 5.8 (live credentials) and gates slice 11. Everything up to
5.7 can proceed on test credentials. This is the open question that matters soonest.

**Open item 4 — brand lock.** Blocks nothing. The token system is built so that resolving it is a
token swap.

Full list in [`docs/product/milestone-1.md`](./docs/product/milestone-1.md#7-open-items).

### Raised this session

**Local Postgres has no decision.** Nothing records how the database runs locally or in integration
tests. This is the first thing slice 1 needs and should be settled and written down before item 1.1,
not discovered during it.

**Nothing is pushed.** Slice 0 is committed locally, but there is no git remote, so a lost machine
still loses it. Adding a remote and pushing is outward-facing and takes its own go-ahead.

**A GitHub personal access token was pasted into a chat session** on 2026-08-01 and must be treated
as compromised. Revoke it. For pushing, prefer `gh auth login` or an SSH remote so no credential is
written to `.git/config`. The `secrets` CI job scans full history, so a token that ever lands in a
commit fails the build permanently rather than once.

**RLS is the risk that cannot be repaired later.** Slice 1's exit condition includes disabling
application-layer scoping and asserting zero rows. That test must be written before the policies are
trusted, not after. A misconfigured policy that silently permits everything looks identical to a
correct one until it does not.

**Turborepo caching can mask a stale build.** `pnpm verify` reported `FULL TURBO` on the final run.
That is correct behaviour, but when investigating something that "should not still be failing",
`turbo run … --force` is the check.

### Assumptions made, and how to overturn them

| Assumption | Basis | If wrong |
|---|---|---|
| Single currency for M1 | The scope contract implies one currency per workspace | Slice 3's pricing model and the ledger account structure both change. Far cheaper now than after slice 9 |
| Stripe Connect is the first payment adapter | ADR-0007 names it, gated on open item 1 | Slice 5 gains an adapter-selection item. The port is unaffected — that is the point of the ADR |
| One engineer is building | No team signals | The dependency graph in the implementation plan already shows where work parallelises |
| Node 24 and pnpm 11 are available on CI runners | `.nvmrc` and `packageManager` pin them | The `verify` job fails at setup, loudly |

---

# Recommendations

**Settle the local Postgres story before writing any of `packages/db`.** Docker Compose is the
obvious default. What matters is that the same thing serves local development and integration tests,
and that it is written down. Discovering the decision halfway through item 1.1 means rewriting the
connection layer.

**Write the RLS bypass test first.** Slice 1's third exit condition — application scoping disabled,
still zero rows — is the only one that proves the two layers are independent. Write it against the
policies as they are built, not after the slice looks finished.

**Ask about the first commit early.** Slice 0 is a natural boundary and a large one. Suggested
shape: `chore: monorepo toolchain and CI`, `feat(contracts): money primitives`,
`feat(ui): design tokens and money components`, `feat(web): app shell`, `docs: operating manual and
implementation plan`. Branch first; `CLAUDE.md` forbids committing to `main`.

**Extend the token contrast test as tokens gain roles.** It currently covers text foregrounds and
control borders against three surfaces. When slice 1 adds Button and Toast, `--accent-content` on
`--accent` and every `*-subtle` pairing need adding. The test only protects what it enumerates.

**Keep using the invariants as a checklist, not a preamble.** The eight in `CLAUDE.md` §4 are
specific enough to check a diff against. The two that will bite first in slice 1 are double-enforced
tenancy and no external I/O inside a transaction.

**Do not let slice 1 grow.** It has fourteen work items and two of them arrived by deferral from
slice 0. Auth is the classic slice where scope creeps, because every adjacent feature feels like it
belongs. The exit conditions are written; hold to them.

---

# Session Handoff Prompt

Copy this verbatim into a new Claude Code session.

---

You are the founding CTO and engineering team for **CreatorHub**, not a code generator. Pick up the
project exactly where the previous session left it.

**First, read these in order. Do not skip any, and do not start work before finishing them.**

1. `manifesto.md` — product vision. Highest authority in the repository.
2. `CLAUDE.md` at the repository root — the operating manual. Note the authority order in §1, the
   four standing rules in §2, the eight invariants in §4, and the local conventions in §5a–§5c.
3. `~/.claude/CLAUDE.md` — the global engineering rules that §2 restates.
4. `STATE.md` — where the project actually is, what was decided and why, what is deferred, and what
   is open.
5. `docs/product/implementation-plan.md` — the slice you are about to work on, its work items, and
   its exit conditions.
6. `docs/product/milestone-1.md` — scope and the open items.
7. The ADRs relevant to the active task. For slice 1 that is `docs/adr/0005-postgres-and-drizzle.md`
   and `docs/adr/0012-multi-tenancy.md`; also read `docs/architecture/data-model.md`.

**Then discover the tooling available to you.** List `~/.claude/skills/` and read
`~/.claude/skills/gstack/SKILL.md` for the full routing table. Read the frontmatter of the
sub-skills rather than every body — there are 58 of them and reading them whole wastes the context
you need for the work. `CLAUDE.md` §5 maps repository workflow stages to specific skills; use them
rather than reimplementing what they already do. Check for project-local skills under `.claude/`.

**Then audit the repository before changing it.** Run `pnpm install`, then `pnpm verify` and confirm
22/22 green. Run `git status` and confirm the working tree still matches what `STATE.md` describes.
If it does not, reconcile the difference before writing anything, and say what changed.

**Then close the two blockers, in this order, before writing any slice 1 code.** Both are named in
`STATE.md` and both need a decision from me, so bring each one to me with a recommendation rather
than a question:

1. **Nothing in this repository has ever been committed.** All of slice 0 is an untracked working
   tree on `main`. Confirm `pnpm verify` is green, then propose the branch name and the five-commit
   split from the Recommendations section of `STATE.md`, and wait for my go-ahead before running
   anything. `CLAUDE.md` §7 says do not commit unasked and never commit directly to `main` — so
   branch first. Once it is committed, update `STATE.md` to stop describing the tree as uncommitted.

2. **How Postgres runs locally has never been decided,** and slice 1 cannot start without it. Read
   `docs/adr/0005-postgres-and-drizzle.md`, then recommend an approach — Docker Compose is the
   obvious default — and say what it means for integration tests in CI, since the same choice has to
   serve both. Write it up as an ADR, add the `.env.example` entry and the README section, and only
   then move on.

**Then continue from the Active Task in `STATE.md`,** following the Next Immediate Actions in order.
Do not redo completed work. The completed-tasks checklist in `STATE.md` is accurate; trust it.

**Constraints that are not negotiable:**

- Preserve every architectural decision already recorded. If you believe one is wrong, say so and
  write an ADR recording the tension — do not silently reverse it.
- `pnpm verify` must be green before anything is offered for review.
- Do not commit or push unless asked. Prepare the change and say it is ready. Nothing in this
  repository has been committed yet; raise that with the user early rather than acting on it.
- Money is `bigint` minor units with a currency attached. `number` for money fails lint.
- Tenancy is enforced twice, in repositories and in Postgres RLS, and the two must be provably
  independent.
- No external I/O inside a database transaction.
- The domain never names a provider.
- Follow the writing style in `CLAUDE.md` §8 for all documentation and comments: direct, concrete,
  no em dashes, and none of the words it bans.

**How to work:** think before coding and state your assumptions. Write the minimum code that
satisfies the requirement. Touch only what the task requires — a diff containing unrelated
reformatting is rejected in review regardless of how correct the intended change is. Define
verifiable success criteria before executing.

Where information is missing, make the best engineering decision for long-term product quality and
document it. Challenge weak ideas, including mine, when you believe there is a better solution. Do
not ask permission for every implementation detail — but stop and ask when a choice is expensive to
reverse: schema, money, tenancy, provider, or public API.

Keep `STATE.md` current as you go. The repository, not the conversation, is the source of truth.

Start by reading the files above. Then tell me what you found, and come straight to the two blockers
with your recommendations for each.
