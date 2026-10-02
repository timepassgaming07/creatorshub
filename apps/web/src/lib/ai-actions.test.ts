/**
 * Unit tests for AI Generation Server Actions (Slice 10 §10.4, §10.6, §10.7).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  generateAnalyticsInsightsAction,
  generateProductCopyAction,
  generateSeoMetadataAction,
  generateStorefrontCopyAction,
  getAiUsageSummaryAction,
} from './ai-actions'

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
  aiUsageRepo: {
    recordUsage: vi.fn(),
    getMonthlyUsageSummary: vi.fn(),
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

import { aiUsageRepo, analytics, workspaceMembers } from '@creatorhub/db'
import { getDatabase } from './db'
import { getServerSession } from './server-session'

const WS_ID = '019fbd70-4d9a-72e4-b6ed-722fe672c2ba'
const USER_ID = '019fbd70-4d9a-72e4-b6ed-722fe672c2bb'

describe('AI Generation Server Actions (Slice 10)', () => {
  it('returns UNAUTHENTICATED when session is missing', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const res = await generateProductCopyAction(WS_ID, {
      title: 'Course',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('generates structured product copy and records usage', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'creator@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'owner',
    } as any)

    vi.mocked(aiUsageRepo.getMonthlyUsageSummary).mockResolvedValue({
      workspaceId: WS_ID,
      billingMonth: '2026-08',
      totalGenerations: 5,
      totalTokens: 2500,
      monthlyQuotaTokens: 250000,
      quotaRemainingTokens: 247500,
      isQuotaExceeded: false,
    })

    vi.mocked(aiUsageRepo.recordUsage).mockResolvedValue({} as any)

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await generateProductCopyAction(WS_ID, {
      title: 'Fullstack Next.js Masterclass',
      category: 'Course',
      tone: 'persuasive',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.title).toBeDefined()
      expect(res.data.keyBenefits.length).toBeGreaterThanOrEqual(2)
    }
    expect(aiUsageRepo.recordUsage).toHaveBeenCalled()
  })

  it('blocks generation when monthly token quota is exceeded', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'creator@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'owner',
    } as any)

    vi.mocked(aiUsageRepo.getMonthlyUsageSummary).mockResolvedValue({
      workspaceId: WS_ID,
      billingMonth: '2026-08',
      totalGenerations: 500,
      totalTokens: 250000,
      monthlyQuotaTokens: 250000,
      quotaRemainingTokens: 0,
      isQuotaExceeded: true,
    })

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await generateStorefrontCopyAction(WS_ID, {
      creatorName: 'Alex',
      brandNiche: 'Tech',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('QUOTA_EXCEEDED')
    }
  })

  it('generates executive business insights from ledger data', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'creator@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'admin',
    } as any)

    vi.mocked(aiUsageRepo.getMonthlyUsageSummary).mockResolvedValue({
      workspaceId: WS_ID,
      billingMonth: '2026-08',
      totalGenerations: 1,
      totalTokens: 500,
      monthlyQuotaTokens: 250000,
      quotaRemainingTokens: 249500,
      isQuotaExceeded: false,
    })

    vi.mocked(analytics.getWorkspaceAnalyticsSummary).mockResolvedValue({
      timeframe: '30d',
      currency: 'INR',
      grossRevenueMinor: '500000',
      netRevenueMinor: '480000',
      refundsMinor: '20000',
      refundRateBps: 400,
      taxCollectedMinor: '90000',
      affiliateExpenseMinor: '50000',
      platformFeesMinor: '10000',
      ordersCount: 20,
      averageOrderValueMinor: '25000',
      uniqueVisitorsCount: 450,
      storefrontPageviewsCount: 900,
      conversionRateBps: 444,
      timeSeries: [],
      funnel: [],
    })

    vi.mocked(analytics.listProductPerformance).mockResolvedValue([
      {
        productId: 'p-1',
        productTitle: 'Top Course',
        productSlug: 'top-course',
        unitsSold: 20,
        grossRevenueMinor: '500000',
        netRevenueMinor: '480000',
        refundsCount: 1,
        refundRateBps: 400,
        conversionRateBps: 444,
      },
    ])

    vi.mocked(analytics.listAffiliatePerformance).mockResolvedValue([])

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await generateAnalyticsInsightsAction(WS_ID, '30d')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.executiveSummary).toBeDefined()
      expect(res.data.growthActions.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('generates SEO metadata and OpenGraph tags', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: USER_ID, email: 'creator@example.com' },
      session: { id: 's-1' },
    } as any)

    vi.mocked(workspaceMembers.findMemberByUserId).mockResolvedValue({
      userId: USER_ID,
      workspaceId: WS_ID,
      role: 'owner',
    } as any)

    vi.mocked(aiUsageRepo.getMonthlyUsageSummary).mockResolvedValue({
      workspaceId: WS_ID,
      billingMonth: '2026-08',
      totalGenerations: 2,
      totalTokens: 1000,
      monthlyQuotaTokens: 250000,
      quotaRemainingTokens: 249000,
      isQuotaExceeded: false,
    })

    vi.mocked(getDatabase).mockResolvedValue({
      withWorkspace: vi.fn().mockImplementation((_, fn) => fn({ tx: {} })),
    } as any)

    const res = await generateSeoMetadataAction(WS_ID, {
      pageType: 'storefront_home',
      pageTitle: 'Design Kit Store',
      descriptionSummary: 'High quality Figma templates and icon libraries',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.seoTitle).toBeDefined()
      expect(res.data.keywords.length).toBeGreaterThanOrEqual(2)
    }
  })
})
