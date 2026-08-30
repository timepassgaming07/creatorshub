/**
 * In-memory PaymentProvider adapter (ADR-0007, ADR-0016).
 *
 * Responsibilities:
 * - Deterministic, in-memory implementation of PaymentProvider.
 * - Used for unit testing, integration suites, and conformance verification without network I/O.
 * - Supports simulated webhook emission, signature verification via HMAC-SHA256, and state transitions.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { currency, money, orderId, paymentId, type CurrencyCode } from '@creatorhub/contracts'

import {
  AccountNotReadyError,
  PaymentNotFoundError,
  WebhookSignatureVerificationError,
  type AccountStatus,
  type CheckoutSession,
  type ConnectedAccount,
  type CreateCheckoutSessionInput,
  type CreateConnectedAccountInput,
  type CreateOnboardingLinkInput,
  type CreatePayoutInput,
  type DomainPaymentEvent,
  type OnboardingLink,
  type PaymentCapturedDomainEvent,
  type PaymentFailedDomainEvent,
  type PaymentProvider,
  type PaymentSnapshot,
  type PayoutResult,
  type ProviderBalance,
  type RefundPaymentInput,
  type RefundProcessedDomainEvent,
  type RefundResult,
  type VerifiedWebhookEvent,
  type WebhookVerificationInput,
} from '../port.js'

function extractString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString()
  return fallback
}

function extractBigInt(val: unknown, fallback = 0n): bigint {
  if (typeof val === 'bigint') return val
  if (typeof val === 'number') return BigInt(val)
  if (typeof val === 'string' && /^\d+$/.test(val)) return BigInt(val)
  return fallback
}

export class MemoryPaymentProvider implements PaymentProvider {
  readonly name = 'memory'

  private readonly accounts = new Map<string, ConnectedAccount>()
  private readonly sessions = new Map<
    string,
    CheckoutSession & { readonly input: CreateCheckoutSessionInput }
  >()
  private readonly payments = new Map<string, PaymentSnapshot>()
  private readonly refunds = new Map<string, RefundResult>()
  private readonly payouts = new Map<string, PayoutResult>()

  /** Clear all in-memory state. */
  reset(): void {
    this.accounts.clear()
    this.sessions.clear()
    this.payments.clear()
    this.refunds.clear()
    this.payouts.clear()
  }

  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccount> {
    await Promise.resolve()
    const providerAccountId = `acct_mem_${randomUUID().slice(0, 12)}`
    const account: ConnectedAccount = {
      provider: 'memory',
      providerAccountId,
      workspaceId: input.workspaceId,
      country: input.country,
      email: input.email,
      businessName: input.businessName,
      status: 'active',
      payoutsEnabled: true,
      chargesEnabled: true,
    }
    this.accounts.set(providerAccountId, account)
    return account
  }

  async createOnboardingLink(input: CreateOnboardingLinkInput): Promise<OnboardingLink> {
    await Promise.resolve()
    const account = this.accounts.get(input.providerAccountId)
    if (!account) {
      throw new AccountNotReadyError(input.providerAccountId, 'disabled')
    }

    return {
      url: `https://onboarding.test/connect?account=${input.providerAccountId}&return_url=${encodeURIComponent(input.returnUrl)}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    }
  }

  async getAccountStatus(providerAccountId: string): Promise<AccountStatus> {
    await Promise.resolve()
    const account = this.accounts.get(providerAccountId)
    return account ? account.status : 'disabled'
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    await Promise.resolve()
    const sessionId = `cs_mem_${randomUUID().slice(0, 12)}`
    const session: CheckoutSession = {
      id: sessionId,
      provider: 'memory',
      orderId: input.orderId,
      checkoutUrl: `https://checkout.test/pay/${sessionId}`,
      clientSecret: `secret_${sessionId}`,
      amount: input.totalAmount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 1800 * 1000),
    }

    this.sessions.set(sessionId, { ...session, input })
    return session
  }

  async getPayment(providerPaymentId: string): Promise<PaymentSnapshot> {
    await Promise.resolve()
    const payment = this.payments.get(providerPaymentId)
    if (!payment) {
      throw new PaymentNotFoundError(providerPaymentId)
    }
    return payment
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    await Promise.resolve()
    const payment = this.payments.get(input.providerPaymentId)
    if (!payment) {
      throw new PaymentNotFoundError(input.providerPaymentId)
    }

    const providerRefundId = `rf_mem_${randomUUID().slice(0, 12)}`
    const refund: RefundResult = {
      refundId: input.refundId,
      providerRefundId,
      amount: input.amount,
      status: 'processed',
      processedAt: new Date(),
    }

    this.refunds.set(providerRefundId, refund)

    // Update payment state
    const updatedPayment: PaymentSnapshot = {
      ...payment,
      status: 'refunded',
    }
    this.payments.set(input.providerPaymentId, updatedPayment)

    return refund
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    await Promise.resolve()
    const providerPayoutId = `pout_mem_${randomUUID().slice(0, 12)}`
    const payout: PayoutResult = {
      providerPayoutId,
      amount: input.amount,
      status: 'paid',
      fee: money(0n, input.currency),
      estimatedArrival: new Date(),
    }
    this.payouts.set(providerPayoutId, payout)
    return payout
  }

  async getBalance(_providerAccountId: string): Promise<ProviderBalance> {
    await Promise.resolve()
    const curr: CurrencyCode = currency('INR')
    return {
      currency: curr,
      available: money(10000000n, curr),
      pending: money(0n, curr),
    }
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhookEvent> {
    await Promise.resolve()
    const rawString =
      typeof input.rawPayload === 'string' ? input.rawPayload : input.rawPayload.toString('utf8')
    const expectedSig = createHmac('sha256', input.secret).update(rawString).digest('hex')

    if (input.signature !== expectedSig) {
      throw new WebhookSignatureVerificationError('Webhook signature does not match computed HMAC.')
    }

    const parsed = JSON.parse(rawString) as {
      id?: string
      event?: string
      type?: string
      created_at?: number
      payload?: Record<string, unknown>
    }

    return {
      id: parsed.id ?? `evt_mem_${randomUUID().slice(0, 8)}`,
      provider: 'memory',
      eventType: parsed.event ?? parsed.type ?? 'unknown',
      payload: parsed.payload ?? parsed,
      createdAt: parsed.created_at ? new Date(parsed.created_at * 1000) : new Date(),
    }
  }

  toDomainEvent(event: VerifiedWebhookEvent): DomainPaymentEvent | null {
    const payload = event.payload

    if (event.eventType === 'payment.captured' || event.eventType === 'order.paid') {
      const paymentWrapper =
        typeof payload['payment'] === 'object' && payload['payment'] !== null
          ? (payload['payment'] as Record<string, unknown>)
          : payload
      const p =
        typeof paymentWrapper['entity'] === 'object' && paymentWrapper['entity'] !== null
          ? (paymentWrapper['entity'] as Record<string, unknown>)
          : paymentWrapper
      const notes =
        typeof p['notes'] === 'object' && p['notes'] !== null
          ? (p['notes'] as Record<string, unknown>)
          : {}

      const oId = extractString(
        notes['order_id'] ??
          notes['orderId'] ??
          p['orderId'] ??
          p['order_id'] ??
          p['notes_order_id'] ??
          payload['orderId'],
      )
      const amt = extractBigInt(p['amount'] ?? payload['amount'])
      const curr = currency(extractString(p['currency'] ?? payload['currency'], 'INR'))

      const capturedEvent: PaymentCapturedDomainEvent = {
        type: 'payment.captured',
        provider: 'memory',
        providerEventId: event.id,
        providerPaymentId: extractString(p['id'], `pay_${randomUUID().slice(0, 8)}`),
        orderId: orderId(oId),
        amount: money(amt, curr),
        method: extractString(p['method'], 'card'),
        occurredAt: event.createdAt,
      }
      return capturedEvent
    }

    if (event.eventType === 'payment.failed') {
      const paymentWrapper =
        typeof payload['payment'] === 'object' && payload['payment'] !== null
          ? (payload['payment'] as Record<string, unknown>)
          : payload
      const p =
        typeof paymentWrapper['entity'] === 'object' && paymentWrapper['entity'] !== null
          ? (paymentWrapper['entity'] as Record<string, unknown>)
          : paymentWrapper
      const notes =
        typeof p['notes'] === 'object' && p['notes'] !== null
          ? (p['notes'] as Record<string, unknown>)
          : {}

      const oId = extractString(
        notes['order_id'] ??
          notes['orderId'] ??
          p['orderId'] ??
          p['order_id'] ??
          p['notes_order_id'] ??
          payload['orderId'],
      )
      const amt = extractBigInt(p['amount'] ?? payload['amount'])
      const curr = currency(extractString(p['currency'] ?? payload['currency'], 'INR'))

      const failedEvent: PaymentFailedDomainEvent = {
        type: 'payment.failed',
        provider: 'memory',
        providerEventId: event.id,
        providerPaymentId: extractString(p['id'], `pay_${randomUUID().slice(0, 8)}`),
        orderId: orderId(oId),
        amount: money(amt, curr),
        reason: extractString(p['error_description'] ?? p['reason'], 'Payment failed'),
        occurredAt: event.createdAt,
      }
      return failedEvent
    }

    if (event.eventType === 'refund.processed') {
      const refundWrapper =
        typeof payload['refund'] === 'object' && payload['refund'] !== null
          ? (payload['refund'] as Record<string, unknown>)
          : payload
      const r =
        typeof refundWrapper['entity'] === 'object' && refundWrapper['entity'] !== null
          ? (refundWrapper['entity'] as Record<string, unknown>)
          : refundWrapper
      const notes =
        typeof r['notes'] === 'object' && r['notes'] !== null
          ? (r['notes'] as Record<string, unknown>)
          : {}

      const oId = extractString(
        notes['order_id'] ??
          notes['orderId'] ??
          r['orderId'] ??
          r['order_id'] ??
          r['notes_order_id'] ??
          payload['orderId'],
      )
      const amt = extractBigInt(r['amount'] ?? payload['amount'])
      const curr = currency(extractString(r['currency'] ?? payload['currency'], 'INR'))

      const refundEvent: RefundProcessedDomainEvent = {
        type: 'refund.processed',
        provider: 'memory',
        providerEventId: event.id,
        providerRefundId: extractString(r['id'], `rf_${randomUUID().slice(0, 8)}`),
        providerPaymentId: extractString(r['payment_id'], `pay_${randomUUID().slice(0, 8)}`),
        orderId: orderId(oId),
        amount: money(amt, curr),
        occurredAt: event.createdAt,
      }
      return refundEvent
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Test Harness Helpers
  // ---------------------------------------------------------------------------

  simulatePaymentCapture(
    sessionId: string,
    opts: {
      providerPaymentId?: string
      method?: string
    } = {},
  ): PaymentSnapshot {
    const sessionRecord = this.sessions.get(sessionId)
    if (!sessionRecord) {
      throw new PaymentNotFoundError(sessionId)
    }

    const provPayId = opts.providerPaymentId ?? `pay_mem_${randomUUID().slice(0, 12)}`
    const pId = paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000001')

    const payment: PaymentSnapshot = {
      id: pId,
      provider: 'memory',
      providerPaymentId: provPayId,
      orderId: sessionRecord.orderId,
      amount: sessionRecord.amount,
      status: 'captured',
      method: opts.method ?? 'upi',
      capturedAt: new Date(),
      ...(sessionRecord.input.splitTransfers
        ? { splitTransfers: sessionRecord.input.splitTransfers }
        : {}),
    }

    this.payments.set(provPayId, payment)
    return payment
  }

  simulatePaymentFailure(sessionId: string, reason = 'Insufficient funds'): PaymentSnapshot {
    const sessionRecord = this.sessions.get(sessionId)
    if (!sessionRecord) {
      throw new PaymentNotFoundError(sessionId)
    }

    const provPayId = `pay_mem_${randomUUID().slice(0, 12)}`
    const pId = paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000002')

    const payment: PaymentSnapshot = {
      id: pId,
      provider: 'memory',
      providerPaymentId: provPayId,
      orderId: sessionRecord.orderId,
      amount: sessionRecord.amount,
      status: 'failed',
      method: 'card',
      capturedAt: null,
      failureReason: reason,
    }

    this.payments.set(provPayId, payment)
    return payment
  }

  generateSignedWebhook(
    eventType: string,
    payload: Record<string, unknown>,
    secret: string,
  ): { rawPayload: string; signature: string } {
    const rawPayload = JSON.stringify({
      id: `evt_mem_${randomUUID().slice(0, 8)}`,
      event: eventType,
      created_at: Math.floor(Date.now() / 1000),
      payload,
    })

    const signature = createHmac('sha256', secret).update(rawPayload).digest('hex')
    return { rawPayload, signature }
  }
}
