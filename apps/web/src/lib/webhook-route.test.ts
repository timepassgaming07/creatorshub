/**
 * Webhook Ingestion API Route Unit Tests (Slice 5 §5.7).
 *
 * Verifies:
 * 1. Provider parameter validation (rejects invalid provider).
 * 2. Webhook signature verification error rejection (400).
 * 3. Successful webhook verification, deduplication, and database persistence.
 */
import { createHmac } from 'node:crypto'
import { MemoryPaymentProvider } from '@creatorhub/payments'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockWithWorkspace =
  vi.fn<(_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()

vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
  }),
}))

const memoryPaymentProvider = new MemoryPaymentProvider()
vi.mock('./payments', () => ({
  getPaymentProvider: () => memoryPaymentProvider,
}))

const mockRecordWebhookEvent = vi.fn()
const mockUpdateWebhookEventStatus = vi.fn()
vi.mock('@creatorhub/db', () => ({
  webhooks: {
    recordWebhookEvent: (...args: unknown[]) => mockRecordWebhookEvent(...args) as unknown,
    updateWebhookEventStatus: (...args: unknown[]) =>
      mockUpdateWebhookEventStatus(...args) as unknown,
  },
}))

const mockFulfillPaidOrder = vi.fn()
const mockProcessPaymentFailure = vi.fn()
vi.mock('./order-fulfillment', () => ({
  fulfillPaidOrder: (...args: unknown[]) => mockFulfillPaidOrder(...args) as unknown,
  processPaymentFailure: (...args: unknown[]) => mockProcessPaymentFailure(...args) as unknown,
}))

import { POST } from '../app/api/webhooks/[provider]/route'

describe('Webhook Ingestion API Route (§5.7)', () => {
  beforeEach(() => {
    mockWithWorkspace.mockReset()
    mockRecordWebhookEvent.mockReset()
    mockUpdateWebhookEventStatus.mockReset()
    mockFulfillPaidOrder.mockReset()
    mockProcessPaymentFailure.mockReset()
    memoryPaymentProvider.reset()
  })

  it('rejects unsupported payment provider', async () => {
    const req = new NextRequest('http://localhost:3000/api/webhooks/unsupported_gateway', {
      method: 'POST',
      body: JSON.stringify({ event: 'test' }),
    })

    const res = await POST(req, {
      params: Promise.resolve({ provider: 'unsupported_gateway' }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain('Unsupported payment provider')
  })

  it('rejects invalid signature', async () => {
    const rawBody = JSON.stringify({
      id: 'evt_test_bad_sig',
      entity: 'event',
      event: 'payment.captured',
      workspace_id: '018f9e2b-7c5e-7a2e-8c3b-000000000001',
    })

    const req = new NextRequest('http://localhost:3000/api/webhooks/memory', {
      method: 'POST',
      headers: {
        'x-payment-signature': 'invalid_signature_hex_digest',
        'content-type': 'application/json',
      },
      body: rawBody,
    })

    const res = await POST(req, {
      params: Promise.resolve({ provider: 'memory' }),
    })

    expect(res.status).toBe(400)
  })

  it('accepts and records signed webhook event', async () => {
    const wsId = '018f9e2b-7c5e-7a2e-8c3b-000000000001'
    const rawBody = JSON.stringify({
      id: 'evt_rzp_signed_001',
      entity: 'event',
      event: 'payment.captured',
      workspace_id: wsId,
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp_123',
            amount: 299900,
            currency: 'INR',
            status: 'captured',
            notes: {
              workspace_id: wsId,
              order_id: '018f9e2b-7c5e-7a2e-8c3b-222222222222',
            },
          },
        },
      },
    })

    // Compute valid HMAC signature
    const signature = createHmac('sha256', 'whsec_test_secret_32_chars_long_12345')
      .update(rawBody)
      .digest('hex')

    mockWithWorkspace.mockImplementation((_ctx, fn) => {
      const tx = {}
      return fn(tx)
    })

    mockRecordWebhookEvent.mockResolvedValue({
      event: { id: 'whk_evt_rec_001', status: 'received' },
      isDuplicate: false,
    })
    mockFulfillPaidOrder.mockResolvedValue({
      success: true,
    })
    mockUpdateWebhookEventStatus.mockResolvedValue({
      id: 'whk_evt_rec_001',
      status: 'processed',
    })

    const req = new NextRequest('http://localhost:3000/api/webhooks/memory', {
      method: 'POST',
      headers: {
        'x-payment-signature': signature,
        'content-type': 'application/json',
      },
      body: rawBody,
    })

    const res = await POST(req, {
      params: Promise.resolve({ provider: 'memory' }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { received: boolean; eventId: string; isDuplicate: boolean }
    expect(json.received).toBe(true)
    expect(json.eventId).toBe('whk_evt_rec_001')
    expect(json.isDuplicate).toBe(false)
  })
})
