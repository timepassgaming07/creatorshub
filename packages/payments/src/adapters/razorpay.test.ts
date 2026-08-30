/**
 * Razorpay PaymentProvider Adapter Test Suite (Slice 5 §5.8).
 *
 * Verifies:
 * 1. Conformance with PaymentProvider port specifications.
 * 2. Order creation with split settlement transfers (Razorpay Route).
 * 3. Webhook signature verification over HMAC-SHA256.
 * 4. Translation of Razorpay payloads to normalized domain events.
 */
import { basisPoints, currency, money, orderId, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it, vi } from 'vitest'

import { paymentProviderConformanceTests } from '../testing/conformance.js'
import { RazorpayPaymentProvider } from './razorpay.js'

describe('RazorpayPaymentProvider Adapter (§5.8)', () => {
  const webhookSecret = 'whsec_rzp_test_secret_key_123456789'

  // Run the standard PaymentProvider conformance suite against Razorpay adapter
  paymentProviderConformanceTests('Razorpay', () => {
    const provider = new RazorpayPaymentProvider()

    return Promise.resolve({
      provider,
      webhookSecret,
      simulateCapture: (sessionId: string) => {
        return provider.simulatePaymentCapture(sessionId)
      },
    })
  })

  it('creates checkout session with Route split settlement transfers', async () => {
    const provider = new RazorpayPaymentProvider()
    const inr = currency('INR')
    const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
    const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222')

    const session = await provider.createCheckoutSession({
      workspaceId: wsId,
      orderId: ordId,
      currency: inr,
      totalAmount: money(100000n, inr), // ₹1,000.00
      lineItems: [
        {
          name: 'Photography Preset Pack',
          quantity: 1,
          unitAmount: money(100000n, inr),
          totalAmount: money(100000n, inr),
        },
      ],
      customer: {
        email: 'customer@example.com',
        name: 'Jane Doe',
      },
      platformFeeBps: basisPoints(500), // 5% = ₹50.00
      splitTransfers: [
        {
          destinationAccountId: 'acc_creator_linked_123',
          amount: money(95000n, inr), // 95% = ₹950.00 to creator
          description: 'Creator settlement',
        },
      ],
      successUrl: 'https://creatorhub.com/success',
      cancelUrl: 'https://creatorhub.com/cancel',
    })

    expect(session.id).toBeDefined()
    expect(session.provider).toBe('razorpay')
    expect(session.amount.amount).toBe(100000n)
    expect(session.checkoutUrl).toContain('order_id=')
  })

  it('translates Razorpay webhook payment.captured with UPI method into domain event', async () => {
    const provider = new RazorpayPaymentProvider()
    const ordId = '018f9e2b-7c5e-7a2e-8c3b-333333333333'

    const { rawPayload, signature } = provider.generateSignedWebhook(
      'payment.captured',
      {
        payment: {
          entity: {
            id: 'pay_rzp_upi_777',
            amount: 299900,
            currency: 'INR',
            status: 'captured',
            method: 'upi',
            notes: {
              order_id: ordId,
              workspace_id: '018f9e2b-7c5e-7a2e-8c3b-111111111111',
            },
          },
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
    expect(domainEvent?.type).toBe('payment.captured')
    if (domainEvent?.type === 'payment.captured') {
      expect(domainEvent.providerPaymentId).toBe('pay_rzp_upi_777')
      expect(domainEvent.orderId).toBe(ordId)
      expect(domainEvent.amount.amount).toBe(299900n)
      expect(domainEvent.method).toBe('upi')
    }
  })

  it('translates payment.failed webhook event into domain event with failure reason', async () => {
    const provider = new RazorpayPaymentProvider()
    const ordId = '018f9e2b-7c5e-7a2e-8c3b-444444444444'

    const { rawPayload, signature } = provider.generateSignedWebhook(
      'payment.failed',
      {
        payment: {
          entity: {
            id: 'pay_rzp_fail_888',
            amount: 150000,
            currency: 'INR',
            status: 'failed',
            error_description: 'Bank declined transaction (insufficient funds)',
            notes: {
              order_id: ordId,
            },
          },
        },
      },
      webhookSecret,
    )

    const verified = await provider.verifyWebhook({
      rawPayload,
      signature,
      secret: webhookSecret,
    })

    const domainEvent = provider.toDomainEvent(verified)
    expect(domainEvent).not.toBeNull()
    expect(domainEvent?.type).toBe('payment.failed')
    if (domainEvent?.type === 'payment.failed') {
      expect(domainEvent.providerPaymentId).toBe('pay_rzp_fail_888')
      expect(domainEvent.orderId).toBe(ordId)
      expect(domainEvent.amount.amount).toBe(150000n)
      expect(domainEvent.reason).toBe('Bank declined transaction (insufficient funds)')
    }
  })

  it('translates refund.processed webhook event into domain event', async () => {
    const provider = new RazorpayPaymentProvider()
    const ordId = '018f9e2b-7c5e-7a2e-8c3b-555555555555'

    const { rawPayload, signature } = provider.generateSignedWebhook(
      'refund.processed',
      {
        refund: {
          entity: {
            id: 'rfnd_rzp_666',
            amount: 50000,
            currency: 'INR',
            status: 'processed',
            notes: {
              order_id: ordId,
            },
          },
        },
      },
      webhookSecret,
    )

    const verified = await provider.verifyWebhook({
      rawPayload,
      signature,
      secret: webhookSecret,
    })

    const domainEvent = provider.toDomainEvent(verified)
    expect(domainEvent).not.toBeNull()
    expect(domainEvent?.type).toBe('refund.processed')
    if (domainEvent?.type === 'refund.processed') {
      expect(domainEvent.providerRefundId).toBe('rfnd_rzp_666')
      expect(domainEvent.orderId).toBe(ordId)
      expect(domainEvent.amount.amount).toBe(50000n)
    }
  })

  it('performs authenticated REST API calls when live credentials are provided', async () => {
    const mockFetcher = vi.fn().mockImplementation((url: string, _init?: RequestInit) => {
      if (url.endsWith('/orders')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'order_rzp_live_12345',
              amount: 500000,
              currency: 'INR',
              status: 'created',
            }),
        })
      }
      if (url.includes('/payments/pay_live_999')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'pay_live_999',
              amount: 500000,
              currency: 'INR',
              status: 'captured',
              method: 'card',
              created_at: Math.floor(Date.now() / 1000),
            }),
        })
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      })
    })

    const provider = new RazorpayPaymentProvider({
      keyId: 'rzp_live_key123',
      keySecret: 'rzp_live_sec456',
      fetcher: mockFetcher as unknown as typeof fetch,
    })

    const inr = currency('INR')
    const session = await provider.createCheckoutSession({
      workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      orderId: orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
      currency: inr,
      totalAmount: money(500000n, inr),
      lineItems: [
        {
          name: 'Video Course',
          quantity: 1,
          unitAmount: money(500000n, inr),
          totalAmount: money(500000n, inr),
        },
      ],
      customer: {
        email: 'buyer@example.com',
      },
      successUrl: 'https://creatorhub.com/success',
      cancelUrl: 'https://creatorhub.com/cancel',
    })

    expect(session.id).toBe('order_rzp_live_12345')
    expect(mockFetcher).toHaveBeenCalledWith(
      'https://api.razorpay.com/v1/orders',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      }),
    )

    const payment = await provider.getPayment('pay_live_999')
    expect(payment.providerPaymentId).toBe('pay_live_999')
    expect(payment.status).toBe('captured')
  })
})
