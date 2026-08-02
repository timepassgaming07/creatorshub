# ADR-0018 — Email verification is stored twice, and one copy is derived

**Status:** Accepted
**Date:** 2026-08-02
**Amends:** [ADR-0006](./0006-self-hosted-auth.md) on the shape of the `users` table

## Context

Better Auth declares the `user` model's verification field as a boolean, and it is not optional:

```ts
emailVerified: {
  type: "boolean",
  defaultValue: false,
  required: true,
  fieldName: options.user?.fields?.emailVerified || "emailVerified",
  input: false,
}
```

That is from `@better-auth/core/src/db/get-tables.ts`, which is the single place the library's
schema contract is defined. The field is written on every user insert and read on every session
resolution.

Our `users` table stores `email_verified_at TIMESTAMPTZ NULL`, decided when the data model was
written and for a good reason: a timestamp answers "when was this verified" as well as "was it",
and the first question is the one a support ticket or a fraud review actually asks. A boolean cannot
be recovered into a timestamp later.

The two do not meet. Postgres will not accept `false` into a `timestamptz` column, so pointing the
library's field at ours by name fails on the first sign-up. The library's `fields` option remaps
*names*, not types, and there is no transform hook on the core models that would let a boolean be
stored as a timestamp.

Three options, then.

**Give up the timestamp.** Change the column to boolean and match the library. Rejected: it discards
information we decided we needed, in order to match a dependency's convenience. ADR-0006 chose Better
Auth in part because it puts its tables in our database. Letting it dictate our data model inverts
that.

**Keep the timestamp and stop using the library's verification flow.** Configure `emailVerified` as
an additional field we manage, and write our own verification. Rejected: it is the work we picked a
library to avoid, and it means the library's session logic reads a field we maintain by hand, so a
missed update is a user who cannot sign in.

**Store both, and derive one from the other.** Accepted.

## Decision

`users` carries both columns:

- `email_verified boolean NOT NULL DEFAULT false` — the library's storage. It writes this.
- `email_verified_at TIMESTAMPTZ NULL` — authoritative for us. Nothing writes this directly.

A trigger keeps the timestamp derived from the boolean, in migration
`0004_email_verified_flag.sql`. On the flag going false to true, the timestamp is set to `now()`. On
true to false, which is what changing an email address does, it is cleared. On insert with the flag
already true, the timestamp is set.

One direction only. The boolean is the input and the timestamp is the output, because the library
writes the boolean and nothing writes the timestamp. Two triggers writing to each other would be a
loop, and a pair of columns each claiming to be the source of truth is the failure this ADR is meant
to prevent.

The rule lives in the database rather than in `packages/auth`, for the same reason the one-owner
constraint is a partial unique index and not a validation function: a rule in application code is a
rule some future call site can skip.

## Consequences

**Good**

- The library's flow works unmodified. Sign-up, verification, and session resolution all use the
  supported path, and upgrading the library does not require revisiting this.
- `email_verified_at` still answers "when", and it cannot drift, because it is not maintained by
  hand.
- The change is additive. No column was altered or dropped, and the table was empty when it landed.

**Bad, and accepted**

- Two columns hold one fact. A reader has to know which is authoritative, which is why both carry
  the reason in `packages/db/src/schema/identity.ts` and why this record exists.
- A trigger is invisible at the call site. Someone reading only the insert will not see the timestamp
  being set. Mitigated by the integration test, which asserts the derivation rather than trusting it.
- `SELECT *` on `users` now returns a field that looks writable and is not. The comment on the column
  says so; the trigger makes writing it harmless rather than wrong.

## Revisit when

Better Auth supports a per-field transform on the core models, or accepts a nullable timestamp for
`emailVerified` directly. At that point the boolean column can be dropped, the trigger removed, and
the field pointed at `email_verified_at`. The migration would be a `DROP COLUMN` and a `DROP
TRIGGER`, and no data would be lost because the timestamp already carries everything the boolean
does.
