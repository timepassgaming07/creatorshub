/**
 * Commission State Machine & Financial Invariants (Slice 9 §9.1, §9.3, §9.5, §9.7).
 *
 * Responsibilities:
 * 1. Hold period calculation: Guaranteed to be at least the store refund window (no premature release).
 * 2. State transition validation: Enforces strict state graph transitions.
 * 3. Pro-rated clawback calculation: Computes exact integer minor unit reversals on partial refunds.
 * 4. Vesting qualification: Determines eligibility for payout release.
 */
import type {
  ClawbackStatus,
  CommissionStatus,
} from '@creatorhub/contracts'
import { domainError, err, ok, type Result } from '../result.js'

/**
 * Calculates the exact hold expiration timestamp for an attributed commission.
 *
 * Invariant (Slice 9 §9.3):
 * The hold period cannot be shorter than the workspace refund window.
 * Formula: orderDate + max(holdPeriodDays, refundWindowDays).
 */
export function calculateHeldUntil(
  orderDate: Date,
  holdPeriodDays: number,
  refundWindowDays: number = 14,
): Date {
  const safeHoldDays = Math.max(holdPeriodDays, refundWindowDays, 0)
  const MS_PER_DAY = 86_400_000
  return new Date(orderDate.getTime() + safeHoldDays * MS_PER_DAY)
}

/**
 * Valid state transitions for the commission lifecycle.
 */
const VALID_TRANSITIONS: Readonly<Record<CommissionStatus, readonly CommissionStatus[]>> = {
  pending: ['held', 'clawed_back'],
  held: ['vested', 'clawed_back'],
  vested: ['paid', 'clawed_back'],
  paid: ['clawed_back'],
  clawed_back: [],
}

/**
 * Validates whether a commission state transition is permitted.
 */
export function isValidCommissionStatusTransition(
  from: CommissionStatus,
  to: CommissionStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Evaluates whether a held commission is mature and ready to be vested.
 */
export function canVestCommission(
  commission: {
    readonly status: CommissionStatus
    readonly heldUntil: Date
  },
  asOfDate: Date = new Date(),
): boolean {
  if (commission.status !== 'held') {
    return false
  }
  return asOfDate.getTime() >= commission.heldUntil.getTime()
}

/**
 * Calculates the exact clawback minor amount for full or partial order refunds.
 *
 * Invariant (Slice 9 §9.5, §9.7):
 * - If full refund (refundAmount >= orderSubtotal), claws back the entire remaining net commission.
 * - If partial refund, pro-rates proportionally: (refundAmountMinor * grossCommissionMinor) / orderSubtotalMinor.
 * - Clawback amount is strictly bounded by remaining netAmountMinor (cannot claw back more than net commission).
 */
export function calculateClawbackMinor(params: {
  readonly grossCommissionMinor: bigint
  readonly netCommissionMinor: bigint
  readonly orderSubtotalMinor: bigint
  readonly refundAmountMinor: bigint
}): bigint {
  const {
    grossCommissionMinor,
    netCommissionMinor,
    orderSubtotalMinor,
    refundAmountMinor,
  } = params

  if (netCommissionMinor <= 0n || refundAmountMinor <= 0n || orderSubtotalMinor <= 0n) {
    return 0n
  }

  // Full refund case
  if (refundAmountMinor >= orderSubtotalMinor) {
    return netCommissionMinor
  }

  // Pro-rated partial refund: (refundAmount * grossCommission) / orderSubtotal
  const calculatedClawback = (refundAmountMinor * grossCommissionMinor) / orderSubtotalMinor

  // Bound by remaining net amount (minimum 1 minor unit if refund > 0 and calculation rounded to 0)
  const safeClawback = calculatedClawback > 0n ? calculatedClawback : 1n
  return safeClawback > netCommissionMinor ? netCommissionMinor : safeClawback
}

export type CommissionTransitionDecision =
  | {
      readonly ok: true
      readonly nextStatus: CommissionStatus
      readonly netAmountMinor: bigint
      readonly clawbackAmountMinor: bigint
      readonly clawbackStatus: ClawbackStatus
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly detail: string
      }
    }

/**
 * Evaluates a refund clawback against an existing commission record.
 */
export function evaluateClawback(params: {
  readonly currentStatus: CommissionStatus
  readonly grossCommissionMinor: bigint
  readonly netCommissionMinor: bigint
  readonly orderSubtotalMinor: bigint
  readonly refundAmountMinor: bigint
}): Result<{
  readonly clawbackAmountMinor: bigint
  readonly nextNetAmountMinor: bigint
  readonly nextStatus: CommissionStatus
  readonly clawbackStatus: ClawbackStatus
}> {
  const { currentStatus, netCommissionMinor } = params

  if (currentStatus === 'clawed_back' || netCommissionMinor <= 0n) {
    return err(
      domainError({
        code: 'COMMISSION_ALREADY_CLAWED_BACK',
        title: 'Commission already clawed back',
        detail: 'This commission has already been fully reversed.',
        action: 'No further clawback can be applied.',
      }),
    )
  }

  const clawbackAmount = calculateClawbackMinor(params)
  if (clawbackAmount <= 0n) {
    return err(
      domainError({
        code: 'INVALID_CLAWBACK_AMOUNT',
        title: 'Invalid clawback amount',
        detail: 'Calculated clawback amount is zero.',
        action: 'Ensure refund amount is positive.',
      }),
    )
  }

  const nextNetAmount = netCommissionMinor - clawbackAmount
  const nextStatus: CommissionStatus = nextNetAmount === 0n ? 'clawed_back' : currentStatus
  const clawbackStatus: ClawbackStatus = currentStatus === 'paid' ? 'uncollectable' : 'applied'

  return ok({
    clawbackAmountMinor: clawbackAmount,
    nextNetAmountMinor: nextNetAmount,
    nextStatus,
    clawbackStatus,
  })
}
