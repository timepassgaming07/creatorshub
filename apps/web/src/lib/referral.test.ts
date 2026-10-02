import { describe, expect, it } from 'vitest'

import { formatReferralCookie, readReferralCookie } from './referral'

describe('referral cookie', () => {
  const at = new Date('2026-09-01T10:00:00.000Z')

  it('round-trips for the store it was set on', () => {
    const value = formatReferralCookie('Asha-Studio', 'PRIYA20', at)
    expect(readReferralCookie(value, 'asha-studio')).toEqual({
      code: 'PRIYA20',
      clickedAt: at.toISOString(),
    })
  })

  it('never credits a code on a different store', () => {
    const value = formatReferralCookie('asha-studio', 'PRIYA20', at)
    expect(readReferralCookie(value, 'other-store')).toBeNull()
  })

  it('ignores tampered or malformed values', () => {
    expect(readReferralCookie(undefined, 'a')).toBeNull()
    expect(readReferralCookie('garbage', 'a')).toBeNull()
    expect(readReferralCookie('a|bad code!|2026-01-01', 'a')).toBeNull()
    expect(readReferralCookie('a|CODE|not-a-date', 'a')).toBeNull()
  })
})
