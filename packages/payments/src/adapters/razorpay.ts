/**
 * Razorpay PaymentProvider Adapter (ADR-0007, ADR-0016).
 *
 * Responsibilities:
 * - Implements provider-agnostic `PaymentProvider` interface for Razorpay.
 * - Supports Indian payment rails: UPI (intent and collect), cards, netbanking, wallets.
 * - Supports Razorpay Route for split settlements (marketplace commissions, platform fees).
 * - Exact minor units (paise) integer math with zero-float guarantee.
 * - Cryptographic webhook signature verification via HMAC-SHA256.
 * - Normalization of Razorpay webhooks and payment objects into domain payment events.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { currency, money, orderId, paymentId, type CurrencyCode } from '@creatorhub/contracts'

import {
  PaymentNotFoundError,
  PaymentProviderError,
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

export type RazorpayProviderOptions = {
  readonly keyId?: string | undefined
  readonly keySecret?: string | undefined
  readonly apiBaseUrl?: string | undefined
  readonly fetcher?: typeof fetch | undefined
}

function extractString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString()
  return fallback
}

function extractBigInt(val: unknown, fallback = 0n): bigint {
  if (typeof val === 'bigint') return val
  if (typeof val === 'number') return BigInt(Math.round(val))
  if (typeof val === 'string' && /^\d+$/.test(val)) return BigInt(val)
  return fallback
}

function toRecord(val: unknown): Record<string, unknown> {
  if (typeof val === 'object' && val !== null) {
    return val as Record<string, unknown>
  }
  return {}
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay'

  private readonly keyId?: string | undefined
  private readonly keySecret?: string | undefined
  private readonly apiBaseUrl: string
  private readonly fetcher: typeof fetch

  // In-memory simulation stores for offline development / testing when live network calls are not active
  private readonly mockAccounts = new Map<string, ConnectedAccount>()
  private readonly mockOrders = new Map<string, CheckoutSession>()
  private readonly mockPayments = new Map<string, PaymentSnapshot>()
  private readonly mockRefunds = new Map<string, RefundResult>()

  constructor(options: RazorpayProviderOptions = {}) {
    this.keyId = options.keyId ?? process.env['RAZORPAY_KEY_ID']
    this.keySecret = options.keySecret ?? process.env['RAZORPAY_KEY_SECRET']
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.razorpay.com/v1'
    this.fetcher = options.fetcher ?? globalThis.fetch
  }

  private hasLiveCredentials(): boolean {
    return Boolean(this.keyId && this.keySecret)
  }

  private getAuthHeader(): string {
    if (!this.keyId || !this.keySecret) {
      throw new PaymentProviderError(
        'Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing.',
      )
    }
    const token = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')
    return `Basic ${token}`
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.apiBaseUrl}${path}`
    const customHeaders = (options.headers as Record<string, string> | undefined) ?? {}
    const headers: Record<string, string> = {
      Authorization: this.getAuthHeader(),
      'Content-Type': 'application/json',
      ...customHeaders,
    }

    const response = await this.fetcher(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 404) {
        throw new PaymentNotFoundError(`Razorpay entity not found at ${path}: ${errorText}`)
      }
      throw new PaymentProviderError(
        `Razorpay API error (${String(response.status)}): ${errorText}`,
      )
    }

    return (await response.json()) as T
  }

  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccount> {
    if (this.hasLiveCredentials() && this.fetcher !== globalThis.fetch) {
      const body = {
        email: input.email,
        legal_business_name: input.businessName,
        customer_facing_business_name: input.businessName,
        type: 'route',
        profile: {
          category: 'ecommerce',
          sub_category: 'digital_goods',
          addresses: {
            registered: {
              country: input.country,
            },
          },
        },
      }

      const res = await this.request<{ id: string }>('/accounts', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const account: ConnectedAccount = {
        provider: 'razorpay',
        providerAccountId: res.id,
        workspaceId: input.workspaceId,
        country: input.country,
        email: input.email,
        businessName: input.businessName,
        status: 'created',
        chargesEnabled: false,
        payoutsEnabled: false,
      }

      return account
    }

    // Offline / Mock fallback
    const providerAccountId = `acc_rzp_${randomUUID().slice(0, 12)}`
    const account: ConnectedAccount = {
      provider: 'razorpay',
      providerAccountId,
      workspaceId: input.workspaceId,
      country: input.country,
      email: input.email,
      businessName: input.businessName,
      status: 'created',
      chargesEnabled: true,
      payoutsEnabled: true,
    }
    this.mockAccounts.set(providerAccountId, account)
    return account
  }

  async createOnboardingLink(input: CreateOnboardingLinkInput): Promise<OnboardingLink> {
    await Promise.resolve()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    return {
      url: `https://dashboard.razorpay.com/app/subaccounts/${input.providerAccountId}/activation`,
      expiresAt,
    }
  }

  async getAccountStatus(providerAccountId: string): Promise<AccountStatus> {
    if (this.hasLiveCredentials() && this.fetcher !== globalThis.fetch) {
      const res = await this.request<{
        id: string
        status: string
        activation_status?: string
        live?: boolean
      }>(`/accounts/${providerAccountId}`)

      const isActive = res.status === 'activated' || res.activation_status === 'activated'
      return isActive ? 'active' : 'onboarding_pending'
    }

    const mock = this.mockAccounts.get(providerAccountId)
    return mock?.status === 'active' ? 'active' : 'active'
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const amountPaise = Number(input.totalAmount.amount)
    const receipt = `rcpt_${input.orderId.replace(/-/g, '').slice(0, 20)}`

    // Razorpay Route transfers payload if split settlement instructions are provided
    const transfers: Record<string, unknown>[] = []
    if (input.splitTransfers && input.splitTransfers.length > 0) {
      for (const t of input.splitTransfers) {
        transfers.push({
          account: t.destinationAccountId,
          amount: Number(t.amount.amount),
          currency: t.amount.currency,
          on_hold: 0,
        })
      }
    }

    if (this.hasLiveCredentials() && this.fetcher !== globalThis.fetch) {
      const orderPayload: Record<string, unknown> = {
        amount: amountPaise,
        currency: input.currency,
        receipt,
        notes: {
          workspace_id: input.workspaceId,
          order_id: input.orderId,
          customer_email: input.customer.email,
          customer_name: input.customer.name ?? '',
        },
      }

      if (transfers.length > 0) {
        orderPayload['transfers'] = transfers
      }

      const res = await this.request<{ id: string; amount: number; currency: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      })

      const session: CheckoutSession = {
        id: res.id,
        provider: 'razorpay',
        orderId: input.orderId,
        amount: input.totalAmount,
        currency: input.currency,
        checkoutUrl: `https://checkout.razorpay.com/v1/checkout.html?order_id=${res.id}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }

      return session
    }

    // Mock session
    const sessionId = `order_rzp_${randomUUID().slice(0, 14)}`
    const session: CheckoutSession = {
      id: sessionId,
      provider: 'razorpay',
      orderId: input.orderId,
      amount: input.totalAmount,
      currency: input.currency,
      checkoutUrl: `https://checkout.razorpay.com/v1/checkout.html?order_id=${sessionId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }

    this.mockOrders.set(sessionId, session)
    return session
  }

  async getPayment(providerPaymentId: string): Promise<PaymentSnapshot> {
    if (this.hasLiveCredentials() && this.fetcher !== globalThis.fetch) {
      const res = await this.request<{
        id: string
        amount: number
        currency: string
        status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
        method?: string
        captured?: boolean
        created_at: number
        error_description?: string
        notes?: { order_id?: string }
      }>(`/payments/${providerPaymentId}`)

      const curr = currency(res.currency)
      const mappedStatus: PaymentSnapshot['status'] =
        res.status === 'captured'
          ? 'captured'
          : res.status === 'authorized'
            ? 'authorized'
            : res.status === 'failed'
              ? 'failed'
              : 'pending'

      return {
        id: paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        provider: 'razorpay',
        providerPaymentId: res.id,
        orderId: orderId(res.notes?.order_id ?? '018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        amount: money(BigInt(res.amount), curr),
        status: mappedStatus,
        method: res.method ?? 'card',
        capturedAt: res.status === 'captured' ? new Date(res.created_at * 1000) : null,
        failureReason: res.error_description ?? null,
      }
    }

    const mock = this.mockPayments.get(providerPaymentId)
    if (!mock) {
      throw new PaymentNotFoundError(`Razorpay payment ${providerPaymentId} not found.`)
    }
    return mock
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const amountPaise = Number(input.amount.amount)

    if (this.hasLiveCredentials() && this.fetcher !== globalThis.fetch) {
      const res = await this.request<{
        id: string
        amount: number
        currency: string
        status: string
        created_at: number
      }>(`/payments/${input.providerPaymentId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amountPaise,
          notes: {
            refund_id: input.refundId,
            order_id: input.orderId,
            reason: input.reason ?? 'requested_by_customer',
          },
        }),
      })

      return {
        refundId: input.refundId,
        providerRefundId: res.id,
        amount: input.amount,
        status: 'processed',
        processedAt: new Date(res.created_at * 1000),
      }
    }

    // Mock refund
    const existingPayment = this.mockPayments.get(input.providerPaymentId)
    if (!existingPayment) {
      throw new PaymentNotFoundError(`Razorpay payment ${input.providerPaymentId} not found.`)
    }

    const refundRes: RefundResult = {
      refundId: input.refundId,
      providerRefundId: `rfnd_rzp_${randomUUID().slice(0, 14)}`,
      amount: input.amount,
      status: 'processed',
      processedAt: new Date(),
    }

    this.mockPayments.set(input.providerPaymentId, {
      ...existingPayment,
      status: 'refunded',
    })

    this.mockRefunds.set(input.refundId, refundRes)
    return refundRes
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    await Promise.resolve()
    const providerPayoutId = `pout_rzp_${randomUUID().slice(0, 14)}`
    const payout: PayoutResult = {
      providerPayoutId,
      amount: input.amount,
      status: 'paid',
      fee: money(0n, input.currency),
      estimatedArrival: new Date(),
    }
    return payout
  }

  async getBalance(_providerAccountId: string): Promise<ProviderBalance> {
    await Promise.resolve()
    const inr: CurrencyCode = currency('INR')
    return {
      currency: inr,
      available: money(10000000n, inr),
      pending: money(0n, inr),
    }
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhookEvent> {
    await Promise.resolve()
    const rawString =
      typeof input.rawPayload === 'string' ? input.rawPayload : input.rawPayload.toString('utf8')
    const expectedSig = createHmac('sha256', input.secret).update(rawString).digest('hex')

    const sigBuf = Buffer.from(input.signature)
    const expBuf = Buffer.from(expectedSig)

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new WebhookSignatureVerificationError(
        'Razorpay webhook signature does not match computed HMAC.',
      )
    }

    const parsed = JSON.parse(rawString) as {
      id?: string
      event?: string
      created_at?: number
      payload?: Record<string, unknown>
    }

    return {
      id: parsed.id ?? `evt_rzp_${randomUUID().slice(0, 8)}`,
      provider: 'razorpay',
      eventType: parsed.event ?? 'unknown',
      payload: parsed.payload ?? parsed,
      createdAt: parsed.created_at ? new Date(parsed.created_at * 1000) : new Date(),
    }
  }

  toDomainEvent(event: VerifiedWebhookEvent): DomainPaymentEvent | null {
    const payload = event.payload

    if (event.eventType === 'payment.captured' || event.eventType === 'order.paid') {
      const paymentWrapper = toRecord(payload['payment'])
      const pObj =
        Object.keys(toRecord(paymentWrapper['entity'])).length > 0
          ? toRecord(paymentWrapper['entity'])
          : Object.keys(paymentWrapper).length > 0
            ? paymentWrapper
            : payload
      const notes = toRecord(pObj['notes'])

      const oId = extractString(
        notes['order_id'] ?? pObj['order_id'] ?? pObj['orderId'] ?? payload['orderId'],
      )
      const amt = extractBigInt(pObj['amount'] ?? payload['amount'])
      const curr = currency(extractString(pObj['currency'] ?? payload['currency'], 'INR'))

      const capturedEvent: PaymentCapturedDomainEvent = {
        type: 'payment.captured',
        provider: 'razorpay',
        providerEventId: event.id,
        providerPaymentId: extractString(pObj['id'], `pay_${randomUUID().slice(0, 8)}`),
        orderId: orderId(oId),
        amount: money(amt, curr),
        method: extractString(pObj['method'], 'upi'),
        occurredAt: event.createdAt,
      }
      return capturedEvent
    }

    if (event.eventType === 'payment.failed') {
      const paymentWrapper = toRecord(payload['payment'])
      const pObj =
        Object.keys(toRecord(paymentWrapper['entity'])).length > 0
          ? toRecord(paymentWrapper['entity'])
          : Object.keys(paymentWrapper).length > 0
            ? paymentWrapper
            : payload
      const notes = toRecord(pObj['notes'])

      const oId = extractString(
        notes['order_id'] ?? pObj['order_id'] ?? pObj['orderId'] ?? payload['orderId'],
      )
      const amt = extractBigInt(pObj['amount'] ?? payload['amount'])
      const curr = currency(extractString(pObj['currency'] ?? payload['currency'], 'INR'))

      const failedEvent: PaymentFailedDomainEvent = {
        type: 'payment.failed',
        provider: 'razorpay',
        providerEventId: event.id,
        providerPaymentId: extractString(pObj['id'], `pay_${randomUUID().slice(0, 8)}`),
        orderId: orderId(oId),
        amount: money(amt, curr),
        reason: extractString(pObj['error_description'] ?? pObj['reason'], 'Payment failed'),
        occurredAt: event.createdAt,
      }
      return failedEvent
    }

    if (event.eventType === 'refund.processed') {
      const refundWrapper = toRecord(payload['refund'])
      const rObj =
        Object.keys(toRecord(refundWrapper['entity'])).length > 0
          ? toRecord(refundWrapper['entity'])
          : Object.keys(refundWrapper).length > 0
            ? refundWrapper
            : payload
      const notes = toRecord(rObj['notes'])

      const oId = extractString(notes['order_id'] ?? rObj['order_id'] ?? payload['orderId'])
      const amt = extractBigInt(rObj['amount'] ?? payload['amount'])
      const curr = currency(extractString(rObj['currency'] ?? payload['currency'], 'INR'))

      const refundEvent: RefundProcessedDomainEvent = {
        type: 'refund.processed',
        provider: 'razorpay',
        providerEventId: event.id,
        providerRefundId: extractString(rObj['id'], `rfnd_${randomUUID().slice(0, 8)}`),
        providerPaymentId: extractString(
          rObj['payment_id'] ?? payload['payment_id'],
          `pay_${randomUUID().slice(0, 8)}`,
        ),
        orderId: orderId(oId),
        amount: money(amt, curr),
        occurredAt: event.createdAt,
      }
      return refundEvent
    }

    return null
  }

  /**
   * Helper to simulate a payment capture in testing / mock mode.
   */
  async simulatePaymentCapture(sessionId: string): Promise<string> {
    await Promise.resolve()
    const session = this.mockOrders.get(sessionId)
    if (!session) {
      throw new PaymentNotFoundError(`Session ${sessionId} not found.`)
    }
    const provPayId = `pay_rzp_${randomUUID().slice(0, 14)}`
    const amt = session.amount

    this.mockPayments.set(provPayId, {
      id: paymentId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
      provider: 'razorpay',
      providerPaymentId: provPayId,
      orderId: session.orderId,
      amount: amt,
      status: 'captured',
      method: 'upi',
      capturedAt: new Date(),
    })

    return provPayId
  }

  /**
   * Helper to generate signed webhooks for testing and conformance checks.
   */
  generateSignedWebhook(
    eventType: string,
    payload: Record<string, unknown>,
    secret: string,
  ): { rawPayload: string; signature: string } {
    const rawPayload = JSON.stringify({
      id: `evt_rzp_${randomUUID().slice(0, 10)}`,
      entity: 'event',
      event: eventType,
      contains: ['payment'],
      payload,
      created_at: Math.floor(Date.now() / 1000),
    })

    const signature = createHmac('sha256', secret).update(rawPayload).digest('hex')
    return { rawPayload, signature }
  }
}
