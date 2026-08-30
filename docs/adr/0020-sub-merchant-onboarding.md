# ADR-0020 — Sub-merchant onboarding via Razorpay Route, not API keys

**Status:** Accepted
**Date:** 2026-08-30
**Amends:** [ADR-0016](./0016-razorpay-first-adapter.md), which chose Razorpay and Route but left
the onboarding model unspecified.

## Context

ADR-0016 chose Razorpay Route for split settlement and named the adapter boundary. It did not specify
how a creator connects their payment account. The development adapter accepted API keys because that
is the simplest thing to build and test against.

API keys are wrong for production. The target user is a yoga instructor, a photographer, or a coach.
They have never seen an API key and should never be asked to find one. Every platform in this space
hides the payment processor behind a guided onboarding flow:

- **Shopify Payments:** The seller enters their bank details and PAN in Shopify's settings. Stripe
  exists under the hood. The seller never sees Stripe.
- **Stan.store / Gumroad:** The creator clicks "Connect payments", is redirected to Stripe Connect's
  hosted onboarding, enters bank details and KYC info, and is redirected back. No API keys.
- **Razorpay Route:** Supports the same pattern. CreatorHub holds one master Razorpay account. Each
  creator becomes a "linked account" (sub-merchant) created via the Route API.

The question is which model CreatorHub uses. There are two Razorpay mechanisms:

1. **Linked Accounts (Route sub-merchants):** CreatorHub creates the account via API. The creator
   fills a KYC form inside CreatorHub. Razorpay verifies automatically. Money routes through
   CreatorHub's master account with automatic settlement to the creator's bank.

2. **OAuth token exchange:** The creator clicks "Connect Razorpay", authorizes CreatorHub to act on
   their behalf, and returns. Requires the creator to already have a Razorpay account.

## Decision

**CreatorHub uses Razorpay Route linked accounts (sub-merchant model).**

The creator never leaves CreatorHub. The onboarding flow is:

1. Creator goes to **Settings > Payments** inside their workspace.
2. CreatorHub shows a form: legal name, PAN, bank account number, IFSC code, business type
   (individual or company), and address.
3. On submit, CreatorHub calls the Razorpay Route API to create a linked account with the
   submitted KYC details.
4. Razorpay verifies KYC asynchronously (typically 24-48 hours for individuals).
5. CreatorHub receives a webhook when verification completes and updates the workspace's payment
   status.
6. The creator sees "Payments active" in their settings. They can now sell.

When a customer buys:

1. CreatorHub creates a Razorpay order against the master account.
2. The customer pays (UPI, card, netbanking) through Razorpay's hosted checkout.
3. On payment capture, CreatorHub calls the Route transfer API to split the amount:
   - Creator's share goes to their linked account.
   - Platform fee stays in the master account.
   - Tax is handled per the GST rules in ADR-0016.
4. Razorpay settles to the creator's bank on the standard T+2 schedule.

### What this means for the code

The `PaymentProvider` port from ADR-0007 gains two new capabilities:

```typescript
interface PaymentProvider {
  // Existing
  createOrder(input: CreateOrderInput): Promise<OrderResult>
  verifyWebhook(payload: Buffer, signature: string): boolean
  // ...

  // New: sub-merchant lifecycle
  createSubMerchant(input: SubMerchantInput): Promise<SubMerchantResult>
  getSubMerchantStatus(accountId: string): Promise<SubMerchantStatus>
}
```

The `payment_accounts` table in the schema gains fields for the linked account ID, KYC status, and
settlement configuration. No API keys are stored.

### Why not OAuth

OAuth requires the creator to already have a Razorpay account. Most creators do not. The sub-merchant
model creates the account for them, which means the creator fills one form and never visits
razorpay.com.

OAuth also puts the creator through Razorpay's full dashboard onboarding, which is designed for
developers. The sub-merchant model lets CreatorHub control the form, the copy, and the error
messages, which matters when the user does not know what "IFSC" stands for.

## Consequences

**Good**

- Creators never see API keys, OAuth flows, or the word "Razorpay."
- CreatorHub controls the entire onboarding experience and can provide help text for every field.
- The master account model gives CreatorHub visibility into all transactions for analytics,
  reconciliation, and dispute management.
- Platform fee deduction happens at the transfer level, not after the fact.

**Bad, and accepted**

- CreatorHub is responsible for collecting and transmitting KYC data, which has compliance
  obligations (data retention, encryption at rest, right to deletion).
- The master account is a single point of failure. If Razorpay suspends it, all creators are
  affected. Mitigated by the provider port: a second adapter can be added without touching the
  domain.
- KYC verification is asynchronous. A creator cannot sell immediately after signing up. The UI must
  communicate the waiting state clearly and not make it feel like something is broken.
- Razorpay Route has per-transfer API calls, which adds latency to the payment fulfillment path.
  Mitigated by making the transfer asynchronous via the outbox.

## Revisit when

A second payment provider is added (Stripe Connect, Cashfree), the regulatory environment changes
for marketplace settlement, or the linked account API limits become a constraint at scale. Each of
these is a new adapter behind the same port.
