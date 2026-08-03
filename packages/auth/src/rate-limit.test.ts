import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_LIMITS,
  ADDRESS_LIMITS,
  backoffFor,
  type LimitedAction,
  type Limit,
} from './rate-limit.js'

/**
 * The limits, as stated numbers rather than as whatever the code happens to say.
 *
 * Every value here is written out independently of the implementation, for the
 * same reason the authorisation matrix is: a test that reads the constant it is
 * checking asserts that the constant equals itself. Changing a limit has to mean
 * changing the stated intent too, and a limit is exactly the kind of number
 * someone loosens in a hurry to unblock a demo.
 *
 * The counting behaviour needs a database and lives in the integration suite.
 * This file covers the parts that are arithmetic.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('the account limits', () => {
  const expected: Record<LimitedAction, Limit> = {
    'sign-in': { max: 5, window: 15 * MINUTE },
    'password-reset-hourly': { max: 3, window: HOUR },
    'password-reset-daily': { max: 10, window: DAY },
    'verification-resend': { max: 3, window: HOUR },
  }

  it.each(Object.keys(expected) as LimitedAction[])('%s matches the specified limit', (action) => {
    expect(ACCOUNT_LIMITS[action]).toEqual(expected[action])
  })

  it('covers every action and nothing more', () => {
    expect(Object.keys(ACCOUNT_LIMITS).sort()).toEqual(Object.keys(expected).sort())
  })

  // A limit of zero locks everyone out permanently; a negative window makes every
  // attempt look expired. Both are the kind of typo that would otherwise ship.
  it.each(Object.entries(ACCOUNT_LIMITS))('%s is a usable limit', (_action, limit) => {
    expect(limit.max).toBeGreaterThan(0)
    expect(limit.window).toBeGreaterThan(0)
  })

  // The daily reset limit has to be the looser of the two, or the hourly one is
  // unreachable and the pair is really just one limit.
  it('makes the daily reset limit looser than the hourly one', () => {
    expect(ACCOUNT_LIMITS['password-reset-daily'].max).toBeGreaterThan(
      ACCOUNT_LIMITS['password-reset-hourly'].max,
    )
    expect(ACCOUNT_LIMITS['password-reset-daily'].window).toBeGreaterThan(
      ACCOUNT_LIMITS['password-reset-hourly'].window,
    )
  })
})

describe('the address limits', () => {
  // Seconds, not milliseconds, because that is the unit
  // `BetterAuthRateLimitRule` takes. Getting this wrong by a factor of 1000 makes
  // every limit either permanent or absent, and neither is obvious from reading
  // the config.
  it.each(Object.entries(ADDRESS_LIMITS))('%s counts its window in seconds', (_path, rule) => {
    expect(rule.window).toBe(3600)
    expect(rule.max).toBeGreaterThan(0)
  })

  it('limits every authentication path that sends an email or checks a password', () => {
    expect(Object.keys(ADDRESS_LIMITS).sort()).toEqual([
      '/request-password-reset',
      '/send-verification-email',
      '/sign-in/email',
      '/sign-up/email',
    ])
  })

  // The whole reason the two halves exist. An address can be a whole office
  // behind one NAT, so its limit must be looser than the per-account one, or
  // sharing an address with a colleague locks you both out.
  it('is looser per address than per account for sign-in', () => {
    expect(ADDRESS_LIMITS['/sign-in/email'].max).toBeGreaterThan(ACCOUNT_LIMITS['sign-in'].max)
  })
})

describe('backoff', () => {
  it('does not refuse while the count is within the limit', () => {
    for (let failures = 0; failures <= ACCOUNT_LIMITS['sign-in'].max; failures += 1) {
      expect(backoffFor('sign-in', failures)).toBe(0)
    }
  })

  // The first refusal waits exactly one window, so the person who typed their
  // password wrong five times waits fifteen minutes rather than an arbitrary
  // number nobody chose.
  it('waits one window on the first refusal', () => {
    const limit = ACCOUNT_LIMITS['sign-in']

    expect(backoffFor('sign-in', limit.max + 1)).toBe(limit.window)
  })

  it('doubles with each further failure', () => {
    const limit = ACCOUNT_LIMITS['sign-in']

    expect(backoffFor('sign-in', limit.max + 2)).toBe(limit.window * 2)
    expect(backoffFor('sign-in', limit.max + 3)).toBe(limit.window * 4)
  })

  // The cap is what stops the backoff becoming an attack. Without it, an attacker
  // who fails often enough locks the real owner out for days, which turns a
  // failed password guess into a successful denial of service.
  it('caps the wait, so an attacker cannot lock the owner out indefinitely', () => {
    const twoHours = 2 * HOUR

    expect(backoffFor('sign-in', 100)).toBe(twoHours)
    expect(backoffFor('sign-in', 1000)).toBe(twoHours)
  })

  it('never decreases as failures accumulate', () => {
    let previous = 0

    for (let failures = 0; failures < 20; failures += 1) {
      const current = backoffFor('sign-in', failures)

      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('applies to every limited action', () => {
    for (const action of Object.keys(ACCOUNT_LIMITS) as LimitedAction[]) {
      const limit = ACCOUNT_LIMITS[action]

      expect(backoffFor(action, limit.max)).toBe(0)
      expect(backoffFor(action, limit.max + 1)).toBeGreaterThan(0)
    }
  })
})
