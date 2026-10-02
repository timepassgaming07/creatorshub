import { currency, money, userId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '../result.js'
import {
  MAX_SELF_APPROVAL_THRESHOLD_PAISE,
  canTransitionPayout,
  isPayoutTerminal,
  transitionPayout,
  validateMakerCheckerApproval,
} from './state-machine.js'

const USER_A = userId('019fc72a-0000-7000-8000-000000000001')
const USER_B = userId('019fc72a-0000-7000-8000-000000000002')

describe('payout state machine transitions', () => {
  it('allows valid transitions', () => {
    expect(canTransitionPayout('requested', 'approved')).toBe(true)
    expect(canTransitionPayout('requested', 'failed')).toBe(true)
    expect(canTransitionPayout('approved', 'processing')).toBe(true)
    expect(canTransitionPayout('processing', 'paid')).toBe(true)
    expect(canTransitionPayout('processing', 'failed')).toBe(true)
    expect(canTransitionPayout('paid', 'reversed')).toBe(true)
  })

  it('rejects invalid state transitions', () => {
    expect(canTransitionPayout('requested', 'paid')).toBe(false)
    expect(canTransitionPayout('requested', 'reversed')).toBe(false)
    expect(canTransitionPayout('paid', 'processing')).toBe(false)
    expect(canTransitionPayout('failed', 'approved')).toBe(false)
    expect(canTransitionPayout('reversed', 'paid')).toBe(false)

    const result = transitionPayout('requested', 'paid')
    expect(isErr(result)).toBe(true)
  })

  it('identifies terminal payout states', () => {
    expect(isPayoutTerminal('paid')).toBe(true)
    expect(isPayoutTerminal('failed')).toBe(true)
    expect(isPayoutTerminal('reversed')).toBe(true)
    expect(isPayoutTerminal('requested')).toBe(false)
    expect(isPayoutTerminal('approved')).toBe(false)
    expect(isPayoutTerminal('processing')).toBe(false)
  })
})

describe('validateMakerCheckerApproval (Two-Person Rule)', () => {
  it('rejects approval by regular members', () => {
    const result = validateMakerCheckerApproval({
      requestedBy: USER_A,
      approvedBy: USER_B,
      approverRole: 'member',
      amount: money(100_000n, currency('INR')),
      totalWorkspaceMembers: 2,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('FORBIDDEN')
    }
  })

  it('rejects self-approval in multi-member workspace', () => {
    const result = validateMakerCheckerApproval({
      requestedBy: USER_A,
      approvedBy: USER_A, // Maker is Checker
      approverRole: 'owner',
      amount: money(100_000n, currency('INR')),
      totalWorkspaceMembers: 2,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT_OF_INTEREST')
    }
  })

  it('permits distinct admin/owner approving maker request', () => {
    const result = validateMakerCheckerApproval({
      requestedBy: USER_A,
      approvedBy: USER_B,
      approverRole: 'admin',
      amount: money(100_000n, currency('INR')),
      totalWorkspaceMembers: 2,
    })

    expect(isOk(result)).toBe(true)
  })

  it('permits solo creator self-approval below threshold', () => {
    const result = validateMakerCheckerApproval({
      requestedBy: USER_A,
      approvedBy: USER_A,
      approverRole: 'owner',
      amount: money(MAX_SELF_APPROVAL_THRESHOLD_PAISE, currency('INR')),
      totalWorkspaceMembers: 1,
    })

    expect(isOk(result)).toBe(true)
  })

  it('rejects solo creator self-approval exceeding safety threshold', () => {
    const result = validateMakerCheckerApproval({
      requestedBy: USER_A,
      approvedBy: USER_A,
      approverRole: 'owner',
      amount: money(MAX_SELF_APPROVAL_THRESHOLD_PAISE + 100n, currency('INR')),
      totalWorkspaceMembers: 1,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('APPROVAL_THRESHOLD_EXCEEDED')
    }
  })
})
