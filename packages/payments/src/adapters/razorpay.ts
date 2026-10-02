/**
 * Razorpay PaymentProvider Adapter (ADR-0007, ADR-0016).
 *
 * Responsibilities:
 * - Implement the provider-agnostic `PaymentProvider` port against the Razorpay REST API.
 * - Indian payment rails through Razorpay Checkout: UPI, cards, netbanking, wallets.
 * - Verify the browser's checkout signature and webhook signatures with HMAC-SHA256.
 * - Normalise Razorpay payloads into domain payment events.
 *
 * Every method talks to Razorpay. There is no in-memory fallback: an adapter
 * that quietly pretends to take payments when it cannot reach the provider is
 * how an order gets marked paid with no money behind it. Tests inject a
 * `fetcher`; local development without keys uses `MemoryPaymentProvider`.
 *
 * Amounts stay bigint minor units (paise) everywhere except the JSON body,
 * which Razorpay requires as an integer number. `Number()` on a paise amount is
 * exact up to 2^53 paise, far beyond any single payment.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { currency, money, orderId } from '@creatorhub/contracts'

import {
  PaymentNotFoundError,
  PaymentProviderError,
  UnsupportedOperationError,
  WebhookSignatureVerificationError,
  type AccountStatus,
  type CheckoutSession,
  type ConfirmCheckoutPaymentInput,
  type ConnectedAccount,
  type CreateCheckoutSessionInput,
  type CreateConnectedAccountInput,
  type CreateOnboardingLinkInput,
  type CreatePayoutInput,
  type DomainPaymentEvent,
  type OnboardingLink,
  type PaymentProvider,
  type PaymentSnapshot,
  type PayoutResult,
  type ProviderBalance,
  type RefundPaymentInput,
  type RefundResult,
  type VerifiedWebhookEvent,
  type WebhookVerificationInput,
} from '../port.js'

export type RazorpayProviderOptions = {
  readonly keyId: string
  readonly keySecret: string
  readonly apiBaseUrl?: string | undefined
  readonly fetcher?: typeof fetch | undefined
}

type RazorpayPayment = {
  readonly id: string
  readonly order_id?: string | null
  readonly amount: number
  readonly currency: string
  readonly status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  readonly method?: string
  readonly created_at: number
  readonly error_description?: string | null
  readonly notes?: Record<string, unknown> | unknown[]
}

function asRecord(val: unknown): Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {}
}

function asString(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString()
  return ''
}

function asBigInt(val: unknown): bigint {
  if (typeof val === 'bigint') return val
  if (typeof val === 'number' && Number.isInteger(val)) return BigInt(val)
  if (typeof val === 'string' && /^\d+$/.test(val)) return BigInt(val)
  return 0n
}

/** Constant-time comparison of two hex digests. Unequal lengths never match. */
function digestsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Webhook payloads nest the entity: `{ payment: { entity: {...} } }`. */
function entityOf(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(asRecord(payload[key])['entity'])
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay'

  private readonly keyId: string
  private readonly keySecret: string
  private readonly apiBaseUrl: string
  private readonly fetcher: typeof fetch

  constructor(options: RazorpayProviderOptions) {
    if (!options.keyId || !options.keySecret) {
      throw new PaymentProviderError(
        'Razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Set both, or use PAYMENT_PROVIDER=memory for local development.',
        'CONFIGURATION_MISSING',
        false,
      )
    }
    this.keyId = options.keyId
    this.keySecret = options.keySecret
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.razorpay.com'
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  /** True when the key id is a test-mode key. Shown in the UI so nobody mistakes test for live. */
  get isTestMode(): boolean {
    return this.keyId.startsWith('rzp_test_')
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    })

    if (!response.ok) {
      const body = await response.text()
      if (response.status === 404) {
        throw new PaymentNotFoundError(`Razorpay returned 404 for ${path}.`)
      }
      // 5xx and 429 are worth retrying; 4xx means the request itself is wrong.
      const retryable = response.status >= 500 || response.status === 429
      throw new PaymentProviderError(
        `Razorpay API error ${String(response.status)} on ${path}: ${body.slice(0, 500)}`,
        'PROVIDER_ERROR',
        retryable,
      )
    }

    return (await response.json()) as T
  }

  // -------------------------------------------------------------------------
  // Connected accounts (Razorpay Route linked accounts)
  // -------------------------------------------------------------------------

  async createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccount> {
    const res = await this.request<{ id: string; status: string }>('/v2/accounts', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        type: 'route',
        legal_business_name: input.businessName,
        customer_facing_business_name: input.businessName,
        business_type: 'individual',
        contact_name: input.businessName,
        profile: { category: 'ecommerce', subcategory: 'digital_goods' },
        notes: { workspace_id: input.workspaceId },
      }),
    })

    return {
      providerAccountId: res.id,
      provider: 'razorpay',
      workspaceId: input.workspaceId,
      country: input.country,
      email: input.email,
      businessName: input.businessName,
      status: res.status === 'activated' ? 'active' : 'onboarding_pending',
      payoutsEnabled: res.status === 'activated',
      chargesEnabled: res.status === 'activated',
    }
  }

  async createOnboardingLink(input: CreateOnboardingLinkInput): Promise<OnboardingLink> {
    await Promise.resolve()
    return {
      url: `https://dashboard.razorpay.com/app/route/accounts/${encodeURIComponent(input.providerAccountId)}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }
  }

  async getAccountStatus(providerAccountId: string): Promise<AccountStatus> {
    const res = await this.request<{ status: string }>(
      `/v2/accounts/${encodeURIComponent(providerAccountId)}`,
    )
    if (res.status === 'activated') return 'active'
    if (res.status === 'suspended') return 'restricted'
    return 'onboarding_pending'
  }

  // -------------------------------------------------------------------------
  // Checkout
  // -------------------------------------------------------------------------

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const body: Record<string, unknown> = {
      amount: Number(input.totalAmount.amount),
      currency: input.currency,
      // Razorpay caps receipt at 40 characters. A UUID without dashes is 32.
      receipt: input.orderId.replaceAll('-', ''),
      // Signed into every webhook for this order, which is how the webhook
      // learns its tenant without a cross-tenant lookup (ADR-0021).
      notes: {
        workspace_id: input.workspaceId,
        order_id: input.orderId,
      },
    }

    if (input.splitTransfers && input.splitTransfers.length > 0) {
      body['transfers'] = input.splitTransfers.map((t) => ({
        account: t.destinationAccountId,
        amount: Number(t.amount.amount),
        currency: t.amount.currency,
        on_hold: 0,
      }))
    }

    const res = await this.request<{ id: string }>('/v1/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    return {
      id: res.id,
      provider: 'razorpay',
      orderId: input.orderId,
      amount: input.totalAmount,
      currency: input.currency,
      // Razorpay Checkout is opened in the page with checkout.js, not by
      // redirect, so there is no hosted URL. The success URL is where the page
      // goes once the payment is confirmed server-side.
      checkoutUrl: input.successUrl,
      publicKey: this.keyId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }
  }

  async confirmCheckoutPayment(input: ConfirmCheckoutPaymentInput): Promise<PaymentSnapshot> {
    // Razorpay signs `order_id|payment_id` with the key secret. This is what
    // stops a buyer from posting someone else's payment id against their order.
    const expected = createHmac('sha256', this.keySecret)
      .update(`${input.sessionId}|${input.providerPaymentId}`)
      .digest('hex')

    if (!digestsMatch(expected, input.signature)) {
      throw new WebhookSignatureVerificationError(
        'Razorpay checkout signature does not match this order and payment.',
      )
    }

    let payment = await this.fetchPayment(input.providerPaymentId)

    if (payment.order_id && payment.order_id !== input.sessionId) {
      throw new WebhookSignatureVerificationError(
        'Razorpay payment belongs to a different order.',
      )
    }

    if (payment.status === 'authorized') {
      payment = await this.request<RazorpayPayment>(
        `/v1/payments/${encodeURIComponent(payment.id)}/capture`,
        {
          method: 'POST',
          body: JSON.stringify({ amount: payment.amount, currency: payment.currency }),
        },
      )
    }

    return this.toSnapshot(payment)
  }

  async getPayment(providerPaymentId: string): Promise<PaymentSnapshot> {
    return this.toSnapshot(await this.fetchPayment(providerPaymentId))
  }

  private fetchPayment(providerPaymentId: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(`/v1/payments/${encodeURIComponent(providerPaymentId)}`)
  }

  private toSnapshot(payment: RazorpayPayment): PaymentSnapshot {
    const notes = asRecord(payment.notes)
    const status: PaymentSnapshot['status'] =
      payment.status === 'captured'
        ? 'captured'
        : payment.status === 'authorized'
          ? 'authorized'
          : payment.status === 'failed'
            ? 'failed'
            : payment.status === 'refunded'
              ? 'refunded'
              : 'pending'

    return {
      provider: 'razorpay',
      providerPaymentId: payment.id,
      providerOrderId: payment.order_id ?? null,
      orderId: orderId(asString(notes['order_id'])),
      amount: money(BigInt(payment.amount), currency(payment.currency)),
      status,
      method: payment.method,
      capturedAt: payment.status === 'captured' ? new Date(payment.created_at * 1000) : null,
      failureReason: payment.error_description ?? null,
    }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const res = await this.request<{ id: string; status: string; created_at: number }>(
      `/v1/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(input.amount.amount),
          // Razorpay deduplicates on receipt, which makes a retried refund safe.
          receipt: input.refundId.replaceAll('-', ''),
          notes: {
            refund_id: input.refundId,
            order_id: input.orderId,
            reason: input.reason ?? 'requested_by_customer',
          },
        }),
      },
    )

    return {
      refundId: input.refundId,
      providerRefundId: res.id,
      amount: input.amount,
      status: res.status === 'processed' ? 'processed' : 'pending',
      processedAt: new Date(res.created_at * 1000),
    }
  }

  // -------------------------------------------------------------------------
  // Payouts. Creator settlement runs through the ledger and is disbursed by
  // operations (ADR-0021); a RazorpayX adapter is a separate integration.
  // -------------------------------------------------------------------------

  async createPayout(_input: CreatePayoutInput): Promise<PayoutResult> {
    await Promise.resolve()
    throw new UnsupportedOperationError('createPayout', 'razorpay')
  }

  async getBalance(_providerAccountId: string): Promise<ProviderBalance> {
    await Promise.resolve()
    throw new UnsupportedOperationError('getBalance', 'razorpay')
  }

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  async verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhookEvent> {
    await Promise.resolve()
    if (!input.secret) {
      throw new WebhookSignatureVerificationError('No Razorpay webhook secret is configured.')
    }

    const raw =
      typeof input.rawPayload === 'string' ? input.rawPayload : input.rawPayload.toString('utf8')
    const expected = createHmac('sha256', input.secret).update(raw).digest('hex')

    if (!digestsMatch(expected, input.signature)) {
      throw new WebhookSignatureVerificationError(
        'Razorpay webhook signature does not match computed HMAC.',
      )
    }

    const parsed = JSON.parse(raw) as {
      id?: string
      event?: string
      created_at?: number
      payload?: Record<string, unknown>
    }
    const payload = parsed.payload ?? {}

    // Razorpay's event id arrives in the x-razorpay-event-id header, not the
    // body, so the caller passes it when it has it. The body-derived fallback
    // is stable for a given delivery, which is what deduplication needs.
    const eventId =
      input.eventId ??
      parsed.id ??
      createHmac('sha256', input.secret).update(raw).digest('hex').slice(0, 32)

    const notes = {
      ...asRecord(entityOf(payload, 'order')['notes']),
      ...asRecord(entityOf(payload, 'payment')['notes']),
      ...asRecord(entityOf(payload, 'refund')['notes']),
    }
    const workspaceId = asString(notes['workspace_id'])

    return {
      id: eventId,
      provider: 'razorpay',
      eventType: parsed.event ?? 'unknown',
      payload,
      createdAt: parsed.created_at ? new Date(parsed.created_at * 1000) : new Date(),
      ...(workspaceId ? { workspaceId } : {}),
    }
  }

  toDomainEvent(event: VerifiedWebhookEvent): DomainPaymentEvent | null {
    const payment = entityOf(event.payload, 'payment')
    const order = entityOf(event.payload, 'order')
    const notes = { ...asRecord(order['notes']), ...asRecord(payment['notes']) }
    const internalOrderId = asString(notes['order_id'])

    if (event.eventType === 'payment.captured' || event.eventType === 'order.paid') {
      if (!internalOrderId || !asString(payment['id'])) return null
      return {
        type: 'payment.captured',
        provider: 'razorpay',
        providerEventId: event.id,
        providerPaymentId: asString(payment['id']),
        orderId: orderId(internalOrderId),
        amount: money(asBigInt(payment['amount']), currency(asString(payment['currency']) || 'INR')),
        method: asString(payment['method']) || 'unknown',
        occurredAt: event.createdAt,
      }
    }

    if (event.eventType === 'payment.failed') {
      if (!internalOrderId || !asString(payment['id'])) return null
      return {
        type: 'payment.failed',
        provider: 'razorpay',
        providerEventId: event.id,
        providerPaymentId: asString(payment['id']),
        orderId: orderId(internalOrderId),
        amount: money(asBigInt(payment['amount']), currency(asString(payment['currency']) || 'INR')),
        reason: asString(payment['error_description']) || 'Payment failed',
        occurredAt: event.createdAt,
      }
    }

    if (event.eventType === 'refund.processed') {
      const refund = entityOf(event.payload, 'refund')
      const refundOrderId = asString(asRecord(refund['notes'])['order_id']) || internalOrderId
      if (!refundOrderId || !asString(refund['id'])) return null
      return {
        type: 'refund.processed',
        provider: 'razorpay',
        providerEventId: event.id,
        providerRefundId: asString(refund['id']),
        providerPaymentId: asString(refund['payment_id']),
        orderId: orderId(refundOrderId),
        amount: money(asBigInt(refund['amount']), currency(asString(refund['currency']) || 'INR')),
        occurredAt: event.createdAt,
      }
    }

    return null
  }
}
