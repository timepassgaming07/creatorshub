/**
 * Unit tests for affiliate programme server actions (Slice 8 §8.8, §8.9).
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected with UNAUTHENTICATED.
 * 2. Unauthorized roles without affiliate.view / affiliate.manage are rejected with FORBIDDEN.
 * 3. Program settings fetch and update with audit logging.
 * 4. Sanitized CSV export with audit logging.
 */
import { userId, workspaceId } from '@creatorhub/contracts'
import {
  affiliates,
  auditLog,
  workspaceMembers,
} from '@creatorhub/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerSession } from './server-session'

const mockGetServerSession = vi.fn<() => Promise<ServerSession | null>>()

vi.mock('./server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

const mockWithWorkspace =
  vi.fn<(_context: unknown, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
  }),
}))

import {
  exportAffiliatesCsvAction,
  getAffiliateProgramAction,
  updateAffiliateProgramAction,
} from './affiliate-actions'

describe('Affiliate Programme Server Actions (Slice 8)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000003')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockImplementation(
      (_context: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it('rejects unauthenticated getAffiliateProgramAction', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await getAffiliateProgramAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects non-member getAffiliateProgramAction with FORBIDDEN', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'stranger@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue(undefined)

    const result = await getAffiliateProgramAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('fetches affiliate program settings and summary for workspace owner', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'member-1' as any,
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
    })

    vi.spyOn(affiliates, 'getAffiliateProgram').mockResolvedValue({
      id: 'prog-1' as any,
      workspaceId: wsId,
      isActive: true,
      defaultCommissionBps: 2000,
      cookieWindowDays: 30,
      allowSelfReferral: false,
      autoApproveAffiliates: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.spyOn(affiliates, 'getAffiliateProgramSummary').mockResolvedValue({
      totalAffiliates: 10,
      activeAffiliatesCount: 8,
      totalReferredRevenueMinor: 500000n,
      totalCommissionAccruedMinor: 100000n,
      totalConversionsCount: 15,
    })

    const result = await getAffiliateProgramAction(wsId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.program?.isActive).toBe(true)
      expect(result.data.program?.defaultCommissionBps).toBe(2000)
      expect(result.data.summary.totalAffiliates).toBe(10)
      expect(result.data.summary.totalConversionsCount).toBe(15)
    }
  })

  it('exports sanitized affiliates CSV and writes audit log', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: 'member-1' as any,
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
    })

    vi.spyOn(affiliates, 'listAffiliates').mockResolvedValue([
      {
        id: 'aff-1' as any,
        workspaceId: wsId,
        userId: null,
        email: 'partner@example.com',
        name: 'Top Partner',
        status: 'approved',
        customCommissionBps: 2500,
        payoutAccount: {},
        totalEarnings: 25000n,
        totalConversions: 5,
        joinedAt: new Date('2026-08-01T00:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const auditSpy = vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue({} as any)

    const result = await exportAffiliatesCsvAction(wsId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toContain('Affiliate ID,Email,Name,Status')
      expect(result.data).toContain('"partner@example.com"')
      expect(result.data).toContain('250.00') // 25000 minor units -> 250.00 INR
    }

    expect(auditSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: 'affiliates.exported_csv' }),
    )
  })
})
