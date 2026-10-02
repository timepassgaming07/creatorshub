/**
 * Commission State Machine Domain Unit Tests (Slice 9 §9.1, §9.3, §9.5, §9.7).
 */
import { describe, expect, it } from 'vitest'

import {
  calculateClawbackMinor,
  calculateHeldUntil,
  canVestCommission,
  evaluateClawback,
  isValidCommissionStatusTransition,
} from './state-machine.js'

describe('Commission State Machine & Invariants (Slice 9)', () => {
  describe('calculateHeldUntil (§9.3 hold constraint)', () => {
    it('enforces hold period is at least the refund window', () => {
      const orderDate = new Date('2026-08-01T00:00:00.000Z')

      // Case 1: holdPeriod (30 days) > refundWindow (14 days) -> 30 days
      const result1 = calculateHeldUntil(orderDate, 30, 14)
      expect(result1.toISOString()).toBe('2026-08-31T00:00:00.000Z')

      // Case 2: holdPeriod (7 days) < refundWindow (14 days) -> clamped to 14 days
      const result2 = calculateHeldUntil(orderDate, 7, 14)
      expect(result2.toISOString()).toBe('2026-08-15T00:00:00.000Z')

      // Case 3: holdPeriod (0 days) < refundWindow (30 days) -> clamped to 30 days
      const result3 = calculateHeldUntil(orderDate, 0, 30)
      expect(result3.toISOString()).toBe('2026-08-31T00:00:00.000Z')
    })
  })

  describe('isValidCommissionStatusTransition', () => {
    it('allows valid lifecycle transitions', () => {
      expect(isValidCommissionStatusTransition('pending', 'held')).toBe(true)
      expect(isValidCommissionStatusTransition('held', 'vested')).toBe(true)
      expect(isValidCommissionStatusTransition('vested', 'paid')).toBe(true)
      expect(isValidCommissionStatusTransition('held', 'clawed_back')).toBe(true)
      expect(isValidCommissionStatusTransition('vested', 'clawed_back')).toBe(true)
      expect(isValidCommissionStatusTransition('paid', 'clawed_back')).toBe(true)
    })

    it('rejects invalid backwards transitions', () => {
      expect(isValidCommissionStatusTransition('vested', 'held')).toBe(false)
      expect(isValidCommissionStatusTransition('paid', 'vested')).toBe(false)
      expect(isValidCommissionStatusTransition('clawed_back', 'held')).toBe(false)
      expect(isValidCommissionStatusTransition('clawed_back', 'vested')).toBe(false)
    })
  })

  describe('canVestCommission', () => {
    it('returns true only if status is held and current date is past heldUntil', () => {
      const heldUntil = new Date('2026-08-15T00:00:00.000Z')

      // Before hold expiration -> false
      expect(
        canVestCommission(
          { status: 'held', heldUntil },
          new Date('2026-08-14T23:59:59.000Z'),
        ),
      ).toBe(false)

      // Exactly at hold expiration -> true
      expect(
        canVestCommission(
          { status: 'held', heldUntil },
          new Date('2026-08-15T00:00:00.000Z'),
        ),
      ).toBe(true)

      // Past hold expiration -> true
      expect(
        canVestCommission(
          { status: 'held', heldUntil },
          new Date('2026-08-20T00:00:00.000Z'),
        ),
      ).toBe(true)

      // Wrong status -> false even if time has passed
      expect(
        canVestCommission(
          { status: 'pending', heldUntil },
          new Date('2026-08-20T00:00:00.000Z'),
        ),
      ).toBe(false)
    })
  })

  describe('calculateClawbackMinor (§9.5, §9.7)', () => {
    it('calculates full clawback when full order amount is refunded', () => {
      const clawback = calculateClawbackMinor({
        grossCommissionMinor: 20000n, // ₹200.00
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n, // ₹1,000.00
        refundAmountMinor: 100000n, // ₹1,000.00 full refund
      })
      expect(clawback).toBe(20000n)
    })

    it('pro-rates clawback on 50% partial refund', () => {
      const clawback = calculateClawbackMinor({
        grossCommissionMinor: 20000n, // 20% on ₹1,000 = ₹200.00
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n, // ₹1,000.00
        refundAmountMinor: 50000n, // ₹500.00 refund (50%)
      })
      // 50% of ₹200.00 = ₹100.00 (10000n)
      expect(clawback).toBe(10000n)
    })

    it('bounds clawback by remaining net commission on consecutive partial refunds', () => {
      // First refund of 70%
      const firstClawback = calculateClawbackMinor({
        grossCommissionMinor: 20000n,
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 70000n, // 70% -> ₹140.00
      })
      expect(firstClawback).toBe(14000n)

      // Remaining net = 6000n
      // Second refund of remaining 30% (30000n) -> should claw back exactly remaining 6000n
      const secondClawback = calculateClawbackMinor({
        grossCommissionMinor: 20000n,
        netCommissionMinor: 6000n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 30000n,
      })
      expect(secondClawback).toBe(6000n)
    })
  })

  describe('evaluateClawback', () => {
    it('successfully evaluates full refund clawback and transitions to clawed_back', () => {
      const res = evaluateClawback({
        currentStatus: 'held',
        grossCommissionMinor: 20000n,
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 100000n,
      })

      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.value.clawbackAmountMinor).toBe(20000n)
        expect(res.value.nextNetAmountMinor).toBe(0n)
        expect(res.value.nextStatus).toBe('clawed_back')
        expect(res.value.clawbackStatus).toBe('applied')
      }
    })

    it('evaluates partial refund clawback and preserves held status if net > 0', () => {
      const res = evaluateClawback({
        currentStatus: 'held',
        grossCommissionMinor: 20000n,
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 25000n, // 25% refund
      })

      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.value.clawbackAmountMinor).toBe(5000n) // ₹50.00
        expect(res.value.nextNetAmountMinor).toBe(15000n) // ₹150.00 remaining
        expect(res.value.nextStatus).toBe('held')
        expect(res.value.clawbackStatus).toBe('applied')
      }
    })

    it('flags clawback as uncollectable when commission was already paid out', () => {
      const res = evaluateClawback({
        currentStatus: 'paid',
        grossCommissionMinor: 20000n,
        netCommissionMinor: 20000n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 100000n,
      })

      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.value.clawbackStatus).toBe('uncollectable')
      }
    })

    it('rejects clawback on already clawed back commission', () => {
      const res = evaluateClawback({
        currentStatus: 'clawed_back',
        grossCommissionMinor: 20000n,
        netCommissionMinor: 0n,
        orderSubtotalMinor: 100000n,
        refundAmountMinor: 50000n,
      })

      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error.code).toBe('COMMISSION_ALREADY_CLAWED_BACK')
      }
    })
  })
})
