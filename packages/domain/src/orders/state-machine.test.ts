/**
 * Order State Machine unit tests (Slice 5 §5.3).
 *
 * Verifies:
 * 1. Order status transitions for every allowed path.
 * 2. Actor-based transition permissions and unauthorized rejection.
 * 3. Invalid order transitions and terminal state behavior.
 * 4. Payment status transitions and invalid transitions.
 * 5. State predicates: isOrderTerminal, isPaymentTerminal, isOrderPaid.
 */
import type { OrderPaymentStatus, OrderStatus } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '../result.js'
import {
  INVALID_ORDER_TRANSITION,
  INVALID_PAYMENT_TRANSITION,
  ORDER_TRANSITION_GRAPH,
  PAYMENT_STATUS_TRANSITION_GRAPH,
  UNAUTHORIZED_ORDER_TRANSITION,
  canTransitionOrderStatus,
  canTransitionPaymentStatus,
  isOrderPaid,
  isOrderTerminal,
  isPaymentTerminal,
  transitionOrderStatus,
  transitionPaymentStatus,
} from './state-machine.js'

describe('Order State Machine (§5.3)', () => {
  describe('Order Status Transitions', () => {
    it('allows valid order transitions with authorized actors', () => {
      // pending -> processing (by customer)
      const res1 = transitionOrderStatus('pending', 'processing', 'customer')
      expect(isOk(res1)).toBe(true)
      if (isOk(res1)) expect(res1.value).toBe('processing')

      // processing -> paid (by webhook)
      const res2 = transitionOrderStatus('processing', 'paid', 'webhook')
      expect(isOk(res2)).toBe(true)
      if (isOk(res2)) expect(res2.value).toBe('paid')

      // paid -> refunded (by member)
      const res3 = transitionOrderStatus('paid', 'refunded', 'member')
      expect(isOk(res3)).toBe(true)
      if (isOk(res3)) expect(res3.value).toBe('refunded')

      // failed -> pending (by customer retry)
      const res4 = transitionOrderStatus('failed', 'pending', 'customer')
      expect(isOk(res4)).toBe(true)
      if (isOk(res4)) expect(res4.value).toBe('pending')

      // pending -> cancelled (by customer)
      const res5 = transitionOrderStatus('pending', 'cancelled', 'customer')
      expect(isOk(res5)).toBe(true)
      if (isOk(res5)) expect(res5.value).toBe('cancelled')
    })

    it('rejects order transitions with unauthorized actors', () => {
      // Customer cannot mark order as paid directly from pending
      const res1 = transitionOrderStatus('pending', 'paid', 'customer')
      expect(isErr(res1)).toBe(true)
      if (isErr(res1)) {
        expect(res1.error.code).toBe(INVALID_ORDER_TRANSITION)
      }

      // Customer cannot transition from processing to paid
      const res2 = transitionOrderStatus('processing', 'paid', 'customer')
      expect(isErr(res2)).toBe(true)
      if (isErr(res2)) {
        expect(res2.error.code).toBe(UNAUTHORIZED_ORDER_TRANSITION)
      }

      // Customer cannot refund order
      const res3 = transitionOrderStatus('paid', 'refunded', 'customer')
      expect(isErr(res3)).toBe(true)
      if (isErr(res3)) {
        expect(res3.error.code).toBe(UNAUTHORIZED_ORDER_TRANSITION)
      }
    })

    it('rejects structurally invalid order transitions', () => {
      // Cannot transition from terminal states (cancelled, refunded)
      const res1 = transitionOrderStatus('cancelled', 'paid', 'system')
      expect(isErr(res1)).toBe(true)
      if (isErr(res1)) {
        expect(res1.error.code).toBe(INVALID_ORDER_TRANSITION)
      }

      const res2 = transitionOrderStatus('refunded', 'paid', 'system')
      expect(isErr(res2)).toBe(true)
      if (isErr(res2)) {
        expect(res2.error.code).toBe(INVALID_ORDER_TRANSITION)
      }

      // Cannot jump from pending directly to paid
      const res3 = transitionOrderStatus('pending', 'paid', 'system')
      expect(isErr(res3)).toBe(true)
      if (isErr(res3)) {
        expect(res3.error.code).toBe(INVALID_ORDER_TRANSITION)
      }
    })

    it('exhaustively respects ORDER_TRANSITION_GRAPH definition', () => {
      const allStatuses = Object.keys(ORDER_TRANSITION_GRAPH) as OrderStatus[]

      for (const from of allStatuses) {
        const rule = ORDER_TRANSITION_GRAPH[from]
        for (const to of allStatuses) {
          const isAllowedTarget = rule.targets.includes(to)
          if (!isAllowedTarget) {
            expect(canTransitionOrderStatus(from, to)).toBe(false)
            const result = transitionOrderStatus(from, to, 'system')
            expect(isErr(result)).toBe(true)
            if (isErr(result)) {
              expect(result.error.code).toBe(INVALID_ORDER_TRANSITION)
            }
          }
        }
      }
    })
  })

  describe('Payment Status Transitions', () => {
    it('allows valid payment status transitions', () => {
      expect(canTransitionPaymentStatus('unpaid', 'paid')).toBe(true)
      const res1 = transitionPaymentStatus('unpaid', 'paid')
      expect(isOk(res1)).toBe(true)
      if (isOk(res1)) expect(res1.value).toBe('paid')

      expect(canTransitionPaymentStatus('paid', 'refunded')).toBe(true)
      const res2 = transitionPaymentStatus('paid', 'refunded')
      expect(isOk(res2)).toBe(true)
      if (isOk(res2)) expect(res2.value).toBe('refunded')

      expect(canTransitionPaymentStatus('failed', 'unpaid')).toBe(true)
      const res3 = transitionPaymentStatus('failed', 'unpaid')
      expect(isOk(res3)).toBe(true)
      if (isOk(res3)) expect(res3.value).toBe('unpaid')
    })

    it('rejects invalid payment status transitions', () => {
      expect(canTransitionPaymentStatus('refunded', 'paid')).toBe(false)
      const res1 = transitionPaymentStatus('refunded', 'paid')
      expect(isErr(res1)).toBe(true)
      if (isErr(res1)) {
        expect(res1.error.code).toBe(INVALID_PAYMENT_TRANSITION)
      }

      expect(canTransitionPaymentStatus('refunded', 'unpaid')).toBe(false)
      const res2 = transitionPaymentStatus('refunded', 'unpaid')
      expect(isErr(res2)).toBe(true)
      if (isErr(res2)) {
        expect(res2.error.code).toBe(INVALID_PAYMENT_TRANSITION)
      }
    })

    it('exhaustively respects PAYMENT_STATUS_TRANSITION_GRAPH definition', () => {
      const allStatuses = Object.keys(PAYMENT_STATUS_TRANSITION_GRAPH) as OrderPaymentStatus[]

      for (const from of allStatuses) {
        const allowedTargets = PAYMENT_STATUS_TRANSITION_GRAPH[from]
        for (const to of allStatuses) {
          const isAllowed = allowedTargets.includes(to)
          expect(canTransitionPaymentStatus(from, to)).toBe(isAllowed)
          if (!isAllowed) {
            const res = transitionPaymentStatus(from, to)
            expect(isErr(res)).toBe(true)
            if (isErr(res)) {
              expect(res.error.code).toBe(INVALID_PAYMENT_TRANSITION)
            }
          }
        }
      }
    })
  })

  describe('Predicates', () => {
    it('identifies terminal order states correctly', () => {
      expect(isOrderTerminal('cancelled')).toBe(true)
      expect(isOrderTerminal('refunded')).toBe(true)
      expect(isOrderTerminal('pending')).toBe(false)
      expect(isOrderTerminal('requires_payment')).toBe(false)
      expect(isOrderTerminal('processing')).toBe(false)
      expect(isOrderTerminal('paid')).toBe(false)
      expect(isOrderTerminal('failed')).toBe(false)
    })

    it('identifies terminal payment states correctly', () => {
      expect(isPaymentTerminal('refunded')).toBe(true)
      expect(isPaymentTerminal('unpaid')).toBe(false)
      expect(isPaymentTerminal('authorized')).toBe(false)
      expect(isPaymentTerminal('paid')).toBe(false)
      expect(isPaymentTerminal('failed')).toBe(false)
    })

    it('identifies paid and entitlement-eligible orders correctly', () => {
      expect(isOrderPaid('paid')).toBe(true)
      expect(isOrderPaid('partially_refunded')).toBe(true)
      expect(isOrderPaid('pending')).toBe(false)
      expect(isOrderPaid('requires_payment')).toBe(false)
      expect(isOrderPaid('processing')).toBe(false)
      expect(isOrderPaid('cancelled')).toBe(false)
      expect(isOrderPaid('failed')).toBe(false)
      expect(isOrderPaid('refunded')).toBe(false)
    })
  })
})
