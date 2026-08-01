# ADR-0017 — Authentication connects as a third Postgres role

**Status:** Accepted
**Date:** 2026-08-02
**Extends:** [ADR-0012](./0012-multi-tenancy.md) and [ADR-0015](./0015-local-postgres.md). Neither is
reversed. This adds a role and states precisely what it may reach.

## Context

Item 1.6 integrates Better Auth, and it does not fit the tenancy model as built.

Authentication is unavoidably **pre-tenant**. Sign-in receives an email address and nothing else: no
session, no workspace, no membership. To verify a password the auth path must find that user row
before any tenant is known. Sign-up is the same in reverse, creating a user who belongs to no
workspace yet.

The RLS policies from item 1.3 make that impossible. `users_visible_through_membership` admits a row
only when the current tenant shares a membership with it, and with no tenant set
`app_current_workspace_id()` returns NULL, so nothing matches. The consequence is specific: sign-up
inserts a user, and sign-in then cannot find that user. Authentication does not work at all.

So the conflict is real and it is structural. ADR-0012 says feature code can never hold an unscoped
client. Authentication is not feature code, and it genuinely needs pre-tenant reads of exactly four
tables.

## Options considered

**Give the application role pre-tenant access to `users`.** One line: add a policy admitting
`creatorhub_app` when no tenant is set. Rejected, and it is worth being precise about why, because
this is the tempting option.

`creatorhub_app` is the connection every repository and every future feature uses. Widening it means
any code path that forgets to set a tenant can read every user row in the platform. Today the
failure mode of a missing tenant is zero rows, which is safe and loud. This option converts it to
every row, which is silent. It trades a closed door for an open one to save writing a role.

**An escape hatch in `packages/db`.** Export something like `withoutTenant()` for the auth package to
call. Rejected: an exported hole is available to everything, and the argument for using it is
identical wherever someone wants it. ADR-0012's guarantee is that unscoped access is *not
expressible*, and this makes it expressible in exchange for a naming convention.

**Make the auth tables tenant-scoped.** Rejected because it is not true. A session belongs to a
user, not a workspace, and a user may act in several workspaces with one session. A `workspace_id`
on `session` would be a lie the schema tells.

**Run authentication as the migration role.** Rejected immediately. That role owns the schema and can
run DDL. Putting it on the request path would mean a compromised auth endpoint could drop tables.

## Decision

**A third role, `creatorhub_auth`, with privileges on the authentication tables and nothing else.**

| Role | Reaches | Used by |
|---|---|---|
| `creatorhub_migrator` | Everything, owns the schema, DDL | Migrations only |
| `creatorhub_app` | Business tables, RLS-filtered by tenant. **No privilege on `session`, `account`, `verification`** | Application request path |
| `creatorhub_auth` | `users`, `session`, `account`, `verification` only. **No privilege on any business table** | `packages/auth` only |

None of the three is a superuser and none holds `BYPASSRLS`.

The separation is enforced by grants, which Postgres checks, rather than by discipline. Two
properties follow and both are asserted by tests:

**The auth role cannot see tenant data.** No grant on `workspace_members` means a compromised
authentication path cannot enumerate workspaces, memberships, or anything added in later slices. It
gets a permission error, not empty results.

**The application role cannot see credentials or session tokens.** The default privileges from
ADR-0015 grant the app role access to every table the migrator creates, so the migration explicitly
revokes `session`, `account`, and `verification`. Feature code therefore cannot read a password hash
or a session token even with a tenant set and even deliberately. This is the same mechanism ADR-0008
uses to make `ledger_entries` append-only, applied for the same reason.

### What the auth role's row policies say

`USING (true)`, scoped `TO creatorhub_auth`, on those four tables.

That looks permissive and it is worth stating plainly rather than dressing up. **Row filtering is the
wrong control for these tables.** There is no design in which sign-in works but the authenticating
code cannot look up an arbitrary user by email, because looking up an arbitrary user by email *is*
sign-in. Every authentication system has this property.

The control that does the work is the grant. A compromise of the auth path yields the user table and
the session table. It does not yield orders, customers, payouts, or the ledger, because the role has
no privilege on them and will not when those tables exist, since default privileges name
`creatorhub_app` and not `creatorhub_auth`.

That is the trade: a bounded blast radius instead of an imaginary row predicate.

### Password hashing

Argon2id via `@node-rs/argon2`, replacing Better Auth's default scrypt through its
`emailAndPassword.password` hook. Parameters are the OWASP recommendation: 19 MiB memory, 2
iterations, parallelism 1.

`security.md` mandates Argon2id and states no parameters. ADR-0006 says only "strong hashing" and
never names an algorithm, so it is silent rather than contradictory and there is no ADR conflict to
resolve. The parameters are cheap to revise: raising them rehashes each password on next sign-in.

`@node-rs/argon2` rather than `argon2` because it ships prebuilt binaries and needs no compiler on a
CI runner. `pnpm-workspace.yaml` already refuses install-time native builds by default.

### Session policy

| Property | Value | Reason |
|---|---|---|
| Absolute lifetime | 30 days | A tool creators use daily. Weekly re-authentication is hostile without being meaningfully safer |
| Idle timeout | 7 days | An abandoned session closes itself |
| Rotation | On password change, role change, email change, passkey change, and sign-out-everywhere | A session that outlives a privilege change is a session holding privileges it should not |
| Cookie | `HttpOnly`, `Secure`, `SameSite=Lax` | ADR-0006. `Lax` rather than `Strict` so an emailed link lands signed in |
| Storage | Server-side rows | ADR-0006 requires sign-out-everywhere to be real, which a stateless token cannot do |

Sessions carry IP and user agent, so the login history in 1.6 and the device list in a later item are
reads of the same table rather than a second log.

### Table naming

Better Auth defaults to singular `user`, `session`, `account`, `verification`. Our data model uses
`snake_case` plural. It is remapped in configuration rather than renaming our table, because
`coding-standards.md` fixes the convention and one library's default is not a reason to break it.

`users` already exists from item 1.2 and is not recreated. Better Auth expects `emailVerified` as a
boolean; we store `email_verified_at` as a nullable timestamp, which is strictly more information.
The field is mapped, and the timestamp stays authoritative.

## Consequences

**Good**

- Authentication works, which it did not before this decision.
- A compromised auth path cannot read tenant data. A compromised feature path cannot read
  credentials. Neither is a matter of remembering to be careful.
- ADR-0012's guarantee is untouched. `creatorhub_app` still cannot read a business table without a
  tenant, and `packages/db` still exports no unscoped client.
- The tenancy CI check from 1.5 keeps working. The auth tables are declared exemptions with reasons,
  and they still require RLS, `FORCE`, and a policy.

**Bad, and accepted**

- A third connection pool, so three per instance rather than two. Sized small; the auth pool is
  touched once per sign-in rather than once per request.
- A third password to provision. Already handled by the same mechanism as the other two.
- The auth role can read every user row. Inherent to authentication, bounded by having no other
  grant, and the reason the role exists at all rather than widening `creatorhub_app`.
- **Existing local databases need `pnpm db:reset`.** The init script runs once at data directory
  initialisation, so a database created before this ADR has no `creatorhub_auth`. Deliberately not
  solved by granting the migrator `CREATEROLE`: a role that can create roles is a privilege
  escalation path, and this project has no production data yet.

## Revisit when

Enterprise SSO arrives and an external identity provider owns part of the flow, which changes what
the auth role needs to reach. Or the auth tables outgrow one role, for example if passkey material
warrants separation from password material.
