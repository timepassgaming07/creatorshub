# ADR-0006 — Self-hosted authentication

**Status:** Accepted
**Date:** 2026-07-27

## Context

CreatorHub needs authentication for three distinct actor types — creators (with workspace
membership and roles), affiliates (scoped to a workspace's programme), and customers (passwordless,
account-optional, for the purchase library). It also needs organisation modelling, passkeys, and
eventually enterprise SSO.

Authentication has a property that distinguishes it from every other dependency: **it owns user
identity, and identity cannot be migrated cheaply.** Moving auth providers means either migrating
password hashes you may not be able to export, or forcing every user to reset their credentials.
That is a switching cost measured in user trust, not engineering hours.

## Options considered

### Clerk

The best developer experience available — pre-built UI, organisations, passkeys, excellent docs.
Rejected on two grounds.

The first is lock-in on precisely the wrong thing. Identity is the highest switching-cost
dependency in the system, and the manifesto explicitly names vendor lock-in as an evaluation
criterion. The second is that its pre-built UI conflicts directly with the design-language mandate
— sign-up is the first screen a user ever sees, and it must be unmistakably ours. Using headless
mode to satisfy that discards most of Clerk's advantage.

Pricing scaling per monthly active user is a secondary concern: on a platform whose customers are
mostly free-tier creators, an MAU-priced dependency has cost dynamics decoupled from revenue.

### Auth0 / WorkOS

Enterprise-grade and strong on SSO. Rejected as over-scoped for M1, with cost structures aimed at
enterprise seat counts rather than a long tail of small creators. WorkOS remains the likely answer
for enterprise SSO in Phase 3 — a bounded, additive integration rather than an identity owner.

### Supabase Auth

Solid and free at our scale. Rejected because adopting it pulls the rest of the Supabase platform
into a structural position, and we have deliberately chosen plain Postgres (ADR-0005) so that the
database is portable.

### Auth.js (NextAuth)

Mature and flexible. Rejected: it is a session and provider toolkit rather than a complete identity
system. Organisations, roles, invitations, and passkey management would all be hand-built — which
is the work we most want a library to do.

### Better Auth

Self-hosted, TypeScript-native, owns its tables in **our** Postgres, first-class organisation and
role modelling, passkeys, plugin architecture, fully headless.

## Decision

**Better Auth, self-hosted**, with its tables in our database. All UI is ours.

- Creators: email/password with strong hashing, plus passkeys. Email verification required before
  publishing a storefront or receiving payments.
- Affiliates: the same identity system, distinguished by their `affiliates` record. `user_id` is
  nullable so an affiliate can exist by email before ever creating an account.
- Customers: **no account.** Purchase library access is a signed magic link scoped to a customer
  record. This removes the single largest source of checkout friction, and buyers of a digital
  file do not want an account.
- Sessions: HTTP-only, `Secure`, `SameSite=Lax` cookies. Server-side session records so that
  "sign out everywhere" is real.

Authorisation is deliberately **not** delegated to the auth library. A single policy module,
`domain/identity/policy.ts`, answers every "may this actor do this?" question. Permission logic
scattered across route handlers is how tenancy leaks happen.

## Consequences

**Good**

- We own identity outright. No MAU pricing, no export problem, no third party in the critical path
  of every request.
- Sign-in is our first design impression and it is entirely ours.
- Auth data is in the same database as everything else, so a session and its workspace membership
  are one query and one transaction.
- Enterprise SSO can be added later as a plugin without changing the identity model.

**Bad, and accepted**

- We own the security of it. Mitigated by using a maintained library rather than hand-rolling,
  keeping it patched aggressively, running `/security-review` on every auth-touching change, and
  commissioning an external review before general availability.
- We build all auth UI. This is a cost we are choosing to pay for design ownership.
- Better Auth is younger than Auth0 or Auth.js. Accepted: it is self-hosted and open source, so
  the downside case is forking rather than migrating.
- Rate limiting, breach detection, and abuse prevention are ours to build. Scoped into slice 1.

## Revisit when

An enterprise customer requires SAML/SCIM at a depth the plugin ecosystem does not cover — the
answer then is WorkOS *alongside*, federating into our identity model, not replacing it.
