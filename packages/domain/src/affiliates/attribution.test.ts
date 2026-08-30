/**
 * Unit tests for affiliate attribution domain rules (Slice 8 §8.5, §8.6, §8.7).
 *
 * Verifies:
 * 1. Integer basis point commission math (zero float, bounds, round down).
 * 2. Self-referral detection.
 * 3. Attribution window boundaries and expiration.
 * 4. Inactive program and suspended promoter rejection paths.
 */
import { describe, expect, it } from 'vitest'

import {
  calculateCommissionMinor,
  evaluateAttribution,
  isClickWithinWindow,
  isSelfReferral,
  type EvaluateAttributionParams,
} from './attribution.js'

describe('Affiliate Attribution Domain Logic', () => {
  describe('calculateCommissionMinor', () => {
    it('calculates 20% commission (2000 bps) on ₹1,000 (100000 minor)', () => {
      const commission = calculateCommissionMinor(100000n, 2000)
      expect(commission).toBe(20000n) // ₹200.00
    })

    it('calculates 15.5% commission (1550 bps) on ₹4,999 (499900 minor)', () => {
      const commission = calculateCommissionMinor(499900n, 1550)
      expect(commission).toBe(77484n) // 77484.5 -> 77484 integer minor units
    })

    it('returns 0 for negative or zero sale amount', () => {
      expect(calculateCommissionMinor(0n, 2000)).toBe(0n)
      expect(calculateCommissionMinor(-1000n, 2000)).toBe(0n)
    })

    it('returns 0 for zero commission bps', () => {
      expect(calculateCommissionMinor(100000n, 0)).toBe(0n)
    })

    it('clamps commission between 0 and 10000 bps', () => {
      expect(calculateCommissionMinor(100000n, 15000)).toBe(100000n)
      expect(calculateCommissionMinor(100000n, -500)).toBe(0n)
    })
  })

  describe('isSelfReferral', () => {
    it('detects identical email addresses', () => {
      expect(isSelfReferral('promoter@example.com', 'promoter@example.com')).toBe(true)
    })

    it('detects case-insensitive matching emails', () => {
      expect(isSelfReferral('Promoter@Example.COM', 'promoter@example.com')).toBe(true)
      expect(isSelfReferral('  promoter@example.com  ', 'promoter@example.com')).toBe(true)
    })

    it('allows different buyer and affiliate emails', () => {
      expect(isSelfReferral('buyer@gmail.com', 'promoter@example.com')).toBe(false)
    })
  })

  describe('isClickWithinWindow', () => {
    const baseClick = new Date('2026-08-01T12:00:00Z')

    it('accepts order within 30-day window', () => {
      const order = new Date('2026-08-20T12:00:00Z') // 19 days later
      expect(isClickWithinWindow(baseClick, order, 30)).toBe(true)
    })

    it('accepts order on the exact 30th day boundary', () => {
      const order = new Date('2026-08-31T12:00:00Z') // Exactly 30 days later
      expect(isClickWithinWindow(baseClick, order, 30)).toBe(true)
    })

    it('rejects order after 30-day window expires', () => {
      const order = new Date('2026-09-01T12:00:01Z') // 31 days later
      expect(isClickWithinWindow(baseClick, order, 30)).toBe(false)
    })

    it('rejects order dated before the click', () => {
      const order = new Date('2026-07-31T12:00:00Z')
      expect(isClickWithinWindow(baseClick, order, 30)).toBe(false)
    })
  })

  describe('evaluateAttribution', () => {
    const baseParams: EvaluateAttributionParams = {
      programIsActive: true,
      allowSelfReferral: false,
      cookieWindowDays: 30,
      defaultCommissionBps: 2000,
      customCommissionBps: null,
      affiliateStatus: 'approved',
      affiliateEmail: 'promoter@example.com',
      buyerEmail: 'buyer@example.com',
      saleAmountMinor: 100000n,
      clickDate: new Date('2026-08-15T12:00:00Z'),
      orderDate: new Date('2026-08-20T12:00:00Z'),
    }

    it('approves standard attribution with default commission rate', () => {
      const decision = evaluateAttribution(baseParams)
      expect(decision.eligible).toBe(true)
      expect(decision.status).toBe('attributed')
      expect(decision.commissionBps).toBe(2000)
      expect(decision.commissionAmountMinor).toBe(20000n)
      expect(decision.rejectionReason).toBeNull()
    })

    it('applies custom commission override if set on promoter', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        customCommissionBps: 3500, // 35%
      })
      expect(decision.eligible).toBe(true)
      expect(decision.commissionBps).toBe(3500)
      expect(decision.commissionAmountMinor).toBe(35000n)
    })

    it('rejects attribution when affiliate program is disabled', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        programIsActive: false,
      })
      expect(decision.eligible).toBe(false)
      expect(decision.status).toBe('rejected_program_disabled')
      expect(decision.commissionAmountMinor).toBe(0n)
      expect(decision.rejectionReason).toContain('disabled')
    })

    it('rejects attribution when affiliate is suspended', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        affiliateStatus: 'suspended',
      })
      expect(decision.eligible).toBe(false)
      expect(decision.status).toBe('rejected_inactive')
      expect(decision.commissionAmountMinor).toBe(0n)
    })

    it('rejects self-referral when not allowed', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        buyerEmail: 'promoter@example.com',
        allowSelfReferral: false,
      })
      expect(decision.eligible).toBe(false)
      expect(decision.status).toBe('rejected_self_referral')
      expect(decision.rejectionReason).toContain('Self-referral')
    })

    it('permits self-referral if explicitly allowed by creator', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        buyerEmail: 'promoter@example.com',
        allowSelfReferral: true,
      })
      expect(decision.eligible).toBe(true)
      expect(decision.status).toBe('attributed')
    })

    it('rejects expired click outside cookie window', () => {
      const decision = evaluateAttribution({
        ...baseParams,
        clickDate: new Date('2026-06-01T12:00:00Z'),
        orderDate: new Date('2026-08-01T12:00:00Z'), // 61 days
        cookieWindowDays: 30,
      })
      expect(decision.eligible).toBe(false)
      expect(decision.status).toBe('rejected_expired')
    })
  })
})
