import { currency, money, orderId, workspaceId, type CurrencyCode } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { MemoryPaymentProvider } from './memory.js'
import { paymentProviderConformanceTests } from '../testing/conformance.js'

describe('MemoryPaymentProvider', () => {
  const secret = 'whsec_test_secret_12345'
  const inr: CurrencyCode = currency('INR')

  // Run the full standard conformance suite against MemoryPaymentProvider
  paymentProviderConformanceTests('MemoryPaymentProvider', () => {
    const provider = new MemoryPaymentProvider()
    return Promise.resolve({
      provider,
      webhookSecret: secret,
      simulateCapture: (sessionId: string) => {
        const payment = provider.simulatePaymentCapture(sessionId, { method: 'upi' })
        return Promise.resolve(payment.providerPaymentId)
      },
    })
  })

  it('handles simulated payment failure', async () => {
    const provider = new MemoryPaymentProvider()
    const session = await provider.createCheckoutSession({
      workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      orderId: orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
      currency: inr,
      totalAmount: money(50000n, inr),
      lineItems: [],
      customer: { email: 'test@example.com' },
      successUrl: 'https://test.com/s',
      cancelUrl: 'https://test.com/c',
    })

    const failedPayment = provider.simulatePaymentFailure(session.id, 'Card expired')
    expect(failedPayment.status).toBe('failed')
    expect(failedPayment.failureReason).toBe('Card expired')

    const fetched = await provider.getPayment(failedPayment.providerPaymentId)
    expect(fetched.status).toBe('failed')
  })

  it('translates payment.failed webhook event to domain event', async () => {
    const provider = new MemoryPaymentProvider()
    const { rawPayload, signature } = provider.generateSignedWebhook(
      'payment.failed',
      {
        payment: {
          id: 'pay_fail_123',
          orderId: '018f9e2b-7c5e-7a2e-8c3b-333333333333',
          amount: 250000,
          currency: 'INR',
          error_description: 'Card declined by issuing bank',
        },
      },
      secret,
    )

    const verified = await provider.verifyWebhook({
      rawPayload,
      signature,
      secret,
    })

    const domainEvent = provider.toDomainEvent(verified)
    expect(domainEvent).not.toBeNull()
    if (domainEvent?.type === 'payment.failed') {
      expect(domainEvent.type).toBe('payment.failed')
      expect(domainEvent.orderId).toBe('018f9e2b-7c5e-7a2e-8c3b-333333333333')
      expect(domainEvent.reason).toBe('Card declined by issuing bank')
    }
  })

  it('translates refund.processed webhook event to domain event', async () => {
    const provider = new MemoryPaymentProvider()
    const { rawPayload, signature } = provider.generateSignedWebhook(
      'refund.processed',
      {
        refund: {
          id: 'rf_proc_123',
          payment_id: 'pay_orig_123',
          orderId: '018f9e2b-7c5e-7a2e-8c3b-444444444444',
          amount: 250000,
          currency: 'INR',
        },
      },
      secret,
    )

    const verified = await provider.verifyWebhook({
      rawPayload,
      signature,
      secret,
    })

    const domainEvent = provider.toDomainEvent(verified)
    expect(domainEvent).not.toBeNull()
    if (domainEvent?.type === 'refund.processed') {
      expect(domainEvent.type).toBe('refund.processed')
      expect(domainEvent.providerRefundId).toBe('rf_proc_123')
      expect(domainEvent.amount.amount).toBe(250000n)
    }
  })
})
