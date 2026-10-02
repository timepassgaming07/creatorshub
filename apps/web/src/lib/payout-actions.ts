/**
 * Payouts, Beneficiary Accounts & Settlements Server Actions (Slice 11 §11.3, §11.6).
 *
 * Responsibilities:
 * 1. Enforce RBAC permissions (`payout.view`, `payout.request`, `payout.approve`, `payout.manage_beneficiaries`).
 * 2. Manage beneficiary bank accounts & UPI VPAs with audit logging.
 * 3. Process payout requests with balance bounds and velocity safety cooldowns.
 * 4. Execute Two-Person Rule (ADR-0019) maker-checker payout approvals with double-entry ledger integration.
 * 5. Provide ledger-derived real-time payout balance summaries and CSV export.
 */
'use server'

import {
  type ApprovePayoutInput,
  type BeneficiaryAccountDTO,
  type CreateBeneficiaryAccountInput,
  type CurrencyCode,
  type PayeeType,
  type PayoutBalanceOverviewDTO,
  type PayoutDTO,
  type PayoutFilter,
  type RejectPayoutInput,
  type RequestPayoutInput,
  approvePayoutSchema,
  beneficiaryAccountId as toBeneficiaryAccountId,
  createBeneficiaryAccountSchema,
  money,
  payoutFilterSchema,
  payoutId as toPayoutId,
  rejectPayoutSchema,
  requestId as toRequestId,
  requestPayoutSchema,
  userId as toUserId,
  workspaceContext,
  workspaceId as toWorkspaceId,
} from '@creatorhub/contracts'
import {
  auditLog,
  beneficiaryAccountsRepo,
  payoutsRepo,
  workspaceMembers,
  type BeneficiaryAccount,
  type PayoutWithBeneficiary,
} from '@creatorhub/db'
import {
  authorise,
  checkBeneficiarySafetyCooldown,
  isErr,
  validateMakerCheckerApproval,
  validatePayoutAmount,
  type Membership,
} from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { auditOptions } from './env'


export type PayoutActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR'
        readonly message: string
      }
    }

function mapBeneficiaryDTO(b: BeneficiaryAccount): BeneficiaryAccountDTO {
  return {
    id: b.id as any,
    workspaceId: b.workspaceId as any,
    payeeType: b.payeeType as any,
    payeeId: b.payeeId,
    accountHolderName: b.accountHolderName,
    accountType: b.accountType as any,
    maskedAccountNumber: b.maskedAccountNumber,
    ifscCode: b.ifscCode,
    vpa: b.vpa,
    status: b.status as any,
    isDefault: b.isDefault,
    verifiedAt: b.verifiedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
  }
}

function mapPayoutDTO(p: PayoutWithBeneficiary): PayoutDTO {
  return {
    id: p.id as any,
    workspaceId: p.workspaceId as any,
    payeeType: p.payeeType as any,
    payeeId: p.payeeId,
    beneficiaryAccountId: p.beneficiaryAccountId as any,
    amountMinor: p.amount.toString(),
    currency: p.currency as CurrencyCode,
    status: p.status as any,
    provider: p.provider,
    providerPayoutId: p.providerPayoutId,
    ledgerTransactionId: p.ledgerTransactionId,
    requestedBy: p.requestedBy as any,
    approvedBy: p.approvedBy as any,
    requestedAt: p.createdAt.toISOString(),
    approvedAt: p.approvedAt?.toISOString() ?? null,
    completedAt: p.completedAt?.toISOString() ?? null,
    failureReason: p.failureReason,
    beneficiary: p.beneficiary ? mapBeneficiaryDTO(p.beneficiary) : undefined,
  }
}

async function authenticateAndAuthorise(
  rawWorkspaceId: string,
  permission:
    | 'payout.view'
    | 'payout.request'
    | 'payout.approve'
    | 'payout.manage_beneficiaries',
) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return { error: { code: 'UNAUTHENTICATED' as const, message: 'Sign in to continue.' } }
  }

  const actorUserId = toUserId(session.user.id)
  const workspaceId = toWorkspaceId(rawWorkspaceId)
  const db = getDatabase()

  const membershipRow = await db.withWorkspace(
    workspaceContext({
      workspaceId,
      actorId: actorUserId,
      requestId: toRequestId(`req-auth-${Date.now()}`),
    }),
    async (tx) => {
      return workspaceMembers.findMemberByUserId(
        {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-auth-${Date.now()}`),
          }),
        },
        actorUserId,
      )
    },
  )

  if (!membershipRow) {
    return {
      error: {
        code: 'FORBIDDEN' as const,
        message: 'You are not a member of this workspace.',
      },
    }
  }

  const membership: Membership = {
    workspaceId,
    userId: actorUserId,
    role: membershipRow.role,
  }

  const decision = authorise(membership, workspaceId, permission)
  if (!decision.ok) {
    return {
      error: {
        code: 'FORBIDDEN' as const,
        message: decision.error.detail || 'Insufficient permissions.',
      },
    }
  }

  return { actorUserId, workspaceId, db, membership }
}

export async function createBeneficiaryAccountAction(
  rawWorkspaceId: string,
  rawInput: unknown,
): Promise<PayoutActionResult<BeneficiaryAccountDTO>> {
  const parsed = createBeneficiaryAccountSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid bank account details.' } }
  }

  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.manage_beneficiaries')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth
  const input = parsed.data

  try {
    const created = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-beneficiary-create-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-beneficiary-create-${Date.now()}`),
          }),
        }

        const account = await beneficiaryAccountsRepo.createBeneficiaryAccount(scope, {
          payeeType: input.payeeType,
          payeeId: input.payeeId,
          accountHolderName: input.accountHolderName,
          accountType: input.accountType,
          accountNumber: input.accountNumber,
          ifscCode: input.ifscCode,
          vpa: input.vpa,
          isDefault: input.isDefault,
        })

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'beneficiary_account.created',
            targetType: 'beneficiary_account',
            targetId: account.id,
            metadata: {
              accountType: account.accountType,
              maskedAccountNumber: account.maskedAccountNumber,
              isDefault: account.isDefault,
            },
          },
        )

        return account
      },
    )

    return { ok: true, data: mapBeneficiaryDTO(created) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register beneficiary account.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function listBeneficiaryAccountsAction(
  rawWorkspaceId: string,
  params?: { readonly payeeType?: PayeeType; readonly payeeId?: string },
): Promise<PayoutActionResult<BeneficiaryAccountDTO[]>> {
  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.view')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth

  try {
    const list = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-beneficiary-list-${Date.now()}`),
      }),
      async (tx) => {
        return beneficiaryAccountsRepo.listBeneficiaryAccounts(
          {
            tx,
            context: workspaceContext({
              workspaceId,
              actorId: actorUserId,
              requestId: toRequestId(`req-beneficiary-list-${Date.now()}`),
            }),
          },
          params,
        )
      },
    )

    return { ok: true, data: list.map(mapBeneficiaryDTO) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list beneficiary accounts.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function setDefaultBeneficiaryAccountAction(
  rawWorkspaceId: string,
  rawAccountId: string,
): Promise<PayoutActionResult<BeneficiaryAccountDTO>> {
  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.manage_beneficiaries')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth
  const accountId = toBeneficiaryAccountId(rawAccountId)

  try {
    const updated = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-beneficiary-default-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-beneficiary-default-${Date.now()}`),
          }),
        }

        const acc = await beneficiaryAccountsRepo.setDefaultBeneficiaryAccount(scope, accountId)
        if (!acc) throw new Error('Beneficiary account not found.')

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'beneficiary_account.default_updated',
            targetType: 'beneficiary_account',
            targetId: acc.id,
            metadata: { accountHolderName: acc.accountHolderName },
          },
        )

        return acc
      },
    )

    return { ok: true, data: mapBeneficiaryDTO(updated) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update default beneficiary.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function deleteBeneficiaryAccountAction(
  rawWorkspaceId: string,
  rawAccountId: string,
): Promise<PayoutActionResult<{ success: boolean }>> {
  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.manage_beneficiaries')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth
  const accountId = toBeneficiaryAccountId(rawAccountId)

  try {
    const deleted = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-beneficiary-delete-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-beneficiary-delete-${Date.now()}`),
          }),
        }

        const success = await beneficiaryAccountsRepo.deleteBeneficiaryAccount(scope, accountId)
        if (!success) throw new Error('Beneficiary account not found or could not be removed.')

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'beneficiary_account.deleted',
            targetType: 'beneficiary_account',
            targetId: accountId,
          },
        )

        return success
      },
    )

    return { ok: true, data: { success: deleted } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete beneficiary account.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function requestPayoutAction(
  rawWorkspaceId: string,
  rawInput: unknown,
): Promise<PayoutActionResult<PayoutDTO>> {
  const parsed = requestPayoutSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid payout request.' } }
  }

  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.request')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth
  const input = parsed.data
  const amountMinor = BigInt(input.amountMinor)

  try {
    const created = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-request-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-payout-request-${Date.now()}`),
          }),
        }

        // 1. Verify beneficiary account exists and belongs to workspace
        const beneficiary = await beneficiaryAccountsRepo.findBeneficiaryAccountById(
          scope,
          toBeneficiaryAccountId(input.beneficiaryAccountId),
        )
        if (!beneficiary) {
          throw new Error('Selected beneficiary account was not found.')
        }

        // 2. Validate available balance
        const balanceOverview = await payoutsRepo.getPayoutBalanceOverview(scope, input.currency)
        const availableBalance = money(BigInt(balanceOverview.availableBalanceMinor), input.currency)
        const requestMoney = money(amountMinor, input.currency)

        const validation = validatePayoutAmount({
          amount: requestMoney,
          availableBalance,
        })

        if (isErr(validation)) {
          throw new Error(validation.error.detail)
        }

        // 3. Safety cooldown check on newly registered accounts
        const cooldownCheck = checkBeneficiarySafetyCooldown({
          beneficiaryCreatedAt: beneficiary.createdAt,
          amount: requestMoney,
        })

        const payout = await payoutsRepo.requestPayout(scope, {
          beneficiaryAccountId: toBeneficiaryAccountId(beneficiary.id),
          amount: amountMinor,
          currency: input.currency,
          requestedBy: actorUserId,
          notes: input.notes,
        })

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'payout.requested',
            targetType: 'payout',
            targetId: payout.id,
            metadata: {
              amount: payout.amount.toString(),
              currency: payout.currency,
              beneficiaryAccountId: beneficiary.id,
              safetyReviewRequired: cooldownCheck.requiresSafetyReview,
            },
          },
        )

        return { ...payout, beneficiary }
      },
    )

    return { ok: true, data: mapPayoutDTO(created) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to request payout.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function approvePayoutAction(
  rawWorkspaceId: string,
  rawInput: unknown,
): Promise<PayoutActionResult<PayoutDTO>> {
  const parsed = approvePayoutSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid approval parameters.' } }
  }

  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.approve')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db, membership } = auth
  const input = parsed.data
  const payoutId = toPayoutId(input.payoutId)

  try {
    const approved = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-approve-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-payout-approve-${Date.now()}`),
          }),
        }

        const existing = await payoutsRepo.findPayoutById(scope, payoutId)
        if (!existing) {
          throw new Error('Payout request not found.')
        }

        const members = await workspaceMembers.listMembers(scope)

        // Enforce Two-Person Maker-Checker Rule (ADR-0019)
        const approvalCheck = validateMakerCheckerApproval({
          requestedBy: toUserId(existing.requestedBy),
          approvedBy: actorUserId,
          approverRole: membership.role,
          amount: money(existing.amount, existing.currency as CurrencyCode),
          totalWorkspaceMembers: members.length,
        })

        if (isErr(approvalCheck)) {
          throw new Error(approvalCheck.error.detail)
        }

        const updated = await payoutsRepo.approvePayout(scope, {
          payoutId,
          approvedBy: actorUserId,
          notes: input.notes,
        })

        if (!updated) {
          throw new Error('Could not approve payout. It may already be approved or processed.')
        }

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'payout.approved',
            targetType: 'payout',
            targetId: updated.id,
            metadata: {
              amount: updated.amount.toString(),
              currency: updated.currency,
              requestedBy: updated.requestedBy,
              approvedBy: updated.approvedBy,
            },
          },
        )

        return { ...updated, beneficiary: existing.beneficiary }
      },
    )

    return { ok: true, data: mapPayoutDTO(approved) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve payout.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function rejectPayoutAction(
  rawWorkspaceId: string,
  rawInput: unknown,
): Promise<PayoutActionResult<PayoutDTO>> {
  const parsed = rejectPayoutSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: { code: 'ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid rejection parameters.' } }
  }

  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.approve')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth
  const input = parsed.data
  const payoutId = toPayoutId(input.payoutId)

  try {
    const rejected = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-reject-${Date.now()}`),
      }),
      async (tx) => {
        const scope = {
          tx,
          context: workspaceContext({
            workspaceId,
            actorId: actorUserId,
            requestId: toRequestId(`req-payout-reject-${Date.now()}`),
          }),
        }

        const updated = await payoutsRepo.rejectPayout(scope, {
          payoutId,
          reason: input.reason,
        })

        if (!updated) {
          throw new Error('Payout request not found or not in requested state.')
        }

        await auditLog.writeAuditLog(
          scope,
          auditOptions,
          {
            actorType: 'user',
            actorId: actorUserId,
            action: 'payout.rejected',
            targetType: 'payout',
            targetId: updated.id,
            metadata: { reason: input.reason },
          },
        )

        return updated
      },
    )

    return { ok: true, data: mapPayoutDTO(rejected) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reject payout.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function listPayoutsAction(
  rawWorkspaceId: string,
  rawFilter?: unknown,
): Promise<PayoutActionResult<PayoutDTO[]>> {
  const parsed = payoutFilterSchema.safeParse(rawFilter ?? {})
  if (!parsed.success) {
    return { ok: false, error: { code: 'ERROR', message: 'Invalid payout filter parameters.' } }
  }

  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.view')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth

  try {
    const list = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-list-${Date.now()}`),
      }),
      async (tx) => {
        return payoutsRepo.listPayouts(
          {
            tx,
            context: workspaceContext({
              workspaceId,
              actorId: actorUserId,
              requestId: toRequestId(`req-payout-list-${Date.now()}`),
            }),
          },
          parsed.data,
        )
      },
    )

    return { ok: true, data: list.map(mapPayoutDTO) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list payouts.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function getPayoutBalanceSummaryAction(
  rawWorkspaceId: string,
  currencyCode: CurrencyCode = 'INR' as CurrencyCode,
): Promise<PayoutActionResult<PayoutBalanceOverviewDTO>> {
  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.view')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth

  try {
    const overview = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-balance-${Date.now()}`),
      }),
      async (tx) => {
        return payoutsRepo.getPayoutBalanceOverview(
          {
            tx,
            context: workspaceContext({
              workspaceId,
              actorId: actorUserId,
              requestId: toRequestId(`req-payout-balance-${Date.now()}`),
            }),
          },
          currencyCode,
        )
      },
    )

    return { ok: true, data: overview }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load payout balance summary.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}

export async function exportPayoutsCsvAction(
  rawWorkspaceId: string,
): Promise<PayoutActionResult<string>> {
  const auth = await authenticateAndAuthorise(rawWorkspaceId, 'payout.view')
  if ('error' in auth) return { ok: false, error: auth.error }

  const { actorUserId, workspaceId, db } = auth

  try {
    const rows = await db.withWorkspace(
      workspaceContext({
        workspaceId,
        actorId: actorUserId,
        requestId: toRequestId(`req-payout-export-${Date.now()}`),
      }),
      async (tx) => {
        return payoutsRepo.listPayouts(
          {
            tx,
            context: workspaceContext({
              workspaceId,
              actorId: actorUserId,
              requestId: toRequestId(`req-payout-export-${Date.now()}`),
            }),
          },
          { limit: 1000, offset: 0 },
        )
      },
    )

    const headers = [
      'Date',
      'Payout ID',
      'Amount (INR)',
      'Status',
      'Account Type',
      'Masked Account / VPA',
      'IFSC Code',
      'Requested By',
      'Approved By',
      'Completed At',
      'Failure Reason',
    ]

    const csvLines = [
      headers.join(','),
      ...rows.map((p) => {
        const formattedAmount = (Number(p.amount) / 100).toFixed(2)
        const accountStr = p.beneficiary?.accountType === 'vpa'
          ? (p.beneficiary.vpa ?? '')
          : (p.beneficiary?.maskedAccountNumber ?? '')
        const ifscStr = p.beneficiary?.ifscCode ?? ''

        return [
          JSON.stringify(p.createdAt.toISOString()),
          JSON.stringify(p.id),
          JSON.stringify(formattedAmount),
          JSON.stringify(p.status),
          JSON.stringify(p.beneficiary?.accountType ?? 'unknown'),
          JSON.stringify(accountStr),
          JSON.stringify(ifscStr),
          JSON.stringify(p.requestedBy),
          JSON.stringify(p.approvedBy ?? ''),
          JSON.stringify(p.completedAt?.toISOString() ?? ''),
          JSON.stringify(p.failureReason ?? ''),
        ].join(',')
      }),
    ]

    return { ok: true, data: csvLines.join('\n') }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to export payouts CSV.'
    return { ok: false, error: { code: 'ERROR', message } }
  }
}
