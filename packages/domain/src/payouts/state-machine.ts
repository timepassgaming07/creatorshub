/**
 * Payout State Machine & Two-Person Maker-Checker Approval Policy (Slice 11 §11.3).
 *
 * Responsibilities:
 * 1. Pure deterministic state machine governing payout lifecycle transitions:
 *    requested -> approved | failed
 *    approved  -> processing | failed
 *    processing -> paid | failed
 *    paid      -> reversed
 * 2. Maker-Checker / Two-Person Rule governance (ADR-0019):
 *    - In multi-member workspaces, an Admin/Owner who requests a payout cannot approve it.
 *    - Single-owner workspaces are permitted self-approval up to a strictly bounded threshold.
 * 3. Pure functions with Result<T, E> error handling.
 */
import type { Money, PayoutStatus, UserId } from '@creatorhub/contracts'
import { greaterThan, money } from '@creatorhub/contracts'

import type { WorkspaceRole } from '../identity/policy.js'
import { type Result, domainError, err, ok } from '../result.js'

// ---------------------------------------------------------------------------
// Constants & Invariants
// ---------------------------------------------------------------------------

/**
 * Maximum threshold for single-owner self-approval (1,00,000 INR = 10,000,000 paise).
 * Exceeding amounts require explicit secondary approver or step-up MFA.
 */
export const MAX_SELF_APPROVAL_THRESHOLD_PAISE = 10_000_000n

export const VALID_PAYOUT_TRANSITIONS: Readonly<Record<PayoutStatus, readonly PayoutStatus[]>> = {
  requested: ['approved', 'failed'], // 'failed' covers explicit rejection
  approved: ['processing', 'failed'],
  processing: ['paid', 'failed'],
  paid: ['reversed'],
  failed: [],
  reversed: [],
}

// ---------------------------------------------------------------------------
// Pure Transition Functions
// ---------------------------------------------------------------------------

export function canTransitionPayout(current: PayoutStatus, next: PayoutStatus): boolean {
  const allowed = VALID_PAYOUT_TRANSITIONS[current] ?? []
  return allowed.includes(next)
}

export function isPayoutTerminal(status: PayoutStatus): boolean {
  return status === 'paid' || status === 'failed' || status === 'reversed'
}

/**
 * Validates Maker-Checker / Two-Person Rule for payout approval (ADR-0019).
 */
export function validateMakerCheckerApproval(params: {
  readonly requestedBy: UserId
  readonly approvedBy: UserId
  readonly approverRole: WorkspaceRole
  readonly amount: Money
  readonly totalWorkspaceMembers: number
}): Result<true> {
  const { requestedBy, approvedBy, approverRole, amount, totalWorkspaceMembers } = params

  if (approverRole === 'member') {
    return err(
      domainError({
        code: 'FORBIDDEN',
        title: 'Unauthorized to approve payout',
        detail: 'Members are not authorized to approve payouts.',
        action: 'Request an workspace owner or admin to review this payout.',
      }),
    )
  }

  // Multi-member workspace: Strict Two-Person Rule (Requester !== Approver)
  if (totalWorkspaceMembers > 1) {
    if (requestedBy === approvedBy) {
      return err(
        domainError({
          code: 'CONFLICT_OF_INTEREST',
          title: 'Two-person approval rule violation',
          detail: 'The creator or admin who requested this payout cannot approve their own request in a multi-member workspace.',
          action: 'Have another workspace owner or admin review and approve this payout.',
        }),
      )
    }
    return ok(true)
  }

  // Single-member workspace: Self-approval allowed only up to threshold
  if (requestedBy === approvedBy) {
    const threshold = money(MAX_SELF_APPROVAL_THRESHOLD_PAISE, amount.currency)
    if (greaterThan(amount, threshold)) {
      return err(
        domainError({
          code: 'APPROVAL_THRESHOLD_EXCEEDED',
          title: 'Self-approval threshold exceeded',
          detail: `Payout amount exceeds the single-owner self-approval limit of ${threshold.amount.toString()} paise.`,
          action: 'Contact platform compliance or add a designated secondary administrator for large disbursements.',
        }),
      )
    }
  }

  return ok(true)
}

/**
 * Validates whether a payout can transition from current to target status.
 */
export function transitionPayout(
  current: PayoutStatus,
  target: PayoutStatus,
): Result<PayoutStatus> {
  if (!canTransitionPayout(current, target)) {
    return err(
      domainError({
        code: 'INVALID_STATE_TRANSITION',
        title: 'Invalid payout state transition',
        detail: `Cannot transition payout from '${current}' to '${target}'.`,
        action: 'Refresh the page and check the current payout status before retrying.',
      }),
    )
  }

  return ok(target)
}
