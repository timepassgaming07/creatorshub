import { currency, money } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '../result.js'
import {
  BENEFICIARY_SAFETY_COOLDOWN_MS,
  HIGH_VALUE_SAFETY_THRESHOLD_PAISE,
  MAX_SINGLE_PAYOUT_AMOUNT_PAISE,
  MIN_PAYOUT_AMOUNT_PAISE,
  checkBeneficiarySafetyCooldown,
  validateIfscCode,
  validatePayoutAmount,
  validateUpiVpa,
} from './validation.js'

describe('validateIfscCode', () => {
  it('accepts valid Indian IFSC codes', () => {
    expect(isOk(validateIfscCode('HDFC0000060'))).toBe(true)
    expect(isOk(validateIfscCode('SBIN0001234'))).toBe(true)
    expect(isOk(validateIfscCode('ICIC0000123'))).toBe(true)
  })

  it('rejects invalid IFSC codes', () => {
    expect(isErr(validateIfscCode('HDFC0000'))).toBe(true) // too short
    expect(isErr(validateIfscCode('HDFC1000060'))).toBe(true) // 5th character must be 0
    expect(isErr(validateIfscCode('12340000060'))).toBe(true) // first 4 must be alpha
  })
})

describe('validateUpiVpa', () => {
  it('accepts valid UPI VPAs', () => {
    expect(isOk(validateUpiVpa('creator@okhdfcbank'))).toBe(true)
    expect(isOk(validateUpiVpa('john.doe@paytm'))).toBe(true)
    expect(isOk(validateUpiVpa('affiliate_user@ybl'))).toBe(true)
  })

  it('rejects invalid UPI VPAs', () => {
    expect(isErr(validateUpiVpa('creator'))).toBe(true)
    expect(isErr(validateUpiVpa('@okhdfcbank'))).toBe(true)
    expect(isErr(validateUpiVpa('user@'))).toBe(true)
  })
})

describe('validatePayoutAmount', () => {
  it('validates amount within bounds and available balance', () => {
    const available = money(100_000n, currency('INR'))
    const validAmount = money(50_000n, currency('INR'))

    const result = validatePayoutAmount({
      amount: validAmount,
      availableBalance: available,
    })

    expect(isOk(result)).toBe(true)
  })

  it('rejects amounts below minimum payout', () => {
    const available = money(100_000n, currency('INR'))
    const belowMin = money(MIN_PAYOUT_AMOUNT_PAISE - 1n, currency('INR'))

    const result = validatePayoutAmount({
      amount: belowMin,
      availableBalance: available,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('BELOW_MINIMUM_PAYOUT')
    }
  })

  it('rejects amounts above maximum single velocity cap', () => {
    const available = money(100_000_000n, currency('INR'))
    const aboveMax = money(MAX_SINGLE_PAYOUT_AMOUNT_PAISE + 1n, currency('INR'))

    const result = validatePayoutAmount({
      amount: aboveMax,
      availableBalance: available,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('EXCEEDS_MAXIMUM_PAYOUT')
    }
  })

  it('rejects payout exceeding available balance (insufficient funds)', () => {
    const available = money(50_000n, currency('INR'))
    const requested = money(75_000n, currency('INR'))

    const result = validatePayoutAmount({
      amount: requested,
      availableBalance: available,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('INSUFFICIENT_FUNDS')
    }
  })
})

describe('checkBeneficiarySafetyCooldown', () => {
  it('flags high-value payouts to newly registered beneficiary within 24h', () => {
    const now = new Date('2026-08-31T12:00:00Z')
    const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2 hours ago
    const highAmount = money(HIGH_VALUE_SAFETY_THRESHOLD_PAISE + 100n, currency('INR'))

    const check = checkBeneficiarySafetyCooldown({
      beneficiaryCreatedAt: createdAt,
      requestDate: now,
      amount: highAmount,
    })

    expect(check.requiresSafetyReview).toBe(true)
    expect(check.reason).toBeDefined()
  })

  it('does not flag older accounts or lower amounts', () => {
    const now = new Date('2026-08-31T12:00:00Z')
    const oldAccount = new Date(now.getTime() - BENEFICIARY_SAFETY_COOLDOWN_MS - 1000)
    const highAmount = money(HIGH_VALUE_SAFETY_THRESHOLD_PAISE + 100n, currency('INR'))

    const checkOld = checkBeneficiarySafetyCooldown({
      beneficiaryCreatedAt: oldAccount,
      requestDate: now,
      amount: highAmount,
    })

    expect(checkOld.requiresSafetyReview).toBe(false)

    const smallAmount = money(MIN_PAYOUT_AMOUNT_PAISE, currency('INR'))
    const newAccount = new Date(now.getTime() - 1000)
    const checkSmall = checkBeneficiarySafetyCooldown({
      beneficiaryCreatedAt: newAccount,
      requestDate: now,
      amount: smallAmount,
    })

    expect(checkSmall.requiresSafetyReview).toBe(false)
  })
})
