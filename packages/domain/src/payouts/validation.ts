/**
 * Beneficiary & Payout Verification Rules & Velocity Controls (Slice 11 §11.3, §11.6).
 *
 * Responsibilities:
 * 1. Indian banking IFSC and UPI VPA validation.
 * 2. Balance adequacy and minimum/maximum payout threshold validation.
 * 3. Beneficiary account safety cooldowns (e.g. flagging immediate payouts to newly registered bank accounts).
 */
import type { Money } from '@creatorhub/contracts'
import {
  CurrencyMismatchError,
  IFSC_PATTERN,
  UPI_VPA_PATTERN,
  greaterThan,
  lessThan,
  money,
} from '@creatorhub/contracts'

import { type Result, domainError, err, ok } from '../result.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum payout amount: ₹500.00 (50,000 paise) */
export const MIN_PAYOUT_AMOUNT_PAISE = 50_000n

/** Maximum single payout velocity limit: ₹5,00,000.00 (50,000,000 paise) */
export const MAX_SINGLE_PAYOUT_AMOUNT_PAISE = 50_000_000n

/** High-value threshold for safety reviews on new accounts: ₹50,000.00 (5,000,000 paise) */
export const HIGH_VALUE_SAFETY_THRESHOLD_PAISE = 5_000_000n

/** Safety cooldown window in milliseconds (24 hours) */
export const BENEFICIARY_SAFETY_COOLDOWN_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Pure Validation Functions
// ---------------------------------------------------------------------------

/**
 * Validates an Indian IFSC code format.
 */
export function validateIfscCode(code: string): Result<string> {
  const normalized = code.trim().toUpperCase()
  if (!IFSC_PATTERN.test(normalized)) {
    return err(
      domainError({
        code: 'INVALID_IFSC_CODE',
        title: 'Invalid IFSC code',
        detail: 'Expected 4 alphabetic characters, followed by 0, followed by 6 alphanumeric characters (e.g. HDFC0000060).',
        action: 'Check your cheque book or bank passbook for the exact 11-character IFSC code.',
      }),
    )
  }
  return ok(normalized)
}

/**
 * Validates a UPI Virtual Payment Address (VPA) format.
 */
export function validateUpiVpa(vpa: string): Result<string> {
  const normalized = vpa.trim().toLowerCase()
  if (!UPI_VPA_PATTERN.test(normalized)) {
    return err(
      domainError({
        code: 'INVALID_UPI_VPA',
        title: 'Invalid UPI ID',
        detail: 'Expected a standard handle@bank or phone@psp format (e.g. name@okhdfcbank).',
        action: 'Verify your UPI ID in your banking or UPI payment app before entering.',
      }),
    )
  }
  return ok(normalized)
}

/**
 * Validates payout amount against minimum threshold, maximum single cap, and available ledger balance.
 */
export function validatePayoutAmount(params: {
  readonly amount: Money
  readonly availableBalance: Money
}): Result<Money> {
  const { amount, availableBalance } = params

  if (amount.currency !== availableBalance.currency) {
    return err(
      domainError({
        code: 'CURRENCY_MISMATCH',
        title: 'Currency mismatch',
        detail: `Payout currency '${amount.currency}' does not match available balance currency '${availableBalance.currency}'.`,
        action: 'Request payout in the workspace native currency.',
      }),
    )
  }

  if (amount.amount <= 0n) {
    return err(
      domainError({
        code: 'INVALID_AMOUNT',
        title: 'Invalid payout amount',
        detail: 'Payout amount must be greater than zero.',
        action: 'Enter a positive disbursement amount.',
      }),
    )
  }

  const minPayout = money(MIN_PAYOUT_AMOUNT_PAISE, amount.currency)
  if (lessThan(amount, minPayout)) {
    return err(
      domainError({
        code: 'BELOW_MINIMUM_PAYOUT',
        title: 'Amount below minimum payout threshold',
        detail: `Payout amount must be at least ₹${(Number(minPayout.amount) / 100).toFixed(2)} (${minPayout.amount.toString()} paise).`,
        action: 'Increase the payout request amount or wait for further earnings to accrue.',
      }),
    )
  }

  const maxPayout = money(MAX_SINGLE_PAYOUT_AMOUNT_PAISE, amount.currency)
  if (greaterThan(amount, maxPayout)) {
    return err(
      domainError({
        code: 'EXCEEDS_MAXIMUM_PAYOUT',
        title: 'Amount exceeds maximum single payout velocity limit',
        detail: `Payout amount exceeds the single payout cap of ₹${(Number(maxPayout.amount) / 100).toFixed(2)}.`,
        action: 'Split the payout into multiple tranches or contact support for corporate limits.',
      }),
    )
  }

  if (greaterThan(amount, availableBalance)) {
    return err(
      domainError({
        code: 'INSUFFICIENT_FUNDS',
        title: 'Insufficient available balance',
        detail: `Requested payout of ₹${(Number(amount.amount) / 100).toFixed(2)} exceeds available balance of ₹${(Number(availableBalance.amount) / 100).toFixed(2)}.`,
        action: 'Reduce the payout request to match your available settled balance.',
      }),
    )
  }

  return ok(amount)
}

/**
 * Checks whether a payout to a newly registered beneficiary requires safety cooldown flagging.
 */
export function checkBeneficiarySafetyCooldown(params: {
  readonly beneficiaryCreatedAt: Date
  readonly requestDate?: Date
  readonly amount: Money
}): { readonly requiresSafetyReview: boolean; readonly reason?: string } {
  const { beneficiaryCreatedAt, requestDate = new Date(), amount } = params

  const ageMs = requestDate.getTime() - beneficiaryCreatedAt.getTime()
  const isWithinCooldown = ageMs < BENEFICIARY_SAFETY_COOLDOWN_MS

  const highValue = money(HIGH_VALUE_SAFETY_THRESHOLD_PAISE, amount.currency)
  const isHighValue = greaterThan(amount, highValue)

  if (isWithinCooldown && isHighValue) {
    const remainingHours = Math.ceil((BENEFICIARY_SAFETY_COOLDOWN_MS - ageMs) / (60 * 60 * 1000))
    return {
      requiresSafetyReview: true,
      reason: `Beneficiary account registered within the last 24h (${String(remainingHours)}h cooldown remaining) for a high-value payout.`,
    }
  }

  return { requiresSafetyReview: false }
}
