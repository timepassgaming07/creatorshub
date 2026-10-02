/**
 * Inbound payment webhooks: verify, then deduplicate, then process.
 */
import { createHmac } from 'node:crypto'
import { MemoryPaymentProvider } from '@creatorhub/payments'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithWorkspace = vi.fn((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}))
vi.mock('./db', () => ({ getDatabase: () => ({ withWorkspace: mockWithWorkspace }) }))

const memoryPaymentProvider = new MemoryPaymentProvider()
vi.mock('./payments', () => ({ getPaymentProvider: () => memoryPaymentProvider }))

const db = {
  recordWebhookEvent: vi.fn(),
  updateWebhookEventStatus: vi.fn(),
  findOrderById: vi.fn(),
}
vi.mock('@creatorhub/db', () => ({
  webhooks: {
    recordWebhookEvent: (...a: unknown[]) => db.recordWebhookEvent(...a) as unknown,
    updateWebhookEventStatus: (...a: unknown[]) => db.updateWebhookEventStatus(...a) as unknown,
  },
  orders: { findOrderById: (...a: unknown[]) => db.findOrderById(...a) as unknown },
}))

const mockFulfillPaidOrder = vi.fn()
vi.mock('./order-fulfillment', () => ({
  fulfillPaidOrder: (...a: unknown[]) => mockFulfillPaidOrder(...a) as unknown,
  processPaymentFailure: vi.fn(),
  PaymentAmountMismatchError: class PaymentAmountMismatchError extends Error {},
}))
vi.mock('./refund-fulfillment', () => ({ fulfillRefund: vi.fn() }))

const mockSendPurchaseEmails = vi.fn()
vi.mock('./delivery', () => ({
  sendPurchaseEmails: (...a: unknown[]) => mockSendPurchaseEmails(...a) as unknown,
}))

import { POST } from '../app/api/webhooks/[provider]/route'

const SECRET = 'whsec_test_secret_32_chars_long_12345'
const WS = '018f9e2b-7c5e-7a2e-8c3b-000000000001'
const ORDER = '018f9e2b-7c5e-7a2e-8c3b-222222222222'

const capturedBody = JSON.stringify({
  id: 'evt_signed_001',
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_123',
        amount: 299900,
        currency: 'INR',
        status: 'captured',
        notes: { workspace_id: WS, order_id: ORDER },
      },
    },
  },
})

function post(provider: string, body: string, signature: string) {
  const request = new NextRequest(`http://localhost:3000/api/webhooks/${provider}`, {
    method: 'POST',
    headers: { 'x-payment-signature': signature, 'content-type': 'application/json' },
    body,
  })
  return POST(request, { params: Promise.resolve({ provider }) })
}

const sign = (body: string) => createHmac('sha256', SECRET).update(body).digest('hex')

describe('payment webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    memoryPaymentProvider.reset()
    vi.stubEnv('MEMORY_WEBHOOK_SECRET', SECRET)
    db.recordWebhookEvent.mockResolvedValue({ event: { id: 'whk_1' }, isDuplicate: false })
    db.findOrderById.mockResolvedValue({ id: ORDER, status: 'pending' })
    mockFulfillPaidOrder.mockResolvedValue({ idempotentReplay: false, downloadGrants: [] })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('answers 404 for a provider this deployment does not use', async () => {
    const res = await post('unsupported_gateway', capturedBody, sign(capturedBody))
    expect(res.status).toBe(404)
  })

  it('refuses every delivery when no webhook secret is configured', async () => {
    vi.stubEnv('MEMORY_WEBHOOK_SECRET', '')
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', '')
    const res = await post('memory', capturedBody, sign(capturedBody))
    expect(res.status).toBe(503)
    expect(mockWithWorkspace).not.toHaveBeenCalled()
  })

  it('rejects a bad signature before touching the database', async () => {
    const res = await post('memory', capturedBody, 'invalid_signature_hex_digest')
    expect(res.status).toBe(401)
    expect(mockWithWorkspace).not.toHaveBeenCalled()
  })

  it('opens the workspace named in the signed notes, fulfils, then emails after commit', async () => {
    const res = await post('memory', capturedBody, sign(capturedBody))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, duplicate: false })
    expect((mockWithWorkspace.mock.calls[0]?.[0] as { workspaceId: string }).workspaceId).toBe(WS)
    expect(mockFulfillPaidOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: ORDER, providerPaymentId: 'pay_123', amount: 299900n }),
    )
    expect(db.updateWebhookEventStatus).toHaveBeenCalledWith(
      expect.anything(),
      'whk_1',
      'processed',
      expect.anything(),
    )
    expect(mockSendPurchaseEmails).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, orderId: ORDER }),
    )
  })

  it('treats a redelivered event as a no-op', async () => {
    db.recordWebhookEvent.mockResolvedValue({ event: { id: 'whk_1' }, isDuplicate: true })
    const res = await post('memory', capturedBody, sign(capturedBody))
    expect(await res.json()).toEqual({ received: true, duplicate: true })
    expect(mockFulfillPaidOrder).not.toHaveBeenCalled()
    expect(mockSendPurchaseEmails).not.toHaveBeenCalled()
  })

  it('acknowledges events that carry no workspace without processing them', async () => {
    const body = JSON.stringify({ id: 'evt_2', event: 'payment.captured', payload: {} })
    const res = await post('memory', body, sign(body))
    expect(await res.json()).toEqual({ received: true, ignored: true })
    expect(mockWithWorkspace).not.toHaveBeenCalled()
  })

  it('asks for a retry with 500 when processing fails, and sends nothing', async () => {
    mockFulfillPaidOrder.mockRejectedValue(new Error('connection reset'))
    const res = await post('memory', capturedBody, sign(capturedBody))
    expect(res.status).toBe(500)
    expect(mockSendPurchaseEmails).not.toHaveBeenCalled()
  })
})
