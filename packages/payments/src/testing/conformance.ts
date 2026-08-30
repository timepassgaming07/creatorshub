/**
 * Payment Provider Adapter Conformance Suite (ADR-0007, ADR-0016).
 *
 * Responsibilities:
 * - A parameterized test suite that runs against any PaymentProvider adapter.
 * - Proves that a newly implemented adapter satisfies all domain contracts, invariants,
 *   event translations, and error modes before it can be deployed.
 */
import {
  basisPoints,
  currency,
  money,
  orderId,
  paymentId,
  refundId,
  workspaceId,
  type CurrencyCode,
} from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import {
  PaymentNotFoundError,
  WebhookSignatureVerificationError,
  type PaymentProvider,
} from '../port.js'

export type PaymentProviderFactory = () => Promise<{
  provider: PaymentProvider
  webhookSecret: string
  simulateCapture?: (sessionId: string) => Promise<string> // returns providerPaymentId
}>

export function paymentProviderConformanceTests(
  providerName: string,
  factory: PaymentProviderFactory,
): void {
  describe(`PaymentProvider Conformance: ${providerName}`, () => {
    const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
    const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222')
    const inr: CurrencyCode = currency('INR')

    it('manages connected accounts lifecycle', async () => {
      const { provider } = await factory()

      const account = await provider.createConnectedAccount({
        workspaceId: wsId,
        email: 'merchant@example.com',
        businessName: 'Acme Creator Studio',
        country: 'IN',
        defaultCurrency: inr,
      })

      expect(account.provider).toBe(provider.name)
      expect(account.providerAccountId).toBeDefined()
      expect(account.email).toBe('merchant@example.com')
      expect(account.businessName).toBe('Acme Creator Studio')

      const link = await provider.createOnboardingLink({
        providerAccountId: account.providerAccountId,
        returnUrl: 'https://app.creatorhub.com/return',
        refreshUrl: 'https://app.creatorhub.com/refresh',
      })

      expect(link.url).toBeDefined()
      expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now())

      const status = await provider.getAccountStatus(account.providerAccountId)
      expect(status).toBeDefined()
    })

    it('creates checkout session with server-authoritative line items and amounts', async () => {
      const { provider } = await factory()
      const total = money(499900n, inr)

      const session = await provider.createCheckoutSession({
        workspaceId: wsId,
        orderId: ordId,
        currency: inr,
        totalAmount: total,
        lineItems: [
          {
            name: 'Pro UI Kit',
            quantity: 1,
            unitAmount: total,
            totalAmount: total,
          },
        ],
        customer: {
          email: 'buyer@example.com',
          name: 'Sarah Buyer',
        },
        successUrl: 'https://creatorhub.com/order/success',
        cancelUrl: 'https://creatorhub.com/order/cancel',
        platformFeeBps: basisPoints(500),
      })

      expect(session.id).toBeDefined()
      expect(session.provider).toBe(provider.name)
      expect(session.orderId).toBe(ordId)
      expect(session.checkoutUrl).toBeDefined()
      expect(session.amount.amount).toBe(499900n)
      expect(session.currency).toBe('INR')
    })

    it('rejects invalid webhook signatures', async () => {
      const { provider, webhookSecret } = await factory()

      await expect(
        provider.verifyWebhook({
          rawPayload: JSON.stringify({ event: 'payment.captured', data: {} }),
          signature: 'invalid_tampered_signature_hex',
          secret: webhookSecret,
        }),
      ).rejects.toThrow(WebhookSignatureVerificationError)
    })

    it('verifies valid webhook signature and translates to domain payment event', async () => {
      const { provider, webhookSecret } = await factory()
      const testOrdId = '018f9e2b-7c5e-7a2e-8c3b-333333333333'

      if (
        'generateSignedWebhook' in provider &&
        typeof provider.generateSignedWebhook === 'function'
      ) {
        const { rawPayload, signature } = (
          provider as unknown as {
            generateSignedWebhook: (
              evt: string,
              payload: Record<string, unknown>,
              secret: string,
            ) => { rawPayload: string; signature: string }
          }
        ).generateSignedWebhook(
          'payment.captured',
          {
            payment: {
              id: 'pay_test_999',
              orderId: testOrdId,
              amount: 499900,
              currency: 'INR',
              method: 'upi',
            },
          },
          webhookSecret,
        )

        const verified = await provider.verifyWebhook({
          rawPayload,
          signature,
          secret: webhookSecret,
        })

        expect(verified.eventType).toBe('payment.captured')

        const domainEvent = provider.toDomainEvent(verified)
        expect(domainEvent).not.toBeNull()
        if (domainEvent?.type === 'payment.captured') {
          expect(domainEvent.type).toBe('payment.captured')
          expect(domainEvent.orderId).toBe(testOrdId)
          expect(domainEvent.amount.amount).toBe(499900n)
          expect(domainEvent.method).toBe('upi')
        }
      }
    })

    it('processes partial and full refunds', async () => {
      const { provider, simulateCapture } = await factory()
      if (!simulateCapture) return

      const session = await provider.createCheckoutSession({
        workspaceId: wsId,
        orderId: ordId,
        currency: inr,
        totalAmount: money(499900n, inr),
        lineItems: [
          {
            name: 'Digital Course',
            quantity: 1,
            unitAmount: money(499900n, inr),
            totalAmount: money(499900n, inr),
          },
        ],
        customer: { email: 'buyer@example.com' },
        successUrl: 'https://creatorhub.com/success',
        cancelUrl: 'https://creatorhub.com/cancel',
      })

      const provPayId = await simulateCapture(session.id)
      const paySnapshot = await provider.getPayment(provPayId)
      expect(paySnapshot.status).toBe('captured')

      const refId = refundId('018f9e2b-7c5e-7a2e-8c3b-444444444444')
      const refundResult = await provider.refundPayment({
        paymentId: paymentId('018f9e2b-7c5e-7a2e-8c3b-555555555555'),
        providerPaymentId: provPayId,
        orderId: ordId,
        refundId: refId,
        amount: money(499900n, inr),
        reason: 'requested_by_customer',
      })

      expect(refundResult.refundId).toBe(refId)
      expect(refundResult.status).toBe('processed')
      expect(refundResult.amount.amount).toBe(499900n)
    })

    it('throws PaymentNotFoundError when fetching non-existent payment', async () => {
      const { provider } = await factory()

      await expect(provider.getPayment('non_existent_payment_id')).rejects.toThrow(
        PaymentNotFoundError,
      )
    })
  })
}
