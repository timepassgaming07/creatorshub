# ADR-0021 — Finding the tenant before anyone signs in, without bypassing RLS

**Status:** Accepted
**Date:** 2026-10-02
**Relates to:** [ADR-0012](./0012-multi-tenancy.md) (two-layer isolation),
[ADR-0020](./0020-sub-merchant-onboarding.md) (Route onboarding, see "Tension" below)

## Context

Every tenant table has `FORCE ROW LEVEL SECURITY`, and `creatorhub_app` sees no rows until the
transaction sets `app.workspace_id`. That is what makes the second isolation layer real.

Several requests arrive with no signed-in user and no workspace:

- a buyer opening a store at `priya.creatorhub.store`, or at the creator's own domain
- a buyer opening a download link from their email
- Razorpay delivering a payment webhook
- a visitor clicking an affiliate's referral link
- a browser loading a product's cover image

Each needs a workspace id before it can read anything.

## Options considered

**1. A `SECURITY DEFINER` resolver.** One function, owned by a privileged role, that maps a
hostname, token hash, or referral code to a workspace id while ignoring RLS. It is small and
general. It is also a deliberate hole in the layer that exists to have no holes. Every new
pre-tenant lookup would widen it, and a bug in any caller becomes a cross-tenant read. The automated
review of this branch refused it as weakening isolation. That review is right that it is the
owner's decision, not an implementation detail, so this branch does not take it.

**2. Put the tenant in what the server already hands out.** Every pre-tenant request carries
something the server issued earlier. Where that thing can name the workspace, and naming the wrong
one gets nothing, no bypass is needed.

**3. A separate `BYPASSRLS` operator role.** It is needed eventually for cross-tenant operations
(a queue of all payouts awaiting settlement). It is out of scope for the request path, and it
should never be reachable from it.

## Decision

Option 2, for every public path:

| Request | Where the workspace comes from | Why a forged one gets nothing |
|---|---|---|
| Store by subdomain or custom domain | `storefronts` policy already allows reading `published` rows (migration 0015). Custom domains match only when `custom_domain_status = 'verified'` | Unpublished stores and unverified domains do not resolve |
| Download link | Token is `<workspace uuid>.<secret>`; only the SHA-256 of the secret is stored | The server opens the named workspace and looks up the hash; a changed workspace half finds no grant |
| Payment webhook | `workspace_id` in the Razorpay order notes, which the webhook signature covers | The signature is checked over the raw body before anything is parsed |
| Referral click | The store is resolved first (row 1), then the code is looked up inside that workspace | A code from another store is not found |
| Product image | `/api/media/<workspace>/<asset>`; served only if the asset is a cover or gallery image of a published, non-private product in that workspace | Any other pairing returns 404 |
| Checkout | The store host in the URL resolves the workspace (row 1); prices are read from that workspace | Client-sent prices are ignored |

Operator settlement of payouts and affiliate commissions runs through `pnpm operator <command>`,
one workspace at a time, with RLS in force. The operator learns the workspace id from the approval
email (`OPERATOR_EMAIL`). There is no cross-tenant list, because listing across tenants is exactly
option 3.

`CREATORHUB_TEST_MODE=1` lets a production build use the fake payment, email, storage, and AI
adapters, for the end-to-end suite. Checkout shows a test-mode banner whenever it is on. A real
deployment never sets it.

## Tension with ADR-0020

ADR-0020 decided that each creator becomes a Razorpay Route linked account and that money is split
at capture. The adapter can create linked accounts and send split transfers, but no screen or flow
uses them yet. Today every payment lands in the platform's Razorpay account, the creator's share is
recorded as `creator_payable` in the ledger, and it leaves through maker-checker payouts that an
operator settles by bank transfer.

That works and reconciles, but it means the platform holds merchants' money. In India that is
payment-aggregator territory under RBI rules. **Get legal advice before taking live payments at
volume on this model**, and treat building ADR-0020's onboarding as the way out of it.

## Consequences

- No new privileged path exists. Isolation stays as ADR-0012 describes it.
- Every new public route has to find its tenant one of these ways, or come back to this ADR.
- The operator must be told which workspace to settle. That is acceptable at launch volume and
  will not scale.
- `resolveDownloadGrantByTokenHash` and `resolveAffiliateLinkByCode` on the database client are no
  longer called. Under `FORCE` RLS they return nothing, so they look like working code and are
  not. Remove them.

## Revisit when

- Settlement volume makes per-workspace operator commands a bottleneck. Then design option 3: a
  separate role with its own connection string, never loaded by the web app, with every use
  audited. The owner decides.
- Route onboarding (ADR-0020) ships. Most of the manual settlement path then goes away.
