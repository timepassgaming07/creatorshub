/**
 * Razorpay PaymentProvider Adapter Test Suite.
 *
 * Runs against a fake of the Razorpay REST API injected as `fetcher`, so every
 * request the adapter makes is observable and no test touches the network.
 *
 * The cases that matter most are the rejections: a forged checkout signature,
 * a payment id from a different order, a forged webhook, a missing webhook
 * secret. Each of those is a path to an order marked paid with no money.
 */
import { createHmac } from 'node:crypto'
import { currency, money, orderId, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it, vi } from 'vitest'

import {
  PaymentProviderError,
  UnsupportedOperationError,
  WebhookSignatureVerificationError,
} from '../port.js'
import { RazorpayPaymentProvider } from './razorpay.js'

const KEY_ID = 'rzp_test_key123'
const KEY_SECRET = 'rzp_test_secret456'
const WEBHOOK_SECRET = 'whsec_rzp_test_secret_key_123456789'
const WS = workspaceId('018f9e2b-7c5e-7a2e-8c3b-111111111111')
const ORDER = orderId('018f9e2b-7c5e-7a2e-8c3b-222222222222')
const inr = currency('INR')

type FakePayment = {
  id: string
  order_id: string
  amount: number
  currency: string
  status: 'authorized' | 'captured' | 'failed'
  method: string
  created_at: number
  notes: Record<string, string>
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A minimal Razorpay: orders, payments, capture, refunds. */
function fakeRazorpay(payments: Record<string, FakePayment> = {}) {
  const fetcher = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
    const path = url.replace('https://api.razorpay.com', '')
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}

    if (path === '/v1/orders' && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ id: 'order_Rzp123', ...body, status: 'created' }))
    }

    const capture = /^\/v1\/payments\/([^/]+)\/capture$/.exec(path)
    if (capture?.[1]) {
      const p = payments[capture[1]]
      if (!p) return Promise.resolve(new Response('not found', { status: 404 }))
      p.status = 'captured'
      return Promise.resolve(jsonResponse(p))
    }

    const refund = /^\/v1\/payments\/([^/]+)\/refund$/.exec(path)
    if (refund?.[1]) {
      return Promise.resolve(
        jsonResponse({ id: 'rfnd_1', status: 'processed', created_at: 1_700_000_000, ...body }),
      )
    }

    const get = /^\/v1\/payments\/([^/]+)$/.exec(path)
    if (get?.[1]) {
      const p = payments[get[1]]
      return Promise.resolve(p ? jsonResponse(p) : new Response('not found', { status: 404 }))
    }

    return Promise.resolve(new Response('unexpected', { status: 500 }))
  })

  const provider = new RazorpayPaymentProvider({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    fetcher: fetcher as unknown as typeof fetch,
  })

  return { provider, fetcher }
}

function checkoutSignature(sessionId: string, paymentId: string, secret = KEY_SECRET): string {
  return createHmac('sha256', secret).update(`${sessionId}|${paymentId}`).digest('hex')
}

function signedWebhook(event: string, payload: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const rawPayload = JSON.stringify({
    entity: 'event',
    event,
    payload,
    created_at: 1_700_000_000,
  })
  const signature = createHmac('sha256', secret).update(rawPayload).digest('hex')
  return { rawPayload, signature }
}

function payment(overrides: Partial<FakePayment> = {}): FakePayment {
  return {
    id: 'pay_1',
    order_id: 'order_Rzp123',
    amount: 99900,
    currency: 'INR',
    status: 'captured',
    method: 'upi',
    created_at: 1_700_000_000,
    notes: { order_id: ORDER, workspace_id: WS },
    ...overrides,
  }
}

describe('RazorpayPaymentProvider', () => {
  it('refuses to construct without credentials, rather than faking payments', () => {
    expect(() => new RazorpayPaymentProvider({ keyId: '', keySecret: '' })).toThrow(
      PaymentProviderError,
    )
  })

  it('creates a Razorpay order carrying the tenant and order in notes', async () => {
    const { provider, fetcher } = fakeRazorpay()

    const session = await provider.createCheckoutSession({
      workspaceId: WS,
      orderId: ORDER,
      currency: inr,
      totalAmount: money(99900n, inr),
      lineItems: [
        {
          name: 'Preset Pack',
          quantity: 1,
          unitAmount: money(99900n, inr),
          totalAmount: money(99900n, inr),
        },
      ],
      customer: { email: 'buyer@example.com' },
      successUrl: 'https://shop.example/success',
      cancelUrl: 'https://shop.example/cancel',
    })

    expect(session.id).toBe('order_Rzp123')
    expect(session.publicKey).toBe(KEY_ID)

    const [url, init] = fetcher.mock.calls[0] ?? []
    expect(url).toBe('https://api.razorpay.com/v1/orders')
    const sent = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(sent['amount']).toBe(99900)
    expect(sent['receipt']).toBe(ORDER.replaceAll('-', ''))
    expect(sent['notes']).toEqual({ workspace_id: WS, order_id: ORDER })
    expect((init?.headers as Record<string, string>)['Authorization']).toMatch(/^Basic /)
  })

  it('confirms a payment whose checkout signature verifies', async () => {
    const { provider } = fakeRazorpay({ pay_1: payment() })

    const snapshot = await provider.confirmCheckoutPayment({
      sessionId: 'order_Rzp123',
      providerPaymentId: 'pay_1',
      signature: checkoutSignature('order_Rzp123', 'pay_1'),
    })

    expect(snapshot.status).toBe('captured')
    expect(snapshot.amount.amount).toBe(99900n)
    expect(snapshot.providerOrderId).toBe('order_Rzp123')
    expect(snapshot.orderId).toBe(ORDER)
  })

  it('captures a payment that is only authorised', async () => {
    const { provider, fetcher } = fakeRazorpay({ pay_1: payment({ status: 'authorized' }) })

    const snapshot = await provider.confirmCheckoutPayment({
      sessionId: 'order_Rzp123',
      providerPaymentId: 'pay_1',
      signature: checkoutSignature('order_Rzp123', 'pay_1'),
    })

    expect(snapshot.status).toBe('captured')
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('/pay_1/capture'))).toBe(true)
  })

  it('rejects a forged checkout signature without calling Razorpay', async () => {
    const { provider, fetcher } = fakeRazorpay({ pay_1: payment() })

    await expect(
      provider.confirmCheckoutPayment({
        sessionId: 'order_Rzp123',
        providerPaymentId: 'pay_1',
        signature: checkoutSignature('order_Rzp123', 'pay_1', 'wrong-secret'),
      }),
    ).rejects.toThrow(WebhookSignatureVerificationError)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a payment that belongs to a different Razorpay order', async () => {
    const { provider } = fakeRazorpay({ pay_1: payment({ order_id: 'order_Other' }) })

    await expect(
      provider.confirmCheckoutPayment({
        sessionId: 'order_Rzp123',
        providerPaymentId: 'pay_1',
        signature: checkoutSignature('order_Rzp123', 'pay_1'),
      }),
    ).rejects.toThrow(WebhookSignatureVerificationError)
  })

  it('verifies a webhook and exposes the tenant from signed notes', async () => {
    const { provider } = fakeRazorpay()
    const { rawPayload, signature } = signedWebhook('payment.captured', {
      payment: { entity: payment() },
    })

    const verified = await provider.verifyWebhook({
      rawPayload,
      signature,
      secret: WEBHOOK_SECRET,
      eventId: 'evt_header_1',
    })

    expect(verified.id).toBe('evt_header_1')
    expect(verified.workspaceId).toBe(WS)

    const event = provider.toDomainEvent(verified)
    expect(event?.type).toBe('payment.captured')
    if (event?.type === 'payment.captured') {
      expect(event.orderId).toBe(ORDER)
      expect(event.providerPaymentId).toBe('pay_1')
      expect(event.amount.amount).toBe(99900n)
      expect(event.method).toBe('upi')
    }
  })

  it('rejects a webhook signed with the wrong secret', async () => {
    const { provider } = fakeRazorpay()
    const { rawPayload, signature } = signedWebhook(
      'payment.captured',
      { payment: { entity: payment() } },
      'attacker-secret',
    )

    await expect(
      provider.verifyWebhook({ rawPayload, signature, secret: WEBHOOK_SECRET }),
    ).rejects.toThrow(WebhookSignatureVerificationError)
  })

  it('rejects every webhook when no secret is configured', async () => {
    const { provider } = fakeRazorpay()
    const { rawPayload, signature } = signedWebhook('payment.captured', {}, '')

    await expect(provider.verifyWebhook({ rawPayload, signature, secret: '' })).rejects.toThrow(
      WebhookSignatureVerificationError,
    )
  })

  it('derives a stable event id when the delivery header is absent', async () => {
    const { provider } = fakeRazorpay()
    const delivery = signedWebhook('payment.captured', { payment: { entity: payment() } })

    const first = await provider.verifyWebhook({ ...delivery, secret: WEBHOOK_SECRET })
    const second = await provider.verifyWebhook({ ...delivery, secret: WEBHOOK_SECRET })

    expect(first.id).toBe(second.id)
  })

  it('translates payment.failed with its reason', async () => {
    const { provider } = fakeRazorpay()
    const delivery = signedWebhook('payment.failed', {
      payment: {
        entity: payment({ status: 'failed' }),
      },
    })
    const raw = JSON.parse(delivery.rawPayload) as {
      payload: { payment: { entity: Record<string, unknown> } }
    }
    raw.payload.payment.entity['error_description'] = 'Bank declined'
    const rawPayload = JSON.stringify(raw)
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawPayload).digest('hex')

    const event = provider.toDomainEvent(
      await provider.verifyWebhook({ rawPayload, signature, secret: WEBHOOK_SECRET }),
    )

    expect(event?.type).toBe('payment.failed')
    if (event?.type === 'payment.failed') {
      expect(event.reason).toBe('Bank declined')
    }
  })

  it('translates refund.processed', async () => {
    const { provider } = fakeRazorpay()
    const delivery = signedWebhook('refund.processed', {
      refund: {
        entity: {
          id: 'rfnd_9',
          payment_id: 'pay_1',
          amount: 50000,
          currency: 'INR',
          notes: { order_id: ORDER, workspace_id: WS },
        },
      },
    })

    const event = provider.toDomainEvent(
      await provider.verifyWebhook({ ...delivery, secret: WEBHOOK_SECRET }),
    )

    expect(event?.type).toBe('refund.processed')
    if (event?.type === 'refund.processed') {
      expect(event.providerRefundId).toBe('rfnd_9')
      expect(event.amount.amount).toBe(50000n)
    }
  })

  it('ignores events that do not name an order of ours', async () => {
    const { provider } = fakeRazorpay()
    const delivery = signedWebhook('payment.captured', {
      payment: { entity: { ...payment(), notes: {} } },
    })

    expect(
      provider.toDomainEvent(await provider.verifyWebhook({ ...delivery, secret: WEBHOOK_SECRET })),
    ).toBeNull()
  })

  it('sends refunds with an idempotent receipt', async () => {
    const { provider, fetcher } = fakeRazorpay({ pay_1: payment() })
    const refundId = '018f9e2b-7c5e-7a2e-8c3b-999999999999'

    const result = await provider.refundPayment({
      paymentId: '018f9e2b-7c5e-7a2e-8c3b-888888888888' as never,
      providerPaymentId: 'pay_1',
      refundId: refundId as never,
      orderId: ORDER,
      amount: money(50000n, inr),
    })

    expect(result.providerRefundId).toBe('rfnd_1')
    const [, init] = fetcher.mock.calls[0] ?? []
    expect((JSON.parse(init?.body as string) as { receipt: string }).receipt).toBe(
      refundId.replaceAll('-', ''),
    )
  })

  it('does not pretend to send payouts', async () => {
    const { provider } = fakeRazorpay()
    await expect(
      provider.createPayout({
        workspaceId: WS,
        destinationAccountId: 'acc_1',
        amount: money(100n, inr),
        currency: inr,
      } as never),
    ).rejects.toThrow(UnsupportedOperationError)
  })
})
