import { describe, expect, it } from 'vitest'

import {
  AccountNotReadyError,
  PaymentDeclinedError,
  PaymentNotFoundError,
  PaymentProviderError,
  WebhookSignatureVerificationError,
} from './port.js'

describe('Payment Provider Port Errors', () => {
  it('instantiates PaymentProviderError with correct properties', () => {
    const err = new PaymentProviderError('Gateway timeout', 'GATEWAY_TIMEOUT', true)
    expect(err.name).toBe('PaymentProviderError')
    expect(err.message).toBe('Gateway timeout')
    expect(err.code).toBe('GATEWAY_TIMEOUT')
    expect(err.retryable).toBe(true)
  })

  it('instantiates WebhookSignatureVerificationError', () => {
    const err = new WebhookSignatureVerificationError()
    expect(err.name).toBe('WebhookSignatureVerificationError')
    expect(err.code).toBe('WEBHOOK_SIGNATURE_INVALID')
    expect(err.retryable).toBe(false)
  })

  it('instantiates PaymentDeclinedError with decline code', () => {
    const err = new PaymentDeclinedError('Insufficient funds', 'insufficient_funds')
    expect(err.name).toBe('PaymentDeclinedError')
    expect(err.code).toBe('PAYMENT_DECLINED')
    expect(err.declineCode).toBe('insufficient_funds')
  })

  it('instantiates PaymentNotFoundError', () => {
    const err = new PaymentNotFoundError('pay_123')
    expect(err.name).toBe('PaymentNotFoundError')
    expect(err.message).toContain('pay_123')
    expect(err.code).toBe('PAYMENT_NOT_FOUND')
  })

  it('instantiates AccountNotReadyError', () => {
    const err = new AccountNotReadyError('acct_456', 'restricted')
    expect(err.name).toBe('AccountNotReadyError')
    expect(err.message).toContain('restricted')
    expect(err.code).toBe('ACCOUNT_NOT_READY')
  })
})
