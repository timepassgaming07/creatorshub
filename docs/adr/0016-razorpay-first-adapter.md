# ADR-0016 — Razorpay is the first payment adapter, and the entity is Indian

**Status:** Accepted
**Date:** 2026-08-01
**Amends:** [ADR-0007](./0007-payment-provider-port.md), which named Stripe Connect as the first
adapter. The port is unchanged. Only the first implementation of it changes.

## Context

ADR-0007 chose a provider-agnostic port and named Stripe Connect as the first adapter, explicitly
gated on open item 1: the operating entity's country. That question is now answered.

**The operating entity is Indian.** The founder has also settled the two decisions that were waiting
on it: the platform fee is configurable with a 5% default, and storefronts live at
`username.creatorhub.com`.

An Indian entity collecting from Indian buyers and settling to Indian creators changes which
providers are eligible. Stripe operates in India but its India product is materially different from
the one ADR-0007 assumed, and Stripe Connect's split settlement is not offered there in the form
that ADR-0007's split-settlement work item depends on.

## Options considered

**Stripe, as ADR-0007 assumed.** Best documentation, and the ADR was written around it. Rejected on
a factual constraint rather than preference: Stripe India does not offer Connect's marketplace split
settlement to Indian entities in the form slice 5.8 needs, and UPI support is weaker than the market
requires. UPI is not a nice-to-have in India; it is the dominant payment method by transaction
count, and a checkout without it loses most buyers at the payment step.

**Cashfree.** Strong UPI support, competitive pricing, and a marketplace settlement product.
Genuinely viable and the closest alternative. Not chosen on ecosystem maturity and documentation
depth, both of which matter when the failure mode is a lost payment.

**PayU India.** Established and widely used. Weaker developer experience, and the split settlement
story is less clearly documented, which is the part we cannot afford ambiguity in.

**Razorpay.** Adopted.

## Decision

**Razorpay is the first `PaymentProvider` adapter, using Razorpay Route for split settlement.**

Nothing about ADR-0007 changes except which adapter ships first. The domain still never names a
provider, `packages/payments` still exposes a port, and the lint rule in
`packages/config/eslint/domain.js` still rejects a `stripe` import. It gains a `razorpay` entry
alongside it, for the same reason.

What Razorpay brings that the alternatives did not, in order of weight:

| Capability | Why it decides the question |
|---|---|
| UPI, including intent and collect flows | The dominant Indian payment method. Without it the checkout fails for most buyers |
| Razorpay Route | Split settlement to creator, platform, and affiliate. This is what slice 5.8 and slice 11 need |
| RazorpayX payouts | Payout execution to Indian bank accounts, which slice 11 gates on |
| Netbanking, wallets, cards, EMI | The rest of the Indian method mix, from one integration |
| Webhook signatures over HMAC SHA256 | Verifiable exactly as `security.md` requires |

### What this settles beyond the provider

**Currency is INR.** The M1 assumption of one selling currency per workspace holds, and the default
is now concrete. `Money` already carries a currency, so nothing in `contracts` changes. INR has two
minor-unit digits, so amounts are paise.

**GST applies to digital goods.** The `tax_payable` ledger account in the data model and the tax
work in slice 5.5 are GST rather than VAT. The rate depends on the product category and on whether
the buyer is in the same state as the seller, which makes tax a per-order calculation rather than a
workspace setting. That shape was already in the data model, which is fortunate rather than
foresighted.

**The platform fee is configurable, defaulting to 5%.** Stored in basis points as `BasisPoints`,
never as a float, and snapshotted onto the order at the moment of sale the same way commission rates
are. Changing the platform fee must not retroactively alter what a completed order recorded.

**Cross-border is deferred.** An Indian entity receiving foreign payments has RBI reporting
obligations and needs export documentation per transaction. M1 sells to Indian buyers in INR. When
this opens, it is a new ADR and a slice of its own, not a configuration change.

## Consequences

**Good**

- The dominant Indian payment method is supported from the first integration.
- Split settlement and payouts come from one provider, so slices 5, 9, and 11 share an adapter
  rather than needing three.
- The port was written for exactly this. Changing the first adapter touches one package, which is
  the return on the abstraction ADR-0007 paid for.

**Bad, and accepted**

- Razorpay's API is less pleasant than Stripe's, and its documentation is thinner. Contained by the
  adapter boundary: the awkwardness lives in one package.
- Razorpay's test mode is less complete than Stripe's, so some failure paths in slice 5 need
  deliberate construction rather than a documented test trigger.
- Fewer engineers have used it. Mitigated by the port, which means the domain code a new engineer
  reads never mentions the provider at all.
- UPI introduces a payment state Stripe does not have: a collect request the buyer may approve
  minutes later, or never. The order state machine in slice 5.3 must treat pending-then-settled as
  ordinary rather than exceptional, and the webhook may genuinely arrive long after the redirect.

## Revisit when

The entity's country changes, cross-border selling opens, or Razorpay's split settlement stops
meeting the affiliate commission requirement. Any of those is a new adapter behind the same port,
which is a contained change rather than a rewrite.
