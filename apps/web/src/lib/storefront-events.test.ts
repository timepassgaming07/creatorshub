import { storefrontId, workspaceId } from '@creatorhub/contracts'
import { POST } from '../app/api/events/route'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getDatabase } from './db'

const mockRecordStorefrontEvent = vi.fn()

vi.mock('@creatorhub/db', () => ({
  storefronts: {
    recordStorefrontEvent: (...args: unknown[]) => mockRecordStorefrontEvent(...args) as unknown,
  },
}))

vi.mock('./db', () => ({
  getDatabase: vi.fn(),
}))

import { recordStorefrontEventAction } from './storefront-actions'

describe('Storefront Telemetry Events Action & Ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates event schema and rejects invalid event types', async () => {
    const result = await recordStorefrontEventAction({
      storefrontId: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      // @ts-expect-error - testing invalid event type
      eventType: 'invalid_event',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
    }
  })

  it('returns error when storefront is not found', async () => {
    vi.mocked(getDatabase).mockReturnValue({
      resolveStorefrontById: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof getDatabase>)

    const result = await recordStorefrontEventAction({
      storefrontId: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      eventType: 'page_view',
      utmSource: 'twitter',
      utmMedium: 'social',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Storefront not found.')
    }
  })

  it('successfully records a page_view event', async () => {
    const mockStorefront = {
      id: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
      subdomain: 'sarah-designs',
      customDomain: null,
      title: 'Sarah Designs',
      status: 'published' as const,
    }

    mockRecordStorefrontEvent.mockResolvedValue({
      id: '018f9e2b-7c5e-7a2e-8c3b-444444444444',
      workspaceId: mockStorefront.workspaceId,
      storefrontId: mockStorefront.id,
      eventType: 'page_view',
      createdAt: new Date(),
    })

    vi.mocked(getDatabase).mockReturnValue({
      resolveStorefrontById: vi.fn().mockResolvedValue(mockStorefront),
      withWorkspace: vi
        .fn()
        .mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ tx: {} })),
    } as unknown as ReturnType<typeof getDatabase>)

    const result = await recordStorefrontEventAction(
      {
        storefrontId: mockStorefront.id,
        eventType: 'page_view',
        visitorSessionId: 'sess-12345',
        referrer: 'https://google.com',
        utmSource: 'google',
        utmMedium: 'organic',
        utmCampaign: 'launch',
      },
      'Mozilla/5.0 TestBrowser',
    )

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.eventId).toBe('018f9e2b-7c5e-7a2e-8c3b-444444444444')
    }
  })
})

describe('POST /api/events Route Handler', () => {
  it('accepts and parses JSON telemetry payload', async () => {
    const mockStorefront = {
      id: storefrontId('018f9e2b-7c5e-7a2e-8c3b-111111111111'),
      workspaceId: workspaceId('018f9e2b-7c5e-7a2e-8c3b-222222222222'),
      subdomain: 'sarah-designs',
      title: 'Sarah Designs',
      status: 'published' as const,
    }

    mockRecordStorefrontEvent.mockResolvedValue({
      id: '018f9e2b-7c5e-7a2e-8c3b-444444444444',
      workspaceId: mockStorefront.workspaceId,
      storefrontId: mockStorefront.id,
      eventType: 'page_view',
      createdAt: new Date(),
    })

    vi.mocked(getDatabase).mockReturnValue({
      resolveStorefrontById: vi.fn().mockResolvedValue(mockStorefront),
      withWorkspace: vi
        .fn()
        .mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ tx: {} })),
    } as unknown as ReturnType<typeof getDatabase>)

    const req = new NextRequest('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 TestBrowser',
      },
      body: JSON.stringify({
        storefrontId: mockStorefront.id,
        eventType: 'page_view',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean }
    expect(json.success).toBe(true)
  })

  it('rejects invalid JSON with 400 Bad Request', async () => {
    const req = new NextRequest('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: 'invalid-json',
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
