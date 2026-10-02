/**
 * Affiliate Programme & Multi-Tier Attribution Contracts (Slice 8 §8.1, §8.2, §8.3, §8.5).
 *
 * Responsibilities:
 * 1. Declare data structures for affiliate programs, affiliates, referral links, clicks, and attributions.
 * 2. Strict zero-float integer basis points (`basis_points`, 0 to 10000).
 * 3. Zod validation schemas for input contracts.
 */
import { z } from 'zod'

import {
  type AffiliateClickId,
  type AffiliateId,
  type AffiliateLinkId,
  type AffiliateProgramId,
  type AttributionId,
  type OrderId,
  type UserId,
  type WorkspaceId,
} from './identifiers.js'

export const AFFILIATE_STATUSES = ['pending', 'approved', 'suspended', 'rejected'] as const
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number]

export const ATTRIBUTION_STATUSES = [
  'attributed',
  'rejected_self_referral',
  'rejected_expired',
  'rejected_inactive',
  'rejected_program_disabled',
] as const
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number]

export type AffiliateProgram = {
  readonly id: AffiliateProgramId
  readonly workspaceId: WorkspaceId
  readonly isActive: boolean
  readonly defaultCommissionBps: number
  readonly cookieWindowDays: number
  readonly allowSelfReferral: boolean
  readonly autoApproveAffiliates: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type Affiliate = {
  readonly id: AffiliateId
  readonly workspaceId: WorkspaceId
  readonly userId: UserId | null
  readonly email: string
  readonly name: string | null
  readonly status: AffiliateStatus
  readonly customCommissionBps: number | null
  readonly payoutAccount: Record<string, unknown>
  readonly totalEarningsMinor: bigint
  readonly totalConversionsCount: number
  readonly joinedAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type AffiliateLink = {
  readonly id: AffiliateLinkId
  readonly workspaceId: WorkspaceId
  readonly affiliateId: AffiliateId
  readonly code: string
  readonly destinationUrl: string | null
  readonly clicksCount: number
  readonly conversionsCount: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type AffiliateClick = {
  readonly id: AffiliateClickId
  readonly workspaceId: WorkspaceId
  readonly affiliateLinkId: AffiliateLinkId
  readonly affiliateId: AffiliateId
  readonly visitorToken: string
  readonly ipHash: string
  readonly userAgent: string | null
  readonly referer: string | null
  readonly isBot: boolean
  readonly clickedAt: Date
}

export type Attribution = {
  readonly id: AttributionId
  readonly workspaceId: WorkspaceId
  readonly orderId: OrderId
  readonly affiliateId: AffiliateId
  readonly affiliateLinkId: AffiliateLinkId
  readonly affiliateClickId: AffiliateClickId | null
  readonly commissionBps: number
  readonly commissionAmountMinor: bigint
  readonly status: AttributionStatus
  readonly rejectionReason: string | null
  readonly attributedAt: Date
}

export type AffiliateProgramSummary = {
  readonly totalAffiliates: number
  readonly activeAffiliatesCount: number
  readonly totalReferredRevenueMinor: bigint
  readonly totalCommissionAccruedMinor: bigint
  readonly totalConversionsCount: number
}

// ---------------------------------------------------------------------------
// Zod Input Schemas
// ---------------------------------------------------------------------------

export const updateAffiliateProgramSchema = z.object({
  isActive: z.boolean().optional(),
  defaultCommissionBps: z
    .number()
    .int()
    .min(0, 'Commission cannot be negative.')
    .max(10000, 'Commission cannot exceed 100% (10000 bps).')
    .optional(),
  cookieWindowDays: z
    .number()
    .int()
    .min(1, 'Cookie window must be at least 1 day.')
    .max(365, 'Cookie window cannot exceed 365 days.')
    .optional(),
  allowSelfReferral: z.boolean().optional(),
  autoApproveAffiliates: z.boolean().optional(),
})

export type UpdateAffiliateProgramInput = z.infer<typeof updateAffiliateProgramSchema>

export const createAffiliateSchema = z.object({
  email: z.email('Invalid email address.').toLowerCase().trim(),
  name: z.string().min(1).max(255).trim().optional(),
  customCommissionBps: z.number().int().min(0).max(10000).optional(),
  payoutAccount: z.record(z.string(), z.unknown()).optional(),
})

export type CreateAffiliateInput = z.infer<typeof createAffiliateSchema>

export const createAffiliateLinkSchema = z.object({
  affiliateId: z.string().min(1),
  code: z
    .string()
    .min(3, 'Affiliate code must be at least 3 characters.')
    .max(32, 'Affiliate code cannot exceed 32 characters.')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Affiliate code can only contain alphanumeric characters, dashes, and underscores.')
    .toLowerCase()
    .trim(),
  destinationUrl: z.url('Invalid destination URL.').optional(),
})

export type CreateAffiliateLinkInput = z.infer<typeof createAffiliateLinkSchema>
