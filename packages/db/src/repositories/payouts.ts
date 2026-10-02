/**
 * Payouts & Settlements Repository (Slice 11 §11.1, §11.4).
 *
 * Responsibilities:
 * 1. Payout lifecycle transitions (requested -> approved -> processing -> paid | failed).
 * 2. Maker-checker audit stamping (requested_by, approved_by).
 * 3. Ledger-derived financial balance overview (Available, In-Transit, Settled).
 * 4. Automatic double-entry ledger postings on payout approval and failure reversals.
 */
import {
  type BeneficiaryAccountId,
  type CurrencyCode,
  type PayeeType,
  type PayoutFilter,
  type PayoutId,
  type UserId,
  ledgerAccountId,
} from '@creatorhub/contracts'
import { desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type BeneficiaryAccount,
  type Payout,
  type PayoutItem,
  beneficiaryAccounts,
  payoutItems,
  payouts,
} from '../schema/index.js'
import * as ledgerRepo from './ledger.js'

export type RequestPayoutData = {
  readonly payeeType?: PayeeType | undefined
  readonly payeeId?: string | undefined
  readonly beneficiaryAccountId: BeneficiaryAccountId
  readonly amount: bigint
  readonly currency?: CurrencyCode | undefined
  readonly requestedBy: UserId
  readonly notes?: string | undefined
}

export type PayoutWithBeneficiary = Payout & {
  readonly beneficiary?: BeneficiaryAccount | undefined
  readonly items?: PayoutItem[] | undefined
}

export async function requestPayout(
  scope: RepositoryScope,
  data: RequestPayoutData,
): Promise<Payout> {
  const [created] = await scope.tx
    .insert(payouts)
    .values(
      insertValues(scope, {
        payeeType: data.payeeType ?? 'workspace',
        payeeId: data.payeeId ?? scope.context.workspaceId,
        beneficiaryAccountId: data.beneficiaryAccountId,
        amount: data.amount,
        currency: data.currency ?? 'INR',
        status: 'requested',
        provider: 'razorpay',
        requestedBy: data.requestedBy,
        notes: data.notes ?? null,
      }),
    )
    .returning()

  if (!created) {
    throw new Error('Failed to create payout request.')
  }

  return created
}

export async function approvePayout(
  scope: RepositoryScope,
  params: {
    readonly payoutId: PayoutId
    readonly approvedBy: UserId
    readonly notes?: string | undefined
  },
): Promise<Payout | undefined> {
  const [existing] = await scope.tx
    .select()
    .from(payouts)
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId)))
    .limit(1)

  if (existing?.status !== 'requested') {
    return undefined
  }

  // The approval and its ledger posting commit together or not at all: a
  // payout marked approved without the matching debit would let the same
  // money be paid twice.
  const creatorPayableAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
    scope,
    'creator_payable',
    existing.currency as CurrencyCode,
  )
  const processorClearingAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
    scope,
    'processor_clearing',
    existing.currency as CurrencyCode,
  )
  const ledgerRes = await ledgerRepo.postTransaction(scope, {
    workspaceId: scope.context.workspaceId,
    idempotencyKey: `payout-approval-${existing.id}`,
    kind: 'payout',
    referenceType: 'payout',
    referenceId: existing.id,
    description: `Disbursement payout of ${existing.amount.toString()} paise`,
    entries: [
      {
        accountId: ledgerAccountId(creatorPayableAcc.id),
        direction: 'debit',
        amount: existing.amount,
        currency: existing.currency as CurrencyCode,
      },
      {
        accountId: ledgerAccountId(processorClearingAcc.id),
        direction: 'credit',
        amount: existing.amount,
        currency: existing.currency as CurrencyCode,
      },
    ],
  })
  const ledgerTxId = ledgerRes.transaction.id

  const [updated] = await scope.tx
    .update(payouts)
    .set({
      status: 'approved',
      approvedBy: params.approvedBy,
      approvedAt: new Date(),
      ledgerTransactionId: ledgerTxId,
      notes: params.notes ?? existing.notes,
      updatedAt: new Date(),
    })
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId)))
    .returning()

  return updated
}

export async function rejectPayout(
  scope: RepositoryScope,
  params: {
    readonly payoutId: PayoutId
    readonly reason: string
  },
): Promise<Payout | undefined> {
  const [updated] = await scope.tx
    .update(payouts)
    .set({
      status: 'failed',
      failureReason: params.reason,
      updatedAt: new Date(),
    })
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId), eq(payouts.status, 'requested')))
    .returning()

  return updated
}

export async function recordPayoutProcessing(
  scope: RepositoryScope,
  params: {
    readonly payoutId: PayoutId
    readonly providerPayoutId: string
  },
): Promise<Payout | undefined> {
  const [updated] = await scope.tx
    .update(payouts)
    .set({
      status: 'processing',
      providerPayoutId: params.providerPayoutId,
      updatedAt: new Date(),
    })
    // Only an approved payout has had its ledger debit posted.
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId), eq(payouts.status, 'approved')))
    .returning()

  return updated
}

export async function recordPayoutSettlement(
  scope: RepositoryScope,
  payoutIdToSettle: PayoutId,
): Promise<Payout | undefined> {
  const [updated] = await scope.tx
    .update(payouts)
    .set({
      status: 'paid',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        scope,
        payouts,
        eq(payouts.id, payoutIdToSettle),
        inArray(payouts.status, ['approved', 'processing']),
      ),
    )
    .returning()

  return updated
}

export async function recordPayoutFailure(
  scope: RepositoryScope,
  params: {
    readonly payoutId: PayoutId
    readonly failureReason: string
  },
): Promise<Payout | undefined> {
  const [existing] = await scope.tx
    .select()
    .from(payouts)
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId)))
    .limit(1)

  if (!existing) return undefined

  // Compensating ledger entry if funds were already debited on approval.
  if (existing.status === 'approved' || existing.status === 'processing') {
    const creatorPayableAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
      scope,
      'creator_payable',
      existing.currency as CurrencyCode,
    )
    const processorClearingAcc = await ledgerRepo.findOrCreateWorkspaceAccount(
      scope,
      'processor_clearing',
      existing.currency as CurrencyCode,
    )
    await ledgerRepo.postTransaction(scope, {
      workspaceId: scope.context.workspaceId,
      idempotencyKey: `payout-failure-reversal-${existing.id}`,
      kind: 'payout',
      referenceType: 'payout',
      referenceId: existing.id,
      description: `Compensating reversal for failed payout ${existing.id}`,
      entries: [
        {
          accountId: ledgerAccountId(processorClearingAcc.id),
          direction: 'debit',
          amount: existing.amount,
          currency: existing.currency as CurrencyCode,
        },
        {
          accountId: ledgerAccountId(creatorPayableAcc.id),
          direction: 'credit',
          amount: existing.amount,
          currency: existing.currency as CurrencyCode,
        },
      ],
    })
  } else if (existing.status !== 'requested') {
    return undefined
  }

  const [updated] = await scope.tx
    .update(payouts)
    .set({
      status: 'failed',
      failureReason: params.failureReason,
      updatedAt: new Date(),
    })
    .where(scoped(scope, payouts, eq(payouts.id, params.payoutId)))
    .returning()

  return updated
}

export async function findPayoutById(
  scope: RepositoryScope,
  id: PayoutId,
): Promise<PayoutWithBeneficiary | undefined> {
  const [payout] = await scope.tx
    .select()
    .from(payouts)
    .where(scoped(scope, payouts, eq(payouts.id, id)))
    .limit(1)

  if (!payout) return undefined

  const [beneficiary] = await scope.tx
    .select()
    .from(beneficiaryAccounts)
    .where(
      scoped(scope, beneficiaryAccounts, eq(beneficiaryAccounts.id, payout.beneficiaryAccountId)),
    )
    .limit(1)

  const items = await scope.tx
    .select()
    .from(payoutItems)
    .where(scoped(scope, payoutItems, eq(payoutItems.payoutId, payout.id)))

  return {
    ...payout,
    beneficiary,
    items,
  }
}

export async function listPayouts(
  scope: RepositoryScope,
  filter?: PayoutFilter,
): Promise<PayoutWithBeneficiary[]> {
  const conditions = []

  if (filter?.status) {
    conditions.push(eq(payouts.status, filter.status))
  }
  if (filter?.payeeType) {
    conditions.push(eq(payouts.payeeType, filter.payeeType))
  }
  if (filter?.from) {
    conditions.push(gte(payouts.createdAt, new Date(filter.from)))
  }
  if (filter?.to) {
    conditions.push(lte(payouts.createdAt, new Date(filter.to)))
  }

  const limit = filter?.limit ?? 50
  const offset = filter?.offset ?? 0

  const rows = await scope.tx
    .select()
    .from(payouts)
    .where(scoped(scope, payouts, ...conditions))
    .orderBy(desc(payouts.createdAt))
    .limit(limit)
    .offset(offset)

  if (rows.length === 0) return []

  const beneficiaryIds = Array.from(new Set(rows.map((r) => r.beneficiaryAccountId)))
  const beneficiaries = await scope.tx
    .select()
    .from(beneficiaryAccounts)
    .where(scoped(scope, beneficiaryAccounts, inArray(beneficiaryAccounts.id, beneficiaryIds)))

  const beneficiaryMap = new Map(beneficiaries.map((b) => [b.id, b]))

  return rows.map((payout) => ({
    ...payout,
    beneficiary: beneficiaryMap.get(payout.beneficiaryAccountId),
  }))
}

export async function getPayoutBalanceOverview(
  scope: RepositoryScope,
  curr: CurrencyCode = 'INR' as CurrencyCode,
): Promise<{
  readonly currency: CurrencyCode
  readonly availableBalanceMinor: string
  readonly inTransitBalanceMinor: string
  readonly lifetimeSettledMinor: string
  readonly pendingApprovalMinor: string
  readonly minimumPayoutMinor: string
}> {
  // Payouts by status
  const payoutRows = await scope.tx
    .select({
      status: payouts.status,
      totalAmount: sql<string>`coalesce(sum(${payouts.amount}), 0)::text`,
    })
    .from(payouts)
    .where(scoped(scope, payouts, eq(payouts.currency, curr)))
    .groupBy(payouts.status)

  let pendingApproval = 0n
  let inTransit = 0n
  let lifetimeSettled = 0n

  for (const row of payoutRows) {
    const amount = BigInt(row.totalAmount || '0')
    if (row.status === 'requested') {
      pendingApproval += amount
    } else if (row.status === 'approved' || row.status === 'processing') {
      inTransit += amount
    } else if (row.status === 'paid') {
      lifetimeSettled += amount
    }
  }

  // The creator's money is the creator_payable account: credited with each
  // sale net of fees, tax, and commission; debited by refunds and approved
  // payouts. Requests still awaiting approval are set aside on top.
  const creatorPayable = await ledgerRepo.findOrCreateWorkspaceAccount(
    scope,
    'creator_payable',
    curr,
  )
  const ledgerBalance = (
    await ledgerRepo.getAccountBalance(scope, ledgerAccountId(creatorPayable.id))
  ).amount
  const netAvailable = ledgerBalance > pendingApproval ? ledgerBalance - pendingApproval : 0n

  return {
    currency: curr,
    availableBalanceMinor: netAvailable.toString(),
    inTransitBalanceMinor: inTransit.toString(),
    lifetimeSettledMinor: lifetimeSettled.toString(),
    pendingApprovalMinor: pendingApproval.toString(),
    minimumPayoutMinor: '50000', // ₹500.00
  }
}
