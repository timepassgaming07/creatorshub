/**
 * Payouts, Beneficiary Accounts & Creator/Promoter Settlement Contracts (Slice 11 §11.1, §11.3).
 *
 * Responsibilities:
 * 1. Zod schemas for bank account / UPI VPA registration and verification.
 * 2. Payout lifecycle state unions ('requested', 'approved', 'processing', 'paid', 'failed', 'reversed').
 * 3. Two-person maker-checker approval schemas and audit inputs.
 * 4. Payout DTOs, balance breakdown overview, and itemization contracts.
 */
import { z } from 'zod'

import {
  beneficiaryAccountIdSchema,
  payoutIdSchema,
  payoutItemIdSchema,
  userIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import type {
  BeneficiaryAccountId,
  PayoutId,
  PayoutItemId,
  UserId,
  WorkspaceId,
} from './identifiers.js'
import { currency } from './money.js'
import type { CurrencyCode } from './money.js'

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

export const PAYOUT_STATUSES = [
  'requested',
  'approved',
  'processing',
  'paid',
  'failed',
  'reversed',
] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]
export const payoutStatusSchema = z.enum(PAYOUT_STATUSES)

export const PAYEE_TYPES = ['workspace', 'affiliate'] as const
export type PayeeType = (typeof PAYEE_TYPES)[number]
export const payeeTypeSchema = z.enum(PAYEE_TYPES)

export const BENEFICIARY_ACCOUNT_TYPES = ['bank_account', 'vpa'] as const
export type BeneficiaryAccountType = (typeof BENEFICIARY_ACCOUNT_TYPES)[number]
export const beneficiaryAccountTypeSchema = z.enum(BENEFICIARY_ACCOUNT_TYPES)

export const BENEFICIARY_STATUSES = ['pending', 'verified', 'rejected'] as const
export type BeneficiaryStatus = (typeof BENEFICIARY_STATUSES)[number]
export const beneficiaryStatusSchema = z.enum(BENEFICIARY_STATUSES)

export const PAYOUT_ITEM_SOURCE_TYPES = ['order', 'commission'] as const
export type PayoutItemSourceType = (typeof PAYOUT_ITEM_SOURCE_TYPES)[number]
export const payoutItemSourceTypeSchema = z.enum(PAYOUT_ITEM_SOURCE_TYPES)

/**
 * Standard Indian Financial System Code (IFSC) regex: 4 letters, 0, 6 alphanumeric.
 */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

/**
 * Standard UPI Virtual Payment Address (VPA) regex.
 */
export const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/

// ---------------------------------------------------------------------------
// Beneficiary Account Schemas
// ---------------------------------------------------------------------------

export const createBeneficiaryAccountSchema = z
  .object({
    payeeType: payeeTypeSchema.default('workspace'),
    payeeId: z.string().min(1),
    accountHolderName: z.string().trim().min(2).max(120),
    accountType: beneficiaryAccountTypeSchema,
    accountNumber: z.string().trim().min(6).max(34).optional(),
    ifscCode: z.string().trim().toUpperCase().regex(IFSC_PATTERN, 'Invalid Indian IFSC code.').optional(),
    vpa: z.string().trim().toLowerCase().regex(UPI_VPA_PATTERN, 'Invalid UPI ID format.').optional(),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.accountType === 'bank_account') {
        return !!data.accountNumber && !!data.ifscCode
      }
      if (data.accountType === 'vpa') {
        return !!data.vpa
      }
      return false
    },
    {
      message: 'Bank account requires account number & IFSC; UPI requires valid VPA.',
    },
  )

export type CreateBeneficiaryAccountInput = z.infer<typeof createBeneficiaryAccountSchema>

export type BeneficiaryAccountDTO = {
  readonly id: BeneficiaryAccountId
  readonly workspaceId: WorkspaceId
  readonly payeeType: PayeeType
  readonly payeeId: string
  readonly accountHolderName: string
  readonly accountType: BeneficiaryAccountType
  readonly maskedAccountNumber: string | null
  readonly ifscCode: string | null
  readonly vpa: string | null
  readonly status: BeneficiaryStatus
  readonly isDefault: boolean
  readonly verifiedAt: string | null
  readonly createdAt: string
}

// ---------------------------------------------------------------------------
// Payout Request & Processing Schemas
// ---------------------------------------------------------------------------

export const requestPayoutSchema = z.object({
  beneficiaryAccountId: beneficiaryAccountIdSchema,
  amountMinor: z.string().regex(/^\d+$/, 'Amount must be a positive integer in minor units (paise).'),
  currency: z
    .string()
    .length(3)
    .default('INR')
    .transform((val) => currency(val)),
  notes: z.string().max(500).optional(),
})

export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>

export const approvePayoutSchema = z.object({
  payoutId: payoutIdSchema,
  notes: z.string().max(500).optional(),
})

export type ApprovePayoutInput = z.infer<typeof approvePayoutSchema>

export const rejectPayoutSchema = z.object({
  payoutId: payoutIdSchema,
  reason: z.string().trim().min(3).max(500),
})

export type RejectPayoutInput = z.infer<typeof rejectPayoutSchema>

export const payoutFilterSchema = z.object({
  status: payoutStatusSchema.optional(),
  payeeType: payeeTypeSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
})

export type PayoutFilter = z.infer<typeof payoutFilterSchema>

// ---------------------------------------------------------------------------
// Payout DTOs
// ---------------------------------------------------------------------------

export type PayoutItemDTO = {
  readonly id: PayoutItemId
  readonly payoutId: PayoutId
  readonly sourceType: PayoutItemSourceType
  readonly sourceId: string
  readonly amountMinor: string
}

export type PayoutDTO = {
  readonly id: PayoutId
  readonly workspaceId: WorkspaceId
  readonly payeeType: PayeeType
  readonly payeeId: string
  readonly beneficiaryAccountId: BeneficiaryAccountId
  readonly amountMinor: string
  readonly currency: CurrencyCode
  readonly status: PayoutStatus
  readonly provider: string
  readonly providerPayoutId: string | null
  readonly ledgerTransactionId: string | null
  readonly requestedBy: UserId
  readonly approvedBy: UserId | null
  readonly requestedAt: string
  readonly approvedAt: string | null
  readonly completedAt: string | null
  readonly failureReason: string | null
  readonly beneficiary?: BeneficiaryAccountDTO | undefined
  readonly items?: readonly PayoutItemDTO[] | undefined
}

export type PayoutBalanceOverviewDTO = {
  readonly currency: CurrencyCode
  readonly availableBalanceMinor: string
  readonly inTransitBalanceMinor: string
  readonly lifetimeSettledMinor: string
  readonly pendingApprovalMinor: string
  readonly minimumPayoutMinor: string
}

export type PayoutSummaryDTO = {
  readonly totalRequestedCount: number
  readonly totalPaidCount: number
  readonly totalFailedCount: number
  readonly totalDisbursedMinor: string
}
