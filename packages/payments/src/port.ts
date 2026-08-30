/**
 * Payment provider port and domain contracts (ADR-0007, ADR-0016).
 *
 * Responsibilities:
 * - Define the provider-agnostic PaymentProvider port interface.
 * - Enforce domain vocabulary: Money minor units, branded IDs, structured domain events.
 * - Isolate the core application and ledger from provider-specific shapes or APIs.
 */
import type {
  BasisPoints,
  CurrencyCode,
  Money,
  OrderId,
  PaymentId,
  RefundId,
  WorkspaceId,
} from '@creatorhub/contracts'

// ---------------------------------------------------------------------------
// Provider Enums and Types
// ---------------------------------------------------------------------------

export const PAYMENT_PROVIDERS = ['razorpay', 'stripe', 'memory'] as const
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number]

export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const ACCOUNT_STATUSES = [
  'created',
  'onboarding_pending',
  'under_review',
  'active',
  'restricted',
  'disabled',
] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export const REFUND_STATUSES = ['pending', 'processed', 'failed'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

export const PAYOUT_STATUSES = ['scheduled', 'in_transit', 'paid', 'failed'] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PaymentProviderError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(message: string, code = 'PAYMENT_PROVIDER_ERROR', retryable = false) {
    super(message)
    this.name = 'PaymentProviderError'
    this.code = code
    this.retryable = retryable
  }
}

export class WebhookSignatureVerificationError extends PaymentProviderError {
  constructor(message = 'Invalid webhook signature.') {
    super(message, 'WEBHOOK_SIGNATURE_INVALID', false)
    this.name = 'WebhookSignatureVerificationError'
  }
}

export class PaymentDeclinedError extends PaymentProviderError {
  readonly declineCode?: string | undefined

  constructor(message = 'Payment was declined.', declineCode?: string) {
    super(message, 'PAYMENT_DECLINED', false)
    this.name = 'PaymentDeclinedError'
    if (declineCode !== undefined) {
      this.declineCode = declineCode
    }
  }
}

export class PaymentNotFoundError extends PaymentProviderError {
  constructor(paymentId: string) {
    super(`Payment ${paymentId} not found.`, 'PAYMENT_NOT_FOUND', false)
    this.name = 'PaymentNotFoundError'
  }
}

export class AccountNotReadyError extends PaymentProviderError {
  constructor(accountId: string, status: AccountStatus) {
    super(
      `Payment account ${accountId} is not active (current status: ${status}).`,
      'ACCOUNT_NOT_READY',
      false,
    )
    this.name = 'AccountNotReadyError'
  }
}

export class UnsupportedOperationError extends PaymentProviderError {
  constructor(operation: string, provider: string) {
    super(`Operation ${operation} is not supported by ${provider}.`, 'UNSUPPORTED_OPERATION', false)
    this.name = 'UnsupportedOperationError'
  }
}

// ---------------------------------------------------------------------------
// Port Input & Output Models
// ---------------------------------------------------------------------------

export type ConnectedAccount = {
  readonly provider: PaymentProviderName
  readonly providerAccountId: string
  readonly workspaceId: WorkspaceId
  readonly country: string
  readonly email: string
  readonly businessName: string
  readonly status: AccountStatus
  readonly payoutsEnabled: boolean
  readonly chargesEnabled: boolean
  readonly metadata?: Record<string, unknown>
}

export type CreateConnectedAccountInput = {
  readonly workspaceId: WorkspaceId
  readonly email: string
  readonly businessName: string
  readonly country: string
  readonly defaultCurrency: CurrencyCode
  readonly accountType?: 'individual' | 'company'
}

export type OnboardingLink = {
  readonly url: string
  readonly expiresAt: Date
}

export type CreateOnboardingLinkInput = {
  readonly providerAccountId: string
  readonly returnUrl: string
  readonly refreshUrl: string
}

export type CheckoutLineItem = {
  readonly name: string
  readonly description?: string
  readonly quantity: number
  readonly unitAmount: Money
  readonly totalAmount: Money
  readonly productId?: string
  readonly variantId?: string
}

export type SplitTransferInstruction = {
  readonly destinationAccountId: string
  readonly amount: Money
  readonly description?: string
}

export type CreateCheckoutSessionInput = {
  readonly workspaceId: WorkspaceId
  readonly orderId: OrderId
  readonly currency: CurrencyCode
  readonly totalAmount: Money
  readonly lineItems: readonly CheckoutLineItem[]
  readonly customer: {
    readonly email: string
    readonly name?: string
    readonly phone?: string
  }
  readonly successUrl: string
  readonly cancelUrl: string
  readonly splitTransfers?: readonly SplitTransferInstruction[]
  readonly platformFeeBps?: BasisPoints
  readonly metadata?: Record<string, string>
}

export type CheckoutSession = {
  readonly id: string
  readonly provider: PaymentProviderName
  readonly orderId: OrderId
  readonly checkoutUrl: string
  readonly clientSecret?: string
  readonly amount: Money
  readonly currency: CurrencyCode
  readonly expiresAt: Date
}

export type PaymentSnapshot = {
  readonly id: PaymentId
  readonly provider: PaymentProviderName
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly status: PaymentStatus
  readonly method?: string | undefined
  readonly capturedAt: Date | null
  readonly failureReason?: string | null | undefined
  readonly splitTransfers?: readonly SplitTransferInstruction[] | undefined
}

export type RefundPaymentInput = {
  readonly paymentId: PaymentId
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly refundId: RefundId
  readonly amount: Money
  readonly reason?: 'requested_by_customer' | 'fraudulent' | 'duplicate' | 'other'
  readonly metadata?: Record<string, string>
}

export type RefundResult = {
  readonly refundId: RefundId
  readonly providerRefundId: string
  readonly amount: Money
  readonly status: RefundStatus
  readonly processedAt: Date
}

export type CreatePayoutInput = {
  readonly workspaceId: WorkspaceId
  readonly destinationAccountId: string
  readonly amount: Money
  readonly currency: CurrencyCode
  readonly referenceId: string
  readonly narration?: string
}

export type PayoutResult = {
  readonly providerPayoutId: string
  readonly amount: Money
  readonly status: PayoutStatus
  readonly fee?: Money
  readonly estimatedArrival?: Date
}

export type ProviderBalance = {
  readonly currency: CurrencyCode
  readonly available: Money
  readonly pending: Money
}

export type WebhookVerificationInput = {
  readonly rawPayload: string | Buffer
  readonly signature: string
  readonly secret: string
}

export type VerifiedWebhookEvent = {
  readonly id: string
  readonly provider: PaymentProviderName
  readonly eventType: string
  readonly payload: Record<string, unknown>
  readonly createdAt: Date
}

// ---------------------------------------------------------------------------
// Domain Payment Events
//
// The port guarantees translation of provider events into normalized domain events.
// ---------------------------------------------------------------------------

export type PaymentAuthorizedDomainEvent = {
  readonly type: 'payment.authorized'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly occurredAt: Date
}

export type PaymentCapturedDomainEvent = {
  readonly type: 'payment.captured'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly method?: string
  readonly occurredAt: Date
}

export type PaymentFailedDomainEvent = {
  readonly type: 'payment.failed'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly reason: string
  readonly occurredAt: Date
}

export type RefundProcessedDomainEvent = {
  readonly type: 'refund.processed'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerRefundId: string
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly occurredAt: Date
}

export type DisputeCreatedDomainEvent = {
  readonly type: 'dispute.created'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerDisputeId: string
  readonly providerPaymentId: string
  readonly orderId: OrderId
  readonly amount: Money
  readonly reason: string
  readonly occurredAt: Date
}

export type AccountUpdatedDomainEvent = {
  readonly type: 'account.updated'
  readonly provider: PaymentProviderName
  readonly providerEventId: string
  readonly providerAccountId: string
  readonly status: AccountStatus
  readonly payoutsEnabled: boolean
  readonly occurredAt: Date
}

export type DomainPaymentEvent =
  | PaymentAuthorizedDomainEvent
  | PaymentCapturedDomainEvent
  | PaymentFailedDomainEvent
  | RefundProcessedDomainEvent
  | DisputeCreatedDomainEvent
  | AccountUpdatedDomainEvent

// ---------------------------------------------------------------------------
// The Port Interface
// ---------------------------------------------------------------------------

export type PaymentProvider = {
  readonly name: PaymentProviderName

  createConnectedAccount(input: CreateConnectedAccountInput): Promise<ConnectedAccount>
  createOnboardingLink(input: CreateOnboardingLinkInput): Promise<OnboardingLink>
  getAccountStatus(providerAccountId: string): Promise<AccountStatus>

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>
  getPayment(providerPaymentId: string): Promise<PaymentSnapshot>
  refundPayment(input: RefundPaymentInput): Promise<RefundResult>

  createPayout(input: CreatePayoutInput): Promise<PayoutResult>
  getBalance(providerAccountId: string): Promise<ProviderBalance>

  verifyWebhook(input: WebhookVerificationInput): Promise<VerifiedWebhookEvent>
  toDomainEvent(event: VerifiedWebhookEvent): DomainPaymentEvent | null
}
