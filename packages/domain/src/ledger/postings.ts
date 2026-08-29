/**
 * Standard financial posting constructors (ADR-0008).
 *
 * Responsibilities: build perfectly balanced transaction proposals that satisfy
 * double-entry invariants and double-entry conservation laws.
 *
 * Dependencies: @creatorhub/contracts, ./invariants.js, ../result.js.
 */
import {
  type CurrencyCode,
  type LedgerAccountId,
  type LedgerEntryProposal,
  type Money,
  type PostTransactionInput,
  type WorkspaceId,
  add,
  isPositive,
  money,
  subtract,
} from '@creatorhub/contracts'

import { domainError, err, ok, type Result } from '../result.js'
import { validateBalancedTransaction } from './invariants.js'

export type OrderPaymentPostingParams = {
  readonly workspaceId: WorkspaceId
  readonly orderId: string
  readonly idempotencyKey: string
  readonly currency: CurrencyCode
  readonly grossAmount: Money
  readonly taxAmount?: Money
  readonly platformFee: Money
  readonly affiliateCommission?: Money
  readonly accounts: {
    readonly processorClearingAccountId: LedgerAccountId
    readonly creatorPayableAccountId: LedgerAccountId
    readonly platformRevenueAccountId: LedgerAccountId
    readonly taxPayableAccountId?: LedgerAccountId
    readonly affiliatePayableAccountId?: LedgerAccountId
  }
}

export function createOrderPaymentPosting(
  params: OrderPaymentPostingParams,
): Result<PostTransactionInput> {
  const { grossAmount, currency: code } = params

  if (!isPositive(grossAmount)) {
    return err(
      domainError({
        code: 'INVALID_AMOUNT',
        title: 'Invalid order amount',
        detail: 'Gross order payment amount must be positive.',
        action: 'Provide a positive gross order amount.',
      }),
    )
  }

  const tax = params.taxAmount ?? money(0n, code)
  const platformFee = params.platformFee
  const affiliateComm = params.affiliateCommission ?? money(0n, code)

  const nonCreatorDeductions = add(add(tax, platformFee), affiliateComm)
  const creatorPayout = subtract(grossAmount, nonCreatorDeductions)

  if (creatorPayout.amount < 0n) {
    return err(
      domainError({
        code: 'INVALID_SPLIT',
        title: 'Invalid payment split',
        detail:
          'Sum of tax, platform fee, and affiliate commission exceeds total gross payment amount.',
        action: 'Ensure deductions do not exceed the total gross order amount.',
      }),
    )
  }

  const entries: LedgerEntryProposal[] = [
    {
      accountId: params.accounts.processorClearingAccountId,
      direction: 'debit',
      amount: grossAmount.amount,
      currency: code,
    },
    {
      accountId: params.accounts.creatorPayableAccountId,
      direction: 'credit',
      amount: creatorPayout.amount,
      currency: code,
    },
    {
      accountId: params.accounts.platformRevenueAccountId,
      direction: 'credit',
      amount: platformFee.amount,
      currency: code,
    },
  ]

  if (isPositive(tax) && params.accounts.taxPayableAccountId) {
    entries.push({
      accountId: params.accounts.taxPayableAccountId,
      direction: 'credit',
      amount: tax.amount,
      currency: code,
    })
  }

  if (isPositive(affiliateComm) && params.accounts.affiliatePayableAccountId) {
    entries.push({
      accountId: params.accounts.affiliatePayableAccountId,
      direction: 'credit',
      amount: affiliateComm.amount,
      currency: code,
    })
  }

  // Filter out any zero-amount entries
  const validEntries = entries.filter((e) => e.amount > 0n)

  const validation = validateBalancedTransaction(validEntries)
  if (!validation.ok) {
    return validation
  }

  return ok({
    workspaceId: params.workspaceId,
    kind: 'order_payment',
    referenceType: 'order',
    referenceId: params.orderId,
    idempotencyKey: params.idempotencyKey,
    description: `Order payment for order ${params.orderId}`,
    entries: validEntries,
  })
}

export type RefundPostingParams = {
  readonly workspaceId: WorkspaceId
  readonly orderId: string
  readonly refundId: string
  readonly idempotencyKey: string
  readonly currency: CurrencyCode
  readonly grossRefundAmount: Money
  readonly taxRefundAmount?: Money
  readonly platformFeeRefundAmount?: Money
  readonly affiliateClawbackAmount?: Money
  readonly accounts: {
    readonly processorClearingAccountId: LedgerAccountId
    readonly creatorPayableAccountId: LedgerAccountId
    readonly platformRevenueAccountId?: LedgerAccountId
    readonly taxPayableAccountId?: LedgerAccountId
    readonly affiliatePayableAccountId?: LedgerAccountId
  }
}

export function createRefundPosting(params: RefundPostingParams): Result<PostTransactionInput> {
  const { grossRefundAmount, currency: code } = params

  if (!isPositive(grossRefundAmount)) {
    return err(
      domainError({
        code: 'INVALID_AMOUNT',
        title: 'Invalid refund amount',
        detail: 'Refund amount must be strictly positive.',
        action: 'Provide a positive refund amount.',
      }),
    )
  }

  const taxRefund = params.taxRefundAmount ?? money(0n, code)
  const platformFeeRefund = params.platformFeeRefundAmount ?? money(0n, code)
  const affiliateClawback = params.affiliateClawbackAmount ?? money(0n, code)

  const nonCreatorDeductions = add(add(taxRefund, platformFeeRefund), affiliateClawback)
  const creatorDeduction = subtract(grossRefundAmount, nonCreatorDeductions)

  if (creatorDeduction.amount < 0n) {
    return err(
      domainError({
        code: 'INVALID_SPLIT',
        title: 'Invalid refund split',
        detail:
          'Sum of tax refund, platform fee refund, and affiliate clawback exceeds total refund amount.',
        action: 'Ensure refund portions do not exceed the total refund amount.',
      }),
    )
  }

  const entries: LedgerEntryProposal[] = [
    // Credit processor clearing (cash outflow for refund)
    {
      accountId: params.accounts.processorClearingAccountId,
      direction: 'credit',
      amount: grossRefundAmount.amount,
      currency: code,
    },
  ]

  if (isPositive(creatorDeduction)) {
    entries.push({
      accountId: params.accounts.creatorPayableAccountId,
      direction: 'debit',
      amount: creatorDeduction.amount,
      currency: code,
    })
  }

  if (isPositive(taxRefund) && params.accounts.taxPayableAccountId) {
    entries.push({
      accountId: params.accounts.taxPayableAccountId,
      direction: 'debit',
      amount: taxRefund.amount,
      currency: code,
    })
  }

  if (isPositive(platformFeeRefund) && params.accounts.platformRevenueAccountId) {
    entries.push({
      accountId: params.accounts.platformRevenueAccountId,
      direction: 'debit',
      amount: platformFeeRefund.amount,
      currency: code,
    })
  }

  if (isPositive(affiliateClawback) && params.accounts.affiliatePayableAccountId) {
    entries.push({
      accountId: params.accounts.affiliatePayableAccountId,
      direction: 'debit',
      amount: affiliateClawback.amount,
      currency: code,
    })
  }

  const validEntries = entries.filter((e) => e.amount > 0n)

  const validation = validateBalancedTransaction(validEntries)
  if (!validation.ok) {
    return validation
  }

  return ok({
    workspaceId: params.workspaceId,
    kind: 'refund',
    referenceType: 'refund',
    referenceId: params.refundId,
    idempotencyKey: params.idempotencyKey,
    description: `Refund ${params.refundId} for order ${params.orderId}`,
    entries: validEntries,
  })
}

export type PayoutPostingParams = {
  readonly workspaceId: WorkspaceId
  readonly payoutId: string
  readonly idempotencyKey: string
  readonly currency: CurrencyCode
  readonly amount: Money
  readonly accounts: {
    readonly payableAccountId: LedgerAccountId
    readonly processorClearingAccountId: LedgerAccountId
  }
}

export function createPayoutPosting(params: PayoutPostingParams): Result<PostTransactionInput> {
  const { amount, currency: code } = params

  if (!isPositive(amount)) {
    return err(
      domainError({
        code: 'INVALID_AMOUNT',
        title: 'Invalid payout amount',
        detail: 'Payout amount must be positive.',
        action: 'Provide a positive payout amount.',
      }),
    )
  }

  const entries: LedgerEntryProposal[] = [
    {
      accountId: params.accounts.payableAccountId,
      direction: 'debit',
      amount: amount.amount,
      currency: code,
    },
    {
      accountId: params.accounts.processorClearingAccountId,
      direction: 'credit',
      amount: amount.amount,
      currency: code,
    },
  ]

  const validation = validateBalancedTransaction(entries)
  if (!validation.ok) {
    return validation
  }

  return ok({
    workspaceId: params.workspaceId,
    kind: 'payout',
    referenceType: 'payout',
    referenceId: params.payoutId,
    idempotencyKey: params.idempotencyKey,
    description: `Payout ${params.payoutId}`,
    entries,
  })
}
