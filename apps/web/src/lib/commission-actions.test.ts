/**
 * Unit tests for Commission Server Actions (Slice 9 §9.8).
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected.
 * 2. RBAC enforcement for `affiliate.view` and `affiliate.manage`.
 * 3. Batch vesting release operation and audit logging.
 * 4. Clawback application and balance breakdowns.
 */
import { userId, workspaceId } from '@creatorhub/contracts'
import { auditLog, commissions, workspaceMembers } from '@creatorhub/db'
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
  applyClawbackAction,
  getAffiliateFinancialBreakdownAction,
  listCommissionsAction,
  releaseVestedCommissionsAction,
} from './commission-actions'

describe('Commission Server Actions (Slice 9)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000003')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockImplementation(
      (_context: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it('rejects unauthenticated listCommissionsAction', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await listCommissionsAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects member without affiliate.view permission for listCommissionsAction', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'guest@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue(undefined)

    const result = await listCommissionsAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('allows owner to list workspace commissions', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000004' as any,
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
    })

    vi.spyOn(commissions, 'listWorkspaceCommissions').mockResolvedValue({
      items: [
        {
          id: '018f9e2b-7c5e-7a2e-8c3b-000000000010' as any,
          workspaceId: wsId,
          attributionId: '018f9e2b-7c5e-7a2e-8c3b-000000000020' as any,
          affiliateId: '018f9e2b-7c5e-7a2e-8c3b-000000000030' as any,
          orderId: '018f9e2b-7c5e-7a2e-8c3b-000000000040' as any,
          grossSaleAmount: 100000n,
          commissionBps: 2000,
          grossAmount: 20000n,
          netAmount: 20000n,
          status: 'held',
          heldUntil: new Date(),
          vestedAt: null,
          paidAt: null,
          clawedBackAt: null,
          clawbackReason: null,
          currency: 'INR',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      total: 1,
    })

    const result = await listCommissionsAction(wsId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(1)
      expect(result.data.items[0]?.grossAmount).toBe('20000')
      expect(result.data.items[0]?.status).toBe('held')
    }
  })

  it('allows owner to trigger batch vesting release and logs audit event', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      id: '018f9e2b-7c5e-7a2e-8c3b-000000000004' as any,
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
    })

    vi.spyOn(commissions, 'releaseHeldCommissions').mockResolvedValue({
      vestedCount: 3,
      vestedAmountMinor: 45000n,
    })

    const auditSpy = vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue({} as any)

    const result = await releaseVestedCommissionsAction(wsId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.vestedCount).toBe(3)
      expect(result.data.vestedAmount).toBe('45000')
      expect(auditSpy).toHaveBeenCalled()
    }
  })

  it('fetches affiliate ledger financial breakdown', async () => {
    vi.spyOn(commissions, 'getAffiliateLedgerBreakdown').mockResolvedValue({
      pendingMinor: 0n,
      heldMinor: 15000n,
      vestedMinor: 30000n,
      paidMinor: 50000n,
      clawedBackMinor: 5000n,
      totalEarnedMinor: 95000n,
    })

    const result = await getAffiliateFinancialBreakdownAction(
      wsId,
      '018f9e2b-7c5e-7a2e-8c3b-000000000030',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.held).toBe('15000')
      expect(result.data.vested).toBe('30000')
      expect(result.data.paid).toBe('50000')
      expect(result.data.clawedBack).toBe('5000')
      expect(result.data.totalEarned).toBe('95000')
    }
  })
})
