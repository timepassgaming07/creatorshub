# STATE

**Last updated:** 2026-08-02
**Branch:** `chore/slice-0-foundation`
**Committed:** 18 commits. Not pushed, and no remote is configured.

This file is the live position of the project. `README.md` says what CreatorHub is, `CLAUDE.md` says
how to work here, the ADRs say why the architecture is what it is. This says where we are.

---

# Current Status

**Slice 0 complete. Slice 1 is 6 of 14 items done, plus the database half of item 1.6.** Tenant
isolation is built, enforced twice, and each layer is proved to work with the other one absent.
Authentication has its schema, its own database role, and its isolation proved. The Better Auth
library integration is the next thing to write.

| Gate | Result |
|---|---|
| `pnpm verify` | 24/24 turbo tasks green, plus export check and `prettier --check` clean |
| `pnpm test` | 309 unit tests across 12 files |
| `pnpm test:integration` | 99 tests across 5 files, against real Postgres |
| `pnpm check:tenancy` | Passes: every table scoped and protected by a policy |
| `pnpm check:exports` | Passes: every advertised entry point exists after a build |
| `pnpm test:e2e` | 18 Playwright tests, axe clean in light and dark |

| Package | State |
|---|---|
| `packages/config` | TypeScript presets, three ESLint flat configs, Vitest unit and integration configs |
| `packages/contracts` | `Money`, branded identifiers, `WorkspaceContext`. 83 tests |
| `packages/domain` | `Result<T, E>` and `DomainError`. 15 tests. Import boundaries enforced |
| `packages/telemetry` | Log redaction. 35 tests |
| `packages/ui` | Design tokens, Tailwind v4, `MoneyDisplay`, `MoneyInput`, contrast harness. 125 tests |
| `packages/db` | Connection layer, schema (identity and auth), RLS, repository base, isolation suite, tenancy check. 51 unit tests plus 99 integration |
| `apps/web` | Next 16 App Router shell, health route, security headers, Playwright + axe |
| `payments`, `storage`, `email`, `ai`, `jobs` | Not created. Each arrives with the slice that needs it |

No auth code yet, no screens, no money path. The database is real, the tenancy model underneath it is
finished, and authentication has its schema and its own role waiting for the library.

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
- [x] **1.12** Isolation suite with a registry and a completeness check
- [x] Branded identifiers and `WorkspaceContext` in `packages/contracts`
- [x] CI integration job, deferred by ADR-0015 until there was a test to run

---

# Active Task

**Slice 1 item 1.6, second half — the Better Auth library integration.**

The database foundation is done and committed. What remains is `packages/auth`: the library
configuration, the Argon2id hook, session handling, CSRF, revocation, and login history.

**Start by reading [ADR-0017](./docs/adr/0017-authentication-database-role.md).** It records a
conflict found while starting this item and is the reason the first half took a whole commit.
Authentication is pre-tenant, so it must read a user row before any workspace is known, which the RLS
policies from 1.3 correctly forbid. Sign-up would have inserted a user that sign-in could never find.
The resolution is a third role, `creatorhub_auth`, with grants on the authentication tables and no
privilege on any business table.

What that means for the code you are about to write:

- **Connect as `DATABASE_AUTH_URL`,** not `DATABASE_URL`. The auth package gets its own pool. Using
  the application connection would fail on the first sign-in attempt for reasons that look like a
  library bug rather than a policy.
- **The tables already exist** and are declared in `packages/db/src/schema/auth.ts`. Do not run Better
  Auth's own migration generator: ADR-0005 rule 2 requires migrations be reviewed as SQL, and our
  declarations are the single source of truth.
- **Table and column names need remapping.** The library defaults to singular `user`, `session`,
  `account`, `verification` with camelCase columns. Ours are plural with `snake_case`. The mapping
  belongs in the configuration, in one place.
- **`emailVerified` needs care.** The library expects a boolean; we store `email_verified_at` as a
  nullable timestamp, which is strictly more information. The timestamp stays authoritative.

**Everything about session and rate-limit policy is decided** and recorded in ADR-0017: 30-day
absolute lifetime, 7-day idle, rotation on password, role, email, and passkey change and on
sign-out-everywhere, `HttpOnly` and `Secure` and `SameSite=Lax`, Argon2id at 19 MiB and 2 iterations
and parallelism 1. Rate limits are in the founder's instructions and belong to item 1.9.

---

# Next Immediate Actions

Founder-approved order, which differs from the numbering. 1.8 before 1.10, because the policy module
is pure functions over a role and has no audit dependency; only its call sites do, and those arrive
with the screens.

1. **1.6 second half.** `packages/auth`: Better Auth configuration against the third role, Argon2id
   hook, session policy, CSRF, session revocation, device list, login history.

2. **1.8 Authorisation policy module.** In `packages/domain`, not `packages/auth`. ADR-0006 names
   `domain/identity/policy.ts` and says authorisation is deliberately not delegated to the auth
   library. Pure functions over a role and a permission.

3. **1.10 Audit log writer, with monthly partitioning.** `security.md` requires the audit log be
   partitioned monthly, and the table is still empty, so this is free now and a rewrite later.
   Founder decision: do it now, do not defer.

4. **1.7 Passkeys**, then **1.9 rate limiting**. The limits are specified: 5 failed sign-ins per 15
   minutes per account, 20 per hour per IP, exponential backoff, 429 with `Retry-After`; password
   reset 3 per hour and 10 per day per account and 20 per hour per IP; verification resend 3 per
   hour; sign-up 10 per hour per IP.

5. **1.13 UI primitives**, then **1.14 CSP**. Both were deferred out of slice 0; do not let them slip
   again.

6. **1.11 Screens** last, because they consume 1.13.

Also required from 1.6 onward, per founder instruction: CSRF protection on state-changing requests,
session revocation, device management, login history with timestamp and IP and user agent, and
security header verification tests.

The two remaining slice 1 exit conditions are the not-found-versus-forbidden check, which needs an
HTTP layer, and the isolation suite covering every repository, which is continuous rather than a
milestone.

---

# Remaining Roadmap

| Slice | Goal | State |
|---|---|---|
| 0 | Foundation | **Complete** |
| 1 | Identity, workspace, tenancy, audit log | **6 of 14 done, plus 1.6's database half.** Auth library next |
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

New ADRs this session: [0015](./docs/adr/0015-local-postgres.md),
[0016](./docs/adr/0016-razorpay-first-adapter.md). ADR-0001 forbids editing an accepted record, so
0016 amends 0007 rather than changing it.

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
| `docs/adr/README.md` | Both new records indexed; 0007 points at its amendment |
| `docs/product/implementation-plan.md` | Slice 1 items 1.1 to 1.5 and 1.12 marked done; slice 5 unblocked; 5.8 is now Razorpay |
| `README.md` | Database section and the `db:*` scripts |
| `.env.example` | New. Both connection strings, with the role split explained |
| `STATE.md` | This file |

Unchanged and still authoritative: `manifesto.md`, `docs/product/milestone-1.md`,
`docs/architecture/*`, `docs/adr/0001`–`0014`, `docs/engineering/*`, `docs/design/design-system.md`.

---

# Repository Changes

18 commits on `chore/slice-0-foundation`. Not pushed; no remote configured.

```
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
| 12 | `users` INSERT policy is `WITH CHECK (true)` | Sign-up creates a user before any membership exists, so it cannot require one | Revisit in 1.6 when Better Auth owns the sign-up path |
| 13 | Only one repository exists | `workspace-members`. The isolation suite pattern is proved but thinly exercised | Continuously, as repositories arrive |

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

**Nothing is pushed and no remote exists.** A lost machine loses 18 commits. Adding a remote is
outward-facing and needs its own go-ahead.

**Port 5432 may already be taken.** On this machine an unrelated container holds it, so the compose
file takes `POSTGRES_PORT` and the working `.env` uses 5433. Anyone hitting "port is already
allocated" changes that one variable and both connection strings.

**~~Better Auth's tables will fail the tenancy check on first run.~~** Handled. The three tables are
declared in `AUTH_TABLES_WITHOUT_WORKSPACE` with reasons, and each has RLS enabled, forced, and a
policy scoped to the auth role. The check passes.

**The `verify` gate now runs `build` too,** so it is 24 tasks rather than 22. A build that is never
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
7. For the active task, in this order: **`docs/adr/0017-authentication-database-role.md` first**,
   because it records a conflict between authentication and the tenancy model and how it was
   resolved. Then `docs/adr/0006-self-hosted-auth.md`, `docs/engineering/security.md`,
   `docs/adr/0012-multi-tenancy.md`, and `docs/adr/0015-local-postgres.md`.

**Then discover the tooling.** List `~/.claude/skills/` and read `~/.claude/skills/gstack/SKILL.md`
for the routing table. Read sub-skill frontmatter rather than every body; there are 58 and reading
them whole wastes the context you need for the work. `CLAUDE.md` §5 maps workflow stages to skills.

**Then audit before changing anything.** `pnpm install`, then `pnpm verify` and confirm **24/24**
green. **Run `pnpm db:reset`** after `cp .env.example .env`: the third database role from ADR-0017 is
created by the init script, which only runs on an empty data directory, so an older local database
does not have it. Then `pnpm test:integration` for **99** green and `pnpm check:tenancy` for a pass.
Run `git status` and confirm the tree is clean. If it does not match, reconcile before writing
anything and say what changed.

**The tenancy foundation and the authentication schema are done. Do not rebuild either.** Slice 1
items 1.1, 1.2, 1.3, 1.4, 1.5, and 1.12 are complete, and so is the database half of 1.6. Trust the
completed-tasks checklist.

**Continue from the Active Task in `STATE.md`,** which is the second half of 1.6: `packages/auth`.
Follow the Next Immediate Actions in order. Note that **1.8 comes before 1.10**, which is the
founder-approved order and the reverse of an earlier note in this file. The policy module is pure
functions over a role and has no audit dependency; only its call sites do, and those arrive with the
screens.

**Four things about the remaining half of 1.6.** Connect as `DATABASE_AUTH_URL`, never
`DATABASE_URL`, or the first sign-in fails in a way that looks like a library bug. The auth tables
already exist in `packages/db/src/schema/auth.ts`, so do not run Better Auth's migration generator;
ADR-0005 rule 2 requires reviewed SQL. Remap the library's singular camelCase table and column names
to our plural `snake_case` in configuration, in one place. And `email_verified_at` stays
authoritative over the library's boolean `emailVerified`, because a timestamp is strictly more
information.

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

**One practice from the last session worth keeping.** Every test guarding an invariant was verified
by breaking the thing it guards: the RLS policies were opened to `USING (true)`, an unregistered
repository method was added, an unprotected table was added. Each time the tests failed, then the
sabotage was reverted. A security test that has never failed is a security test that might not work.

Where information is missing, make the best engineering decision for long-term product quality and
document it. Challenge weak ideas, including mine. Do not ask permission for every implementation
detail, but stop and ask when a choice is expensive to reverse: schema, money, tenancy, provider, or
public API.

Keep `STATE.md` current as you go. The repository, not the conversation, is the source of truth.

Start by reading the files above, then tell me what you found and begin item 1.6.
