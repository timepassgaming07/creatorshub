/**
 * Unit tests for Payout Server Actions (Slice 11 §11.3, §11.6).
 *
 * Verifies:
 * 1. Unauthenticated requests are rejected.
 * 2. RBAC enforcement for `payout.view`, `payout.request`, `payout.approve`, `payout.manage_beneficiaries`.
 * 3. Beneficiary account registration, payout requests, approvals, and CSV export.
 */
import { beneficiaryAccountId, payoutId, userId, workspaceId } from '@creatorhub/contracts'
import {
  auditLog,
  beneficiaryAccountsRepo,
  payoutsRepo,
  workspaceMembers,
  workspaces,
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

const mockSendSecurityNotice = vi.fn().mockResolvedValue({ id: 'email_1' })
vi.mock('./email', () => ({
  getEmailService: () => ({ sendSecurityNotice: mockSendSecurityNotice }),
}))
vi.mock('./delivery', () => ({
  notificationRecipients: () => Promise.resolve(['owner@example.com']),
}))

import {
  approvePayoutAction,
  createBeneficiaryAccountAction,
  exportPayoutsCsvAction,
  listPayoutsAction,
  requestPayoutAction,
} from './payout-actions'

describe('Payout Server Actions (Slice 11)', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const uId = userId('018f9e2b-7c5e-7a2e-8c3b-000000000003')
  const uId2 = userId('018f9e2b-7c5e-7a2e-8c3b-000000000004')
  const bId = beneficiaryAccountId('018f9e2b-7c5e-7a2e-8c3b-000000000005')
  const pId = payoutId('018f9e2b-7c5e-7a2e-8c3b-000000000006')

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockImplementation(
      (_context: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it('rejects unauthenticated listPayoutsAction', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const result = await listPayoutsAction(wsId)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('creates beneficiary account for authorized workspace owner', async () => {
    vi.spyOn(workspaces, 'findCurrentWorkspace').mockResolvedValue({
      name: 'Creator Studio',
    } as never)
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com', name: 'Owner User' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId,
      role: 'owner',
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    vi.spyOn(beneficiaryAccountsRepo, 'createBeneficiaryAccount').mockResolvedValue({
      id: bId,
      workspaceId: wsId,
      payeeType: 'workspace',
      payeeId: wsId,
      accountHolderName: 'Creator Studio',
      accountType: 'bank_account',
      accountNumber: '1234567890',
      maskedAccountNumber: '••••••••7890',
      ifscCode: 'HDFC0000060',
      vpa: null,
      status: 'verified',
      isDefault: true,
      verifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue(undefined as never)

    const result = await createBeneficiaryAccountAction(wsId, {
      // A client naming someone else's payee is ignored.
      payeeType: 'affiliate',
      payeeId: 'someone-else',
      accountHolderName: 'Creator Studio',
      accountType: 'bank_account',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0000060',
      isDefault: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accountHolderName).toBe('Creator Studio')
      expect(result.data.maskedAccountNumber).toBe('••••••••7890')
    }
    expect(beneficiaryAccountsRepo.createBeneficiaryAccount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payeeType: 'workspace', payeeId: wsId }),
    )
    expect(mockSendSecurityNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['owner@example.com'],
        subject: expect.stringContaining('New payout account'),
      }),
    )
  })

  it('requests payout and validates available balance', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com', name: 'Owner User', emailVerified: true },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId,
      role: 'owner',
    } as never)

    vi.spyOn(beneficiaryAccountsRepo, 'findBeneficiaryAccountById').mockResolvedValue({
      id: bId,
      workspaceId: wsId,
      payeeType: 'workspace',
      payeeId: wsId,
      accountHolderName: 'Creator Studio',
      accountType: 'bank_account',
      maskedAccountNumber: '••••••••7890',
      ifscCode: 'HDFC0000060',
      status: 'verified',
      isDefault: true,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h old account
      updatedAt: new Date(),
    } as never)

    vi.spyOn(payoutsRepo, 'getPayoutBalanceOverview').mockResolvedValue({
      currency: 'INR' as never,
      availableBalanceMinor: '500000', // ₹5,000.00
      inTransitBalanceMinor: '0',
      lifetimeSettledMinor: '0',
      pendingApprovalMinor: '0',
      minimumPayoutMinor: '50000',
    })

    vi.spyOn(payoutsRepo, 'requestPayout').mockResolvedValue({
      id: pId,
      workspaceId: wsId,
      payeeType: 'workspace',
      payeeId: wsId,
      beneficiaryAccountId: bId,
      amount: 100000n, // ₹1,000.00
      currency: 'INR',
      status: 'requested',
      provider: 'razorpay',
      requestedBy: uId,
      notes: 'Test payout',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue(undefined as never)

    const result = await requestPayoutAction(wsId, {
      beneficiaryAccountId: bId,
      amountMinor: '100000',
      currency: 'INR',
      notes: 'Test payout',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.amountMinor).toBe('100000')
      expect(result.data.status).toBe('requested')
    }
  })

  it('approves payout under Two-Person Rule policy', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId2,
      user: { id: uId2, email: 'admin@example.com', name: 'Admin User' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId2,
      role: 'admin',
    } as never)

    vi.spyOn(payoutsRepo, 'findPayoutById').mockResolvedValue({
      id: pId,
      workspaceId: wsId,
      payeeType: 'workspace',
      payeeId: wsId,
      beneficiaryAccountId: bId,
      amount: 100000n,
      currency: 'INR',
      status: 'requested',
      requestedBy: uId, // Requested by uId, approved by uId2
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    vi.spyOn(workspaceMembers, 'listMembers').mockResolvedValue([
      { userId: uId, role: 'owner' },
      { userId: uId2, role: 'admin' },
    ] as never)

    vi.spyOn(payoutsRepo, 'approvePayout').mockResolvedValue({
      id: pId,
      workspaceId: wsId,
      payeeType: 'workspace',
      payeeId: wsId,
      beneficiaryAccountId: bId,
      amount: 100000n,
      currency: 'INR',
      status: 'approved',
      requestedBy: uId,
      approvedBy: uId2,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    vi.spyOn(auditLog, 'writeAuditLog').mockResolvedValue(undefined as never)

    const result = await approvePayoutAction(wsId, {
      payoutId: pId,
      notes: 'Approved after verification',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.status).toBe('approved')
      expect(result.data.approvedBy).toBe(uId2)
    }
  })

  it('exports payouts CSV cleanly', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com', name: 'Owner User' },
    })

    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId,
      role: 'owner',
    } as never)

    vi.spyOn(payoutsRepo, 'listPayouts').mockResolvedValue([
      {
        id: pId,
        workspaceId: wsId,
        payeeType: 'workspace',
        payeeId: wsId,
        beneficiaryAccountId: bId,
        amount: 100000n,
        currency: 'INR',
        status: 'paid',
        requestedBy: uId,
        approvedBy: uId2,
        completedAt: new Date('2026-08-31T12:00:00Z'),
        createdAt: new Date('2026-08-31T10:00:00Z'),
        beneficiary: {
          accountType: 'bank_account',
          maskedAccountNumber: '••••••••7890',
          ifscCode: 'HDFC0000060',
        },
      } as never,
    ])

    const result = await exportPayoutsCsvAction(wsId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toContain('Date,Payout ID,Amount (INR),Status')
      expect(result.data).toContain('1000.00')
      expect(result.data).toContain('••••••••7890')
      expect(result.data).toContain('HDFC0000060')
    }
  })

  it('refuses a withdrawal until the email address is confirmed', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com', name: 'Owner User', emailVerified: false },
    })
    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId,
      role: 'owner',
    } as never)
    const request = vi.spyOn(payoutsRepo, 'requestPayout')

    const result = await requestPayoutAction(wsId, {
      beneficiaryAccountId: bId,
      amountMinor: '100000',
      currency: 'INR',
    })
    expect(result.ok).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it('holds a large withdrawal to an account added in the last 24 hours', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: uId,
      user: { id: uId, email: 'owner@example.com', name: 'Owner User', emailVerified: true },
    })
    vi.spyOn(workspaceMembers, 'findMemberByUserId').mockResolvedValue({
      workspaceId: wsId,
      userId: uId,
      role: 'owner',
    } as never)
    vi.spyOn(beneficiaryAccountsRepo, 'findBeneficiaryAccountById').mockResolvedValue({
      id: bId,
      workspaceId: wsId,
      accountType: 'vpa',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    } as never)
    vi.spyOn(payoutsRepo, 'getPayoutBalanceOverview').mockResolvedValue({
      currency: 'INR' as never,
      availableBalanceMinor: '20000000',
      inTransitBalanceMinor: '0',
      lifetimeSettledMinor: '0',
      pendingApprovalMinor: '0',
      minimumPayoutMinor: '50000',
    })
    const request = vi.spyOn(payoutsRepo, 'requestPayout')

    const result = await requestPayoutAction(wsId, {
      beneficiaryAccountId: bId,
      amountMinor: '10000000',
      currency: 'INR',
    })
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ message: expect.stringContaining('24 hours') }),
    })
    expect(request).not.toHaveBeenCalled()
  })
})
