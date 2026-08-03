# STATE

**Last updated:** 2026-08-03
**Branch:** `chore/slice-0-foundation`
**Committed:** 26 commits. Not pushed, and no remote is configured.

This file is the live position of the project. `README.md` says what CreatorHub is, `CLAUDE.md` says
how to work here, the ADRs say why the architecture is what it is. This says where we are.

---

# Current Status

**Slice 0 complete. Slice 1 is 8 of 14 items done.** Tenant isolation is built, enforced twice, and
each layer is proved to work with the other one absent. Authentication is complete and proved against
a real database. Authorisation is a separate module in the domain, as ADR-0006 requires.

| Gate | Result |
|---|---|
| `pnpm verify` | 28/28 turbo tasks green, plus export check and `prettier --check` clean |
| `pnpm test` | 394 unit tests across 15 files |
| `pnpm test:integration` | 131 tests across 7 files, against real Postgres |
| `pnpm check:tenancy` | Passes: every table scoped and protected by a policy |
| `pnpm check:exports` | Passes: every advertised entry point exists after a build |
| `pnpm test:e2e` | 18 Playwright tests, axe clean in light and dark |

| Package | State |
|---|---|
| `packages/config` | TypeScript presets, three ESLint flat configs, Vitest unit and integration configs |
| `packages/contracts` | `Money`, branded identifiers, `WorkspaceContext`. 83 tests |
| `packages/domain` | `Result<T, E>`, `DomainError`, and the authorisation policy. 69 tests. Import boundaries enforced |
| `packages/telemetry` | Log redaction. 35 tests |
| `packages/ui` | Design tokens, Tailwind v4, `MoneyDisplay`, `MoneyInput`, contrast harness. 125 tests |
| `packages/db` | Connection layer, schema (identity and auth), RLS, repository base, isolation suite, tenancy check. 51 unit tests plus 99 integration |
| `apps/web` | Next 16 App Router shell, health route, security headers, Playwright + axe |
| `payments`, `storage`, `email`, `ai`, `jobs` | Not created. Each arrives with the slice that needs it |

Authentication and authorisation are done. No screens yet and no money path. `packages/auth` owns
sign-in, sign-up, Argon2id hashing, session policy, password reset, and revocation, connecting as its
own database role. `packages/domain` decides what a role may do.

---

# Session Summary

Closed both former blockers, then built the tenancy foundation: slice 1 items 1.1, 1.2, 1.3, 1.4,
1.5, and 1.12. Six commits, each one work item, each verified green before the next started.

1. **Committed slice 0.** Nothing had ever been committed. Eight commits on a branch off an empty
   root commit on `main`, because `main` had no commits and `CLAUDE.md` §7 forbids committing to it.

2. **Settled how Postgres runs** ([ADR-0015](./docs/adr/0015-local-postgres.md)). Compose for
   development, Testcontainers for tests, one pinned image, and two database roles.

3. **Recorded Razorpay and India** ([ADR-0016](./docs/adr/0016-razorpay-first-adapter.md)). ADR-0007
   named Stripe Connect; that is now amended rather than edited, per ADR-0001.

4. **Built the connection layer** (1.1). `withWorkspace` sets the tenant transaction-locally. No
   unscoped client is reachable from outside the package.

5. **Built the schema** (1.2). Four tables, plus the constraints that make governance and audit
   history enforceable rather than merely intended.

6. **Built RLS** (1.3), then broke it deliberately to prove the tests detect a leak.

7. **Built the repository base and the isolation suite** (1.4, 1.12), then added an unregistered
   method to prove the completeness check fails.

8. **Built the tenancy CI check** (1.5), then added an unprotected table to prove it fails.

The pattern in 6, 7, and 8 is the point. A security test that has never failed is a security test
that might not work.

---

# Completed Tasks

Slice 0, all items: see [Repository changes](#repository-changes) for the commit list.

Slice 1:

- [x] **1.1** `packages/db` — config validated at boot, pooled client, `withWorkspace`, migration
      runner with an advisory lock, Testcontainers harness
- [x] **1.2** Schema — `users`, `workspaces`, `workspace_members`, `audit_logs`, with citext,
      UUIDv7, one-owner index, and audit history protected by `ON DELETE restrict`
- [x] **1.3** RLS on all four tables, `ENABLE` plus `FORCE`, `USING` and `WITH CHECK`, and
      `audit_logs` append-only at both the policy and privilege level
- [x] **1.4** Tenant-scoped repository base, plus the first repository as the worked example
- [x] **1.5** Tenancy CI check reading the live catalogue, wired into the integration job
- [x] **1.6** Better Auth against the third role: Argon2id, sessions, verification, password reset,
      CSRF via trusted origins, revocation and device list. Column mapping is explicit per field
      ([ADR-0018](./docs/adr/0018-email-verification-two-columns.md) for `email_verified`).
      20 integration tests against real Postgres
- [x] **1.8** Authorisation policy in `packages/domain`. Closed permission union, exhaustive role
      table, workspace checked before role. 54 tests
- [x] **1.12** Isolation suite with a registry and a completeness check
- [x] Branded identifiers and `WorkspaceContext` in `packages/contracts`
- [x] CI integration job, deferred by ADR-0015 until there was a test to run

---

# Active Task

**Slice 1 item 1.10, the audit log writer with monthly partitioning.**

`security.md` requires the audit log be partitioned monthly. The table is still empty, so
partitioning it now costs one migration and later costs a data migration. Founder decision: do it
now, do not defer.

Three things this item has to establish, and the order matters because each depends on the last.

**Partition `audit_logs` by month on `occurred_at`.** The table already exists and is unpartitioned,
so this is a rename, a new partitioned parent, and a copy. Empty, so the copy is free. The primary
key has to include the partition key, which means `(id, occurred_at)` rather than `id` alone; that is
a Postgres requirement rather than a modelling choice and belongs in a comment.

**Create partitions ahead of time.** A month with no partition rejects every insert, which fails the
write path rather than degrading it. A job creates the next few months; the first ones are created by
the migration itself so a fresh database can accept writes immediately.

**Append-only, enforced by the database.** ADR-0008's mechanism: `REVOKE UPDATE, DELETE` from
`creatorhub_app`, so the application cannot rewrite history even deliberately. Migration 0001 already
did this for the unpartitioned table, and grants do not follow a table through a rename and a
recreate, so this needs redoing and re-proving.

The writer itself goes in `packages/db` as a repository, takes a `WorkspaceContext`, and hashes the
IP with a rotating salt at write time per the schema comment. `actor_id` is deliberately not a
foreign key: history has to survive the deletion of whoever caused it.

The two remaining slice 1 exit conditions are the not-found-versus-forbidden check, which needs an
HTTP layer, and the isolation suite covering every repository, which is continuous rather than a
milestone.

---

# Remaining Roadmap

| Slice | Goal | State |
|---|---|---|
| 0 | Foundation | **Complete** |
| 1 | Identity, workspace, tenancy, audit log | **8 of 14 done.** Audit log writer next |
| 2 | Ledger, outbox, idempotency | Planned |
| 3 | Catalogue | Planned |
| 4 | Storefront | Planned |
| 5 | Checkout and payments | Planned. Unblocked by ADR-0016 |
| 6 | Fulfilment | Planned |
| 7 | Customers and orders | Planned |
| 8 | Affiliate programme and attribution | Planned |
| 9 | Commission, holds, clawback | Planned |
| 10 | Analytics and AI surfaces | Planned |
| 11 | Payout execution | Gated |

**Nothing that writes money merges before slice 2 is complete.**

---

# Architectural Decisions

New ADRs: [0015](./docs/adr/0015-local-postgres.md),
[0016](./docs/adr/0016-razorpay-first-adapter.md),
[0017](./docs/adr/0017-authentication-database-role.md),
[0018](./docs/adr/0018-email-verification-two-columns.md). ADR-0001 forbids editing an accepted
record, so 0016 amends 0007 and 0018 extends 0006 rather than changing either.

### One fact, two columns, and a trigger keeping them in step

Better Auth declares `user.emailVerified` as a required boolean. Our column is
`email_verified_at TIMESTAMPTZ NULL`, which answers "when" as well as "whether", and Postgres will
not take a boolean into a timestamp.

Both columns now exist and the timestamp is derived from the boolean by trigger
([ADR-0018](./docs/adr/0018-email-verification-two-columns.md)). One direction only: the library
writes the flag, the trigger writes the timestamp, and nothing writes the timestamp directly. The
alternative was giving up information the audit path needs in order to match a dependency's
convenience.

The rule lives in the database rather than in `packages/auth`, for the same reason the one-owner
constraint is a partial unique index: a rule in application code is a rule some future call site can
skip.

### Column mapping is per field, and `casing` does not do it

`casing` exists in Better Auth 1.6, but only on the `{ dialect, type }` and `{ db, type }` shapes of
the `database` option, and it governs table names. Passing a `pg.Pool`, which is what the role split
requires, means it is never read. An earlier `AUTH_DATABASE_CASING` export was inert, and every
`snake_case` column would have failed at runtime on first use.

The supported mechanism is `fields` per model. Every field whose name differs from our column is
listed explicitly in `packages/auth/src/auth.ts`. Removing one entry fails 16 of 20 integration
tests, which is how the mapping was confirmed to be load-bearing rather than decorative.

### The auth pool is created by the caller

`createAuthDatabase` returns a `pg.Pool` and `createAuthOptions` takes one. Constructing it inside
the options object made it unreachable, so nothing could close it: a process that will not exit, and
a test container stopped while connections are open, which reports SQLSTATE `57P01` on assertions
that have nothing to do with the cause.

### Authorisation is a table, and the workspace is checked first

`packages/domain/src/identity/policy.ts` per ADR-0006. Permissions are a closed union so a typo is a
compile error, and the role table is a `Record` over the role union so adding a role without granting
it anything fails to compile.

`authorise` compares the workspace before the role, because an owner of workspace A holds every
permission and answering "may they delete workspace B" by role alone says yes. The refusal names
neither the workspace nor the role: the slice 1 exit condition requires that a request carrying the
wrong workspace learns nothing, and a distinct message would be exactly the leak it forbids.

An admin deliberately cannot change roles. An admin who can promote is an admin who can make
themselves an owner, which makes every owner-only permission decorative.

### Two Postgres roles, not one

The decision with the longest reach. `creatorhub_app` connects the application and every integration
test and cannot bypass RLS. `creatorhub_migrator` owns the schema and runs migrations.

A superuser ignores RLS policies silently. Had the application connected as one, the slice 1 exit
condition would pass whether the policies were correct, broken, or absent, and the second isolation
layer would be decorative while looking finished.

The split also gives ADR-0008 its mechanism: `UPDATE` and `DELETE` can be revoked at the role level
precisely because the application does not own its tables. `audit_logs` already uses it.

### `WorkspaceContext` is explicit, and an object

Passed as a parameter rather than held in `AsyncLocalStorage`. Ambient context fails by leaking
across an await boundary in a way no reviewer can see. For the one value whose misuse means a creator
reads another creator's customer list, hard to misuse beats pleasant to use. A convenience wrapper
may later resolve a context and call through to the same functions.

An object carrying `workspaceId`, `requestId`, and an optional `actorId`, because the audit log needs
all three and threading three parameters invites getting the order wrong. Ids are branded and
validated as UUIDv7, so a user id cannot be passed where a workspace id belongs.

### The tenant setting is transaction-local

`set_config('app.workspace_id', $1, true)`. The third argument is the whole decision. A plain `SET`
outlives the transaction, and on a pooled connection the next borrower inherits the previous tenant's
id: a cross-tenant read with no bug visible at any call site. The value is bound rather than
interpolated, which is also why `set_config` is used instead of `SET LOCAL`, which cannot take a
parameter.

### Security tests are verified by breaking the thing they guard

Three times this session. The RLS policies were rewritten to `USING (true)` and 12 tests failed
including the exit condition. An unregistered repository method was added and the completeness check
failed with a message naming the fix. A table with no `workspace_id` was added and the tenancy check
reported four violations and exited non-zero. Each was reverted.

A security test that has never failed is a security test that might not work. This is now the
expected practice for anything guarding an invariant.

### The tenancy check reads the catalogue, not the schema files

A table created by hand-written SQL, and every table Better Auth creates in 1.6, never appears in
`schema/index.ts`. A check that read TypeScript would pass while an unprotected table sat in
production.

### Two tables have no `workspace_id`, on purpose

`users`, because a person may belong to several workspaces, so no single one owns the row. Its policy
derives visibility from shared membership instead. `workspaces`, because it is the tenant root and is
identified by id rather than scoped by one. Both are declared in `NON_TENANT_TABLES` with the reason,
so the check can tell a deliberate omission from a forgotten column.

`audit_logs.workspace_id` is nullable, because platform-level actions have no workspace. Its policy
admits only the current tenant, so platform rows are invisible to every tenant.

### Carried from slice 0

`--border-control` as a token distinct from `--border-default`, because WCAG exempts decorative
hairlines but requires 3:1 for control outlines, and one token cannot satisfy both. Contrast verified
numerically at the token level rather than only through rendered components. `apps/web` unit tests
run in node, not jsdom. Toolchain pinned below latest with recorded reasons. `Intl.NumberFormat` is
given a string, never a number. `parseMoneyInput` rejects excess precision rather than rounding.
`DomainError` requires all four fields.

---

# Documentation Updated

| File | Change |
|---|---|
| `docs/adr/0015-local-postgres.md` | New. How Postgres runs, with a verification table |
| `docs/adr/0016-razorpay-first-adapter.md` | New. Razorpay, India, INR, GST, 5% fee. Amends 0007 |
| `docs/adr/0017-authentication-database-role.md` | New. The third role, and why authentication cannot use the application one |
| `docs/adr/0018-email-verification-two-columns.md` | New. `email_verified` and `email_verified_at`, and the trigger between them |
| `docs/adr/README.md` | All four new records indexed; 0006 and 0007 point at what extends them |
| `docs/product/implementation-plan.md` | Slice 1 items 1.1 to 1.6, 1.8, and 1.12 marked done; slice 5 unblocked; 5.8 is now Razorpay |
| `README.md` | Database section and the `db:*` scripts |
| `.env.example` | New. Both connection strings, with the role split explained |
| `STATE.md` | This file |

Unchanged and still authoritative: `manifesto.md`, `docs/product/milestone-1.md`,
`docs/architecture/*`, `docs/adr/0001`–`0014`, `docs/engineering/*`, `docs/design/design-system.md`.

---

# Repository Changes

26 commits on `chore/slice-0-foundation`. Not pushed; no remote configured.

```
01ae664  feat(domain): the authorisation policy module                       (1.8)
0ea7d11  feat(auth): map the columns, own the pool, and prove sign-in        (1.6b)
0d79110  feat(db): the boolean Better Auth needs, timestamp derived from it  (ADR-0018)
d0b8904  chore(config): use the dot reporter for integration runs
2066995  feat(db): expose a testing subpath for cross-package tests
6833d9d  feat(auth): Better Auth configured against the third database role
f8c650c  docs: record the authentication schema and correct the handoff
f7def8c  feat(db): authentication tables and a third Postgres role           (1.6a, ADR-0017)
344b8b2  fix(db): restore the build rootDir so the package is importable
988a36b  docs: record the tenancy foundation as complete
53a78c4  feat(db): CI check that a tenant table cannot ship unprotected      (1.5)
8d56780  feat(db): tenant-scoped repository base and isolation suite         (1.4, 1.12)
4524f6d  feat(db): row level security, the second isolation layer            (1.3)
aee294c  feat(db): identity and tenancy schema                              (1.2)
165dcd9  docs: record Razorpay as the first payment adapter                  (ADR-0016)
c71d405  feat(db): tenant-scoped connection layer and migration runner       (1.1)
0758ecf  feat(db): local Postgres via Compose, with two roles for RLS        (ADR-0015)
c3f6703  docs: manifesto, ADRs, standards, operating manual, and plan
34e8ad8  feat(web): app shell, health route, security headers
ad8cfa1  feat(ui): design tokens and money components
dc118a6  feat(db): package skeleton with enforced import boundaries
effa999  feat(telemetry): log redaction
41cc77c  feat(domain): Result and DomainError
f0d0f44  feat(contracts): money as bigint minor units
860c792  chore: pnpm workspace, toolchain, and CI
0e8115a  chore: initialise repository                                        (empty, on main)
```

**Why `main` carries an empty root commit.** `CLAUDE.md` §7 says branch from `main` and never commit
to it. `main` had no commits, so there was nothing to branch from and no merge target existed. One
commit carrying no work makes `main` real and keeps the rule intact in substance. Approved
explicitly before it was run.

Only branch tips are verified green. Intermediate slice 0 commits are not individually runnable,
because workspace packages reference each other, which is normal for an initial import.

---

# Technical Debt

| # | Item | Why it is debt | When it should be paid |
|---|---|---|---|
| 1 | No Content Security Policy | Security headers ship but no CSP. A nonce-based policy needs middleware | Slice 1, item 1.14 |
| 2 | Typeface families unresolved | Tokens use `ui-serif` / `ui-sans-serif` pending brand lock | Whenever open item 4 resolves. One-token change |
| 3 | Colour values are a working foundation | Verified against WCAG, not chosen by a brand process | Brand lock. The contrast test protects the change |
| 4 | ~~`packages/db` is an empty skeleton~~ | Paid. Connection layer, schema, RLS, repositories | Done |
| 5 | ~~No integration test harness~~ | Paid. Testcontainers harness, 74 tests, CI job | Done |
| 6 | CI has no Turborepo remote cache | Every job re-runs identical work | When CI time becomes annoying |
| 7 | Playwright runs Chromium only | No Firefox or WebKit coverage | Before a public storefront ships (slice 4) |
| 8 | `test:a11y` has no CI job of its own | Its specs run inside `test:e2e` | Only if a distinct status check is wanted |
| 9 | ~~No `.env.example`~~ | Paid with ADR-0015 | Done |
| 10 | Lighthouse CI not wired up | The performance budget exists in docs; nothing enforces it | Slice 4 |
| 11 | Each integration test file starts its own container | Four files, four containers, about 8 seconds of startup | When it becomes a material share of CI time. A shared template database and per-test schemas is the fix |
| 12 | `users` INSERT policy is `WITH CHECK (true)` | Sign-up creates a user before any membership exists, so it cannot require one. Better Auth now owns the sign-up path and connects as `creatorhub_auth`, whose policy is separate, so the app role's `WITH CHECK (true)` is now unused rather than load-bearing | Tighten to `false` for `creatorhub_app` once no code path signs up through it |
| 13 | Only one repository exists | `workspace-members`. The isolation suite pattern is proved but thinly exercised | Continuously, as repositories arrive |
| 14 | No mailer, so verification and reset emails go nowhere | `sendVerificationEmail` and `sendResetPassword` are async no-ops. Tokens are created and stored; nothing delivers them | Slice 6, when `packages/email` arrives |
| 15 | The policy module has no call sites | Every rule is tested, and nothing routes through it yet. A rule table nobody consults is documentation | 1.11, when the screens arrive |

---

# Risks & Open Questions

### Resolved this session

**Open item 1, the operating entity's country.** India. Razorpay is the first adapter, currency is
INR, tax is GST. Recorded in ADR-0016. Slice 5 is unblocked to 5.7 on test credentials.

**Platform fee.** Configurable, 5% default, stored in basis points and snapshotted per order.

**Root domain.** `creatorhub.com`, storefronts at `username.creatorhub.com`.

### Still open

**Open item 4, brand lock.** Blocks nothing. The token system makes resolving it a token swap.

**A GitHub personal access token was pasted into a chat session** on 2026-08-01 and must be treated
as compromised. Revoke it. It was never used, and it is in no file and no commit. For pushing, prefer
`gh auth login` or an SSH remote so no credential lands in `.git/config`. The `secrets` CI job scans
full history, so a token that ever lands in a commit fails the build permanently.

**Nothing is pushed and no remote exists.** A lost machine loses 26 commits. Adding a remote is
outward-facing and needs its own go-ahead.

**Port 5432 may already be taken.** On this machine an unrelated container holds it, so the compose
file takes `POSTGRES_PORT` and the working `.env` uses 5433. Anyone hitting "port is already
allocated" changes that one variable and both connection strings.

**~~Better Auth's tables will fail the tenancy check on first run.~~** Handled. The three tables are
declared in `AUTH_TABLES_WITHOUT_WORKSPACE` with reasons, and each has RLS enabled, forced, and a
policy scoped to the auth role. The check passes.

**The `verify` gate now runs `build` too,** so it is 28 tasks rather than 22. A build that is never
run locally is a build that breaks in CI, and `check:exports` proves the output is importable rather
than merely produced.

**Turborepo caching can mask a stale build.** `turbo run … --force` is the check when something
"should not still be failing".

### Assumptions, and how to overturn them

| Assumption | Basis | If wrong |
|---|---|---|
| One currency per workspace for M1 | Scope contract, now concretely INR | Slice 3 pricing and the ledger account structure both change. Far cheaper now than after slice 9 |
| One engineer is building | No team signals | The dependency graph shows where work parallelises |
| Node 24 and pnpm 11 on CI runners | `.nvmrc` and `packageManager` pin them | The `verify` job fails at setup, loudly |
| Postgres 18 everywhere | ADR-0015, one shared version constant | `uuidv7()` and the drift test both need revisiting |

---

# Recommendations

**Write the RLS policy for every new table in the same commit as the table.** The tenancy check
enforces this, so the alternative is a red build. Better to write it deliberately than to be told.

**Keep breaking security tests before trusting them.** Three times this session a test that passed
was only proved useful by making it fail. Do the same for the ledger balance trigger in slice 2,
where the failure mode is money rather than data.

**Do not let the isolation suite become a formality.** It currently covers one repository well. As
repositories arrive, the registry keeps them enumerated, but the quality of `readOwn` matters: if it
returns nothing, the corresponding `readForeign` assertion is vacuous.

**Push, or accept that a lost machine loses everything.**

**Extend the token contrast test as tokens gain roles.** When 1.13 adds Button and Toast,
`--accent-content` on `--accent` and every `*-subtle` pairing need adding. The test only protects
what it enumerates.

**Do not let slice 1 grow.** Eight items remain and two arrived by deferral from slice 0. Auth is the
classic slice where scope creeps, because every adjacent feature feels like it belongs.

---

# Session Handoff Prompt

Copy this verbatim into a new Claude Code session.

---

You are the founding CTO and engineering team for **CreatorHub**, not a code generator. Pick up the
project exactly where the previous session left it. The repository is at `~/creatorhub`.

**First, read these in order. Do not skip any, and do not start work before finishing them.**

1. `manifesto.md` — product vision. Highest authority in the repository.
2. `CLAUDE.md` — the operating manual. Note the authority order in §1, the four standing rules in §2,
   the eight invariants in §4, the local conventions in §5a–§5c, and the writing style in §8.
3. `~/.claude/CLAUDE.md` — the global engineering rules that §2 restates.
4. `STATE.md` — where the project actually is.
5. `docs/product/implementation-plan.md` — slice 1, and which items are already done.
6. `docs/product/milestone-1.md` — scope and open items.
7. For the active task, in this order: **`docs/engineering/security.md` first**, for the audit log
   requirements including monthly partitioning. Then `docs/adr/0008-double-entry-ledger.md` for the
   append-only mechanism this reuses, `docs/architecture/data-model.md` section 10 for the table, and
   `docs/adr/0012-multi-tenancy.md`.

**Then discover the tooling.** List `~/.claude/skills/` and read `~/.claude/skills/gstack/SKILL.md`
for the routing table. Read sub-skill frontmatter rather than every body; there are 58 and reading
them whole wastes the context you need for the work. `CLAUDE.md` §5 maps workflow stages to skills.

**Then audit before changing anything.** `pnpm install`, then `pnpm verify` and confirm **28/28**
green. **Run `pnpm db:reset`** after `cp .env.example .env`: the third database role from ADR-0017 is
created by the init script, which only runs on an empty data directory, so an older local database
does not have it. Then `pnpm test:integration` for **131** green and `pnpm check:tenancy` for a pass.
Run `git status` and confirm the tree is clean. If it does not match, reconcile before writing
anything and say what changed.

**Tenancy, authentication, and authorisation are done. Do not rebuild any of them.** Slice 1 items
1.1 through 1.6, 1.8, and 1.12 are complete. Trust the completed-tasks checklist.

**Continue from the Active Task in `STATE.md`,** which is item 1.10: the audit log writer with
monthly partitioning. Then 1.7 passkeys, 1.9 rate limiting, 1.13 UI primitives, 1.14 CSP, and 1.11
screens last because they consume 1.13.

**Two things about 1.10 that are easy to get wrong.** A partitioned table's primary key must include
the partition key, so it becomes `(id, occurred_at)`; that is Postgres, not a modelling choice.
And grants do not survive a table being renamed and recreated, so migration 0001's `REVOKE UPDATE,
DELETE` on `audit_logs` has to be reapplied and re-proved rather than assumed to carry over.

**The rate limits for 1.9 are already specified.** Five failed sign-ins per 15 minutes per account,
20 per hour per IP, exponential backoff, 429 with `Retry-After`. Password reset 3 per hour and 10 per
day per account, 20 per hour per IP. Verification resend 3 per hour. Sign-up 10 per hour per IP.
Better Auth has a `rateLimit` option with `customRules` and `storage: 'database'`, which needs a
`rateLimit` table that does not exist yet and will need a migration and a tenancy-check exemption.

**Constraints that are not negotiable:**

- Preserve every architectural decision already recorded. If you believe one is wrong, say so and
  write a new ADR recording the tension. ADR-0001 forbids editing an accepted record, so a changed
  mind produces a new ADR that supersedes or amends the old one.
- `pnpm verify` must be green before anything is offered for review.
- Do not commit or push unless asked. There is no remote and you must not create one.
- Money is `bigint` minor units with a currency attached. `number` for money fails lint.
- Tenancy is enforced twice, in repositories and in RLS, and the two must be provably independent.
- No external I/O inside a database transaction.
- The domain never names a provider. Razorpay appears only in `packages/payments`.
- Follow the writing style in `CLAUDE.md` §8 for all documentation and comments: direct, concrete, no
  em dashes, and none of the words it bans.

**How to work:** think before coding and state your assumptions. Write the minimum code that
satisfies the requirement. Touch only what the task requires; a diff containing unrelated
reformatting is rejected in review regardless of how correct the intended change is. Define
verifiable success criteria before executing.

**One practice worth keeping.** Every test guarding an invariant is verified by breaking the thing it
guards, then reverting. So far: RLS policies opened to `USING (true)`, an unregistered repository
method, an unprotected table, a renamed trigger, a removed column mapping, and an admin granted the
ability to promote themselves. Each failed the suite, and each was reverted. A security test that has
never failed is a security test that might not work.

Where information is missing, make the best engineering decision for long-term product quality and
document it. Challenge weak ideas, including mine. Do not ask permission for every implementation
detail, but stop and ask when a choice is expensive to reverse: schema, money, tenancy, provider, or
public API.

Keep `STATE.md` current as you go. The repository, not the conversation, is the source of truth.

Start by reading the files above, then tell me what you found and begin item 1.10.
