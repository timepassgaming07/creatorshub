/**
 * @creatorhub/payments — Payment Provider Port and Adapters.
 *
 * Responsibilities:
 * - Provider-agnostic payment abstraction (ADR-0007, ADR-0016).
 * - Domain contracts for connected accounts, checkout sessions, payments, payouts, refunds, and webhooks.
 * - Normalized domain payment event translations.
 * - Memory payment provider adapter for tests and local development.
 */
export {
  ACCOUNT_STATUSES,
  AccountNotReadyError,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PaymentDeclinedError,
  PaymentNotFoundError,
  PaymentProviderError,
  REFUND_STATUSES,
  UnsupportedOperationError,
  WebhookSignatureVerificationError,
} from './port.js'

export type {
  AccountStatus,
  AccountUpdatedDomainEvent,
  CheckoutLineItem,
  CheckoutSession,
  ConfirmCheckoutPaymentInput,
  ConnectedAccount,
  CreateCheckoutSessionInput,
  CreateConnectedAccountInput,
  CreateOnboardingLinkInput,
  CreatePayoutInput,
  DisputeCreatedDomainEvent,
  DomainPaymentEvent,
  OnboardingLink,
  PaymentAuthorizedDomainEvent,
  PaymentCapturedDomainEvent,
  PaymentFailedDomainEvent,
  PaymentProvider,
  PaymentProviderName,
  PaymentSnapshot,
  PaymentStatus,
  PayoutResult,
  PayoutStatus,
  ProviderBalance,
  RefundPaymentInput,
  RefundProcessedDomainEvent,
  RefundResult,
  RefundStatus,
  SplitTransferInstruction,
  VerifiedWebhookEvent,
  WebhookVerificationInput,
} from './port.js'

export { MemoryPaymentProvider } from './adapters/memory.js'
export { RazorpayPaymentProvider, type RazorpayProviderOptions } from './adapters/razorpay.js'
