/**
 * Unit tests for Analytics Server Actions (Slice 10 §10.1, §10.2).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  exportAnalyticsCsvAction,
  getAffiliatePerformanceAction,
  getProductPerformanceAction,
  getWorkspaceAnalyticsAction,
} from './analytics-actions'

vi.mock('./server-session', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('./db', () => ({
  getDatabase: vi.fn(),
}))

vi.mock('@creatorhub/db', () => ({
  workspaceMembers: {
    findMemberByUserId: vi.fn(),
  },
  analytics: {
    getWorkspaceAnalyticsSummary: vi.fn(),
    listProductPerformance: vi.fn(),
    listAffiliatePerformance: vi.fn(),
  },
  auditLog: {
    writeAuditLog: vi.fn(),
  },
}))

import { analytics, workspaceMembers } from '@creatorhub/db'
import { getDatabase } from './db'
import { getServerSession } from './server-session'

const WS_ID = '019fbd70-4d9a-72e4-b6ed-722fe672c2ba'
const USER_ID = '019fbd70-4d9a-72e4-b6ed-722fe672c2bb'

describe('Analytics Server Actions (Slice 10)', () => {
  it('returns UNAUTHENTICATED when no server session exists', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const res = await getWorkspaceAnalyticsAction(WS_ID)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('returns analytics summary when user is authenticated with analytics.view permission', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'owner@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'owner',
    } as any)

    const mockSummary = {
      timeframe: '30d' as const,
      currency: 'INR',
      grossRevenueMinor: '150000',
      netRevenueMinor: '150000',
      refundsMinor: '0',
      refundRateBps: 0,
      taxCollectedMinor: '27000',
      affiliateExpenseMinor: '15000',
      platformFeesMinor: '3000',
      ordersCount: 5,
      averageOrderValueMinor: '30000',
      uniqueVisitorsCount: 150,
      storefrontPageviewsCount: 300,
      conversionRateBps: 333,
      timeSeries: [],
      funnel: [],
    }

    vi.mocked(analytics.getWorkspaceAnalyticsSummary).mockResolvedValue(mockSummary)

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await getWorkspaceAnalyticsAction(WS_ID, '30d')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.grossRevenueMinor).toBe('150000')
      expect(res.data.ordersCount).toBe(5)
    }
  })

  it('exports analytics CSV successfully', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'owner@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'admin',
    } as any)

    vi.mocked(analytics.getWorkspaceAnalyticsSummary).mockResolvedValue({
      timeframe: '30d',
      currency: 'INR',
      grossRevenueMinor: '100000',
      netRevenueMinor: '100000',
      refundsMinor: '0',
      refundRateBps: 0,
      taxCollectedMinor: '0',
      affiliateExpenseMinor: '0',
      platformFeesMinor: '0',
      ordersCount: 1,
      averageOrderValueMinor: '100000',
      uniqueVisitorsCount: 10,
      storefrontPageviewsCount: 20,
      conversionRateBps: 1000,
      timeSeries: [
        {
          date: '2026-08-30',
          grossRevenueMinor: '100000',
          netRevenueMinor: '100000',
          refundsMinor: '0',
          ordersCount: 1,
          visitorsCount: 10,
        },
      ],
      funnel: [],
    } as any)

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await exportAnalyticsCsvAction(WS_ID, '30d')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.csv).toContain('Gross Revenue (INR)')
      expect(res.data.csv).toContain('2026-08-30')
      expect(res.data.filename).toContain('.csv')
    }
  })
})
