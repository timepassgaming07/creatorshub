/**
 * Affiliate Attribution Domain Invariants & Rules (Slice 8 §8.4, §8.5, §8.6, §8.7).
 *
 * Responsibilities:
 * 1. Zero-float integer basis point commission calculations (`calculateCommissionMinor`).
 * 2. Self-referral detection (buyer email matching affiliate email).
 * 3. Attribution window / expiration boundary verification.
 * 4. Pure domain evaluation returning immutable attribution decision and rejection reasons.
 */
import type { AttributionStatus } from '@creatorhub/contracts'

export const MAX_COMMISSION_BPS = 10000 // 100.00%
export const MIN_COMMISSION_BPS = 0
export const DEFAULT_WINDOW_DAYS = 30
export const MS_PER_DAY = 86_400_000

export type EvaluateAttributionParams = {
  readonly programIsActive: boolean
  readonly allowSelfReferral: boolean
  readonly cookieWindowDays: number
  readonly defaultCommissionBps: number
  readonly customCommissionBps: number | null
  readonly affiliateStatus: 'pending' | 'approved' | 'suspended' | 'rejected'
  readonly affiliateEmail: string
  readonly buyerEmail: string
  readonly saleAmountMinor: bigint
  readonly clickDate: Date | null
  readonly orderDate: Date
}

export type AttributionDecision = {
  readonly eligible: boolean
  readonly status: AttributionStatus
  readonly commissionBps: number
  readonly commissionAmountMinor: bigint
  readonly rejectionReason: string | null
}

/**
 * Calculates commission amount in integer minor units using basis points (0 to 10000).
 *
 * Formula: (saleAmountMinor * bps) / 10000
 */
export function calculateCommissionMinor(
  saleAmountMinor: bigint,
  commissionBps: number,
): bigint {
  if (saleAmountMinor <= 0n || commissionBps <= 0) {
    return 0n
  }
  const boundedBps = Math.min(Math.max(commissionBps, MIN_COMMISSION_BPS), MAX_COMMISSION_BPS)
  return (saleAmountMinor * BigInt(boundedBps)) / 10000n
}

/**
 * Checks whether the buyer is the affiliate themselves (self-referral).
 */
export function isSelfReferral(buyerEmail: string, affiliateEmail: string): boolean {
  return buyerEmail.trim().toLowerCase() === affiliateEmail.trim().toLowerCase()
}

/**
 * Checks whether an affiliate click is within the active attribution cookie window.
 */
export function isClickWithinWindow(
  clickDate: Date,
  orderDate: Date,
  windowDays: number,
): boolean {
  const clickMs = clickDate.getTime()
  const orderMs = orderDate.getTime()
  if (orderMs < clickMs) {
    return false
  }
  const maxMs = windowDays * MS_PER_DAY
  return orderMs - clickMs <= maxMs
}

/**
 * Evaluates an order for affiliate commission attribution.
 *
 * Rules:
 * 1. If program is not active -> rejected_program_disabled
 * 2. If affiliate is not approved -> rejected_inactive
 * 3. If self-referral and not allowed -> rejected_self_referral
 * 4. If click is older than windowDays -> rejected_expired
 * 5. Otherwise -> attributed with effective commission rate (custom or default)
 */
export function evaluateAttribution(params: EvaluateAttributionParams): AttributionDecision {
  const effectiveBps = params.customCommissionBps ?? params.defaultCommissionBps

  if (!params.programIsActive) {
    return {
      eligible: false,
      status: 'rejected_program_disabled',
      commissionBps: 0,
      commissionAmountMinor: 0n,
      rejectionReason: 'Affiliate program is currently disabled.',
    }
  }

  if (params.affiliateStatus !== 'approved') {
    return {
      eligible: false,
      status: 'rejected_inactive',
      commissionBps: 0,
      commissionAmountMinor: 0n,
      rejectionReason: `Affiliate status is ${params.affiliateStatus}.`,
    }
  }

  if (!params.allowSelfReferral && isSelfReferral(params.buyerEmail, params.affiliateEmail)) {
    return {
      eligible: false,
      status: 'rejected_self_referral',
      commissionBps: 0,
      commissionAmountMinor: 0n,
      rejectionReason: 'Self-referral is forbidden for this program.',
    }
  }

  if (
    params.clickDate &&
    !isClickWithinWindow(params.clickDate, params.orderDate, params.cookieWindowDays)
  ) {
    return {
      eligible: false,
      status: 'rejected_expired',
      commissionBps: 0,
      commissionAmountMinor: 0n,
      rejectionReason: `Click expired beyond the ${params.cookieWindowDays.toString()}-day attribution window.`,
    }
  }

  const commissionAmountMinor = calculateCommissionMinor(params.saleAmountMinor, effectiveBps)

  return {
    eligible: true,
    status: 'attributed',
    commissionBps: effectiveBps,
    commissionAmountMinor,
    rejectionReason: null,
  }
}
