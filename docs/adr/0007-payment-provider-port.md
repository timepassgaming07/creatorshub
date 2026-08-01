# ADR-0007 — Provider-agnostic payments, Stripe Connect as the first adapter

**Status:** Accepted
**Date:** 2026-07-27

## Context

Direction from the founder: real payments are in scope; the commerce domain must be
provider-agnostic; the initial provider is an engineering decision to be justified.

The requirement that discriminates between providers is **split settlement**. A single CreatorHub
purchase divides across up to five parties: the creator, the platform fee, an affiliate
commission, tax, and the processor's own fee. A provider that cannot split a payment natively
would force us to receive funds centrally and pay out — which would likely make CreatorHub a money
transmitter, a regulated status we will not take on.

Second requirement: **digital-goods tax.** Selling downloads across borders triggers VAT/GST
digital-services rules with destination-based rates. Building that ourselves is a project in its
own right.

## Options considered

### Merchant of Record — Paddle, Lemon Squeezy, Polar

Extremely attractive on compliance: the MoR becomes the legal seller and absorbs global tax
registration, remittance, and liability entirely.

Rejected on a structural mismatch. An MoR makes **CreatorHub** the seller of record. Our model is
that each creator is an independent business selling to their own customers, under their own brand,
on their own domain. Forcing every creator's sale through our merchant identity changes the
customer relationship, the refund relationship, and the tax position of the creator's own business.
It also caps us: an MoR's terms constrain what may be sold, and we would be inheriting those
constraints on behalf of every creator.

Worth recording honestly: this is the option that would most reduce near-term compliance work, and
it was rejected on product grounds rather than engineering ones.

### PayPal Commerce Platform

Wide consumer recognition and marketplace support. Rejected as the primary: developer experience,
API consistency, and webhook reliability are materially weaker, and its split-payment model is more
constrained. A strong candidate as a *secondary* method later, which the port makes cheap.

### Razorpay Route

Strong split-settlement product, excellent for India — domestic methods, UPI, GST-aware invoicing.
Not selected as the first adapter only because it is regionally scoped. **If the operating entity
is Indian, this likely becomes the primary adapter**; see the open question below.

### Adyen for Platforms

Genuinely enterprise-grade, excellent economics at volume. Rejected for this stage: onboarding is
heavyweight, integration effort is high, and it is designed for volumes we do not have.

### Stripe Connect

Native split settlement via `application_fee_amount` and `transfer_data`, integrated tax for
digital goods, hosted onboarding with KYC handled by the provider, the broadest payout country
coverage, the best-documented API and the most reliable webhook semantics in the category.

## Decision

**A `PaymentProvider` port in `packages/payments`, with Stripe Connect as the first adapter.**

The port is defined by *our* domain's needs, not by any provider's API shape:

```ts
interface PaymentProvider {
  createConnectedAccount(input): Promise<ConnectedAccount>
  createOnboardingLink(input): Promise<OnboardingLink>
  getAccountStatus(id): Promise<AccountStatus>

  createCheckout(input: CheckoutIntent): Promise<CheckoutSession>
  getPayment(id): Promise<PaymentSnapshot>
  refundPayment(input): Promise<RefundResult>

  createPayout(input): Promise<PayoutResult>
  getBalance(accountId): Promise<ProviderBalance>

  verifyWebhook(raw, signature): Promise<VerifiedEvent>
  toDomainEvent(event: VerifiedEvent): DomainPaymentEvent | null
}
```

Binding rules:

1. **No provider vocabulary in the domain.** No `stripe_*` column, no provider type in a domain
   signature. `payments.provider` is an enum and `provider_payment_id` is opaque.
2. **The adapter translates provider events into our own event vocabulary.** The domain handles
   `PaymentSucceeded`, never `charge.succeeded`. A provider changing its event taxonomy is an
   adapter change.
3. **The ledger, not the provider, is the source of truth** for what is owed to whom (ADR-0008).
   The provider is reconciled *against*, not trusted as, the record.
4. **Money is never computed client-side.** The client sends a product reference and quantity.
   Amounts, tax, discounts, and commission are computed server-side from server state.
5. **Every webhook is idempotent** via the unique constraint on `(provider, provider_event_id)`.
6. **A conformance test suite runs against every adapter**, so a second provider is proven
   equivalent rather than assumed to be.

## Consequences

**Good**

- Adding Razorpay, PayPal, or Adyen is an adapter plus conformance tests — no business logic
  changes.
- KYC, PCI scope, and payout rails stay with a licensed provider. No card data touches our systems;
  our PCI scope is limited to the lightest self-assessment tier.
- Provider outage or commercial dispute is survivable.

**Bad, and accepted**

- The port is a lowest-common-denominator abstraction and will not expose every provider-specific
  feature. Correct trade: provider-specific capability belongs behind a feature flag in the
  adapter, not in the domain.
- Some duplicated modelling between our domain and the provider's. This is the price of not being
  coupled, and it is a price worth paying on money.
- One adapter means the abstraction is unproven. Mitigated by the conformance suite and by writing
  the port against Razorpay's model as a second reference *on paper* before finalising it — an
  abstraction validated against only one implementation is usually wrong.

## Open question — blocking before live keys, not before build

Stripe Connect platform eligibility depends on the country of the **platform's** operating entity,
and cross-border creator payouts from certain jurisdictions — India notably — are subject to
materially different rules. This is a regulatory question that must be verified against current
provider documentation and, if the entity is Indian, against RBI guidance. It must not be answered
from memory.

Required before slice 5 wires live credentials. It does not block building the port, the ledger, or
the checkout domain, all of which are provider-independent by design.

## Revisit when

The operating entity's jurisdiction is confirmed; the first non-card payment method is required; or
volume reaches a point where interchange-plus pricing from a provider like Adyen materially
outweighs Stripe's developer experience.
