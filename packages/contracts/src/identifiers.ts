/**
 * Entity identifiers.
 *
 * Responsibilities: give every entity id a distinct type, so passing a user id
 * where a workspace id belongs is a compile error rather than a support ticket.
 * Dependencies: zod (schema only). No I/O, no framework.
 *
 * Two constraints drive the design:
 *
 * 1. Ids are branded. `string` accepts any other string, and the one place that
 *    matters most is the tenant predicate: a workspace id that turns out to be a
 *    user id returns nothing, or worse, returns someone else's rows.
 * 2. Persistent ids are UUIDv7. The data model requires time-ordered keys for
 *    index locality without leaking sequential counts, and Postgres 18 generates
 *    them natively (ADR-0015).
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tenant root. The value every tenant-scoped query is filtered by. */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' }

/** A person. Owned by the auth library's table (ADR-0006). */
export type UserId = string & { readonly __brand: 'UserId' }

/** Double-entry ledger account identifier (UUIDv7). */
export type LedgerAccountId = string & { readonly __brand: 'LedgerAccountId' }

/** Double-entry ledger transaction identifier (UUIDv7). */
export type LedgerTransactionId = string & { readonly __brand: 'LedgerTransactionId' }

/** Double-entry ledger entry identifier (UUIDv7). */
export type LedgerEntryId = string & { readonly __brand: 'LedgerEntryId' }

export type JobId = string & { readonly __brand: 'JobId' }

/** Catalogue product identifier (UUIDv7). */
export type ProductId = string & { readonly __brand: 'ProductId' }

/** Product variant identifier (UUIDv7). */
export type VariantId = string & { readonly __brand: 'VariantId' }

/** Digital or media asset identifier (UUIDv7). */
export type AssetId = string & { readonly __brand: 'AssetId' }

/** Product-to-asset association identifier (UUIDv7). */
export type ProductAssetId = string & { readonly __brand: 'ProductAssetId' }
export type DiscountId = string & { readonly __brand: 'DiscountId' }
export type StorefrontId = string & { readonly __brand: 'StorefrontId' }
export type StorefrontEventId = string & { readonly __brand: 'StorefrontEventId' }
export type OrderId = string & { readonly __brand: 'OrderId' }
export type OrderItemId = string & { readonly __brand: 'OrderItemId' }
export type OrderTransitionId = string & { readonly __brand: 'OrderTransitionId' }
export type PaymentId = string & { readonly __brand: 'PaymentId' }
export type PaymentAccountId = string & { readonly __brand: 'PaymentAccountId' }
export type RefundId = string & { readonly __brand: 'RefundId' }
export type DisputeId = string & { readonly __brand: 'DisputeId' }
export type CustomerId = string & { readonly __brand: 'CustomerId' }
export type WebhookEventId = string & { readonly __brand: 'WebhookEventId' }
export type EntitlementId = string & { readonly __brand: 'EntitlementId' }
export type DownloadGrantId = string & { readonly __brand: 'DownloadGrantId' }
export type DownloadEventId = string & { readonly __brand: 'DownloadEventId' }
export type AffiliateProgramId = string & { readonly __brand: 'AffiliateProgramId' }
export type AffiliateId = string & { readonly __brand: 'AffiliateId' }
export type AffiliateLinkId = string & { readonly __brand: 'AffiliateLinkId' }
export type AffiliateClickId = string & { readonly __brand: 'AffiliateClickId' }
export type AttributionId = string & { readonly __brand: 'AttributionId' }
export type CommissionId = string & { readonly __brand: 'CommissionId' }
export type ClawbackId = string & { readonly __brand: 'ClawbackId' }
export type AiUsageId = string & { readonly __brand: 'AiUsageId' }
export type PayoutId = string & { readonly __brand: 'PayoutId' }
export type PayoutItemId = string & { readonly __brand: 'PayoutItemId' }
export type BeneficiaryAccountId = string & { readonly __brand: 'BeneficiaryAccountId' }

/**
 * Correlates every log line, audit row, and outbox event produced while serving
 * one request.
 *
 * Deliberately not a UUIDv7: this is a correlation value, not a database key. It
 * may arrive from an upstream proxy header, so it is validated as a bounded
 * opaque string rather than a specific format.
 */
export type RequestId = string & { readonly __brand: 'RequestId' }

// ---------------------------------------------------------------------------
// Errors
//
// A malformed id is a programming error, not a domain outcome. Per the
// error-handling standard, unexpected failures throw rather than returning a
// Result. External input reaches these through a schema, which reports properly.
// ---------------------------------------------------------------------------

export class InvalidIdentifierError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidIdentifierError'
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * UUIDv7 specifically, not any UUID.
 *
 * Position 15 is the version nibble and must be 7. Position 20 is the variant
 * and must be 8, 9, a, or b. Accepting any UUID here would let a v4 from some
 * other system become a primary key, and the time-ordering the data model
 * depends on for index locality would silently stop holding.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Long enough for a UUID or a trace id, short enough to bound a log line. */
const REQUEST_ID_MAX_LENGTH = 128
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/

function assertUuidV7(value: string, label: string): void {
  if (!UUID_V7_PATTERN.test(value)) {
    throw new InvalidIdentifierError(`Invalid ${label}: expected a UUIDv7.`)
  }
}

// ---------------------------------------------------------------------------
// Constructors
//
// The only way to obtain a branded id. A cast elsewhere bypasses validation,
// which is why the brand is not exported as a standalone helper.
// ---------------------------------------------------------------------------

export function workspaceId(value: string): WorkspaceId {
  assertUuidV7(value, 'workspace id')
  return value as WorkspaceId
}

export function userId(value: string): UserId {
  assertUuidV7(value, 'user id')
  return value as UserId
}

export function ledgerAccountId(value: string): LedgerAccountId {
  assertUuidV7(value, 'ledger account id')
  return value as LedgerAccountId
}

export function ledgerTransactionId(value: string): LedgerTransactionId {
  assertUuidV7(value, 'ledger transaction id')
  return value as LedgerTransactionId
}

export function ledgerEntryId(value: string): LedgerEntryId {
  assertUuidV7(value, 'ledger entry id')
  return value as LedgerEntryId
}

export function jobId(value: string): JobId {
  assertUuidV7(value, 'job id')
  return value as JobId
}

export function productId(value: string): ProductId {
  assertUuidV7(value, 'product id')
  return value as ProductId
}

export function variantId(value: string): VariantId {
  assertUuidV7(value, 'variant id')
  return value as VariantId
}

export function assetId(value: string): AssetId {
  assertUuidV7(value, 'asset id')
  return value as AssetId
}

export function productAssetId(value: string): ProductAssetId {
  assertUuidV7(value, 'product asset id')
  return value as ProductAssetId
}

export function discountId(value: string): DiscountId {
  assertUuidV7(value, 'discount id')
  return value as DiscountId
}

export function storefrontId(value: string): StorefrontId {
  assertUuidV7(value, 'storefront id')
  return value as StorefrontId
}

export function storefrontEventId(value: string): StorefrontEventId {
  assertUuidV7(value, 'storefront event id')
  return value as StorefrontEventId
}

export function orderId(value: string): OrderId {
  assertUuidV7(value, 'order id')
  return value as OrderId
}

export function orderItemId(value: string): OrderItemId {
  assertUuidV7(value, 'order item id')
  return value as OrderItemId
}

export function orderTransitionId(value: string): OrderTransitionId {
  assertUuidV7(value, 'order transition id')
  return value as OrderTransitionId
}

export function paymentId(value: string): PaymentId {
  assertUuidV7(value, 'payment id')
  return value as PaymentId
}

export function paymentAccountId(value: string): PaymentAccountId {
  assertUuidV7(value, 'payment account id')
  return value as PaymentAccountId
}

export function refundId(value: string): RefundId {
  assertUuidV7(value, 'refund id')
  return value as RefundId
}

export function disputeId(value: string): DisputeId {
  assertUuidV7(value, 'dispute id')
  return value as DisputeId
}

export function customerId(value: string): CustomerId {
  assertUuidV7(value, 'customer id')
  return value as CustomerId
}

export function webhookEventId(value: string): WebhookEventId {
  assertUuidV7(value, 'webhook event id')
  return value as WebhookEventId
}

export function entitlementId(value: string): EntitlementId {
  assertUuidV7(value, 'entitlement id')
  return value as EntitlementId
}

export function downloadGrantId(value: string): DownloadGrantId {
  assertUuidV7(value, 'download grant id')
  return value as DownloadGrantId
}

export function downloadEventId(value: string): DownloadEventId {
  assertUuidV7(value, 'download event id')
  return value as DownloadEventId
}

export function affiliateProgramId(value: string): AffiliateProgramId {
  assertUuidV7(value, 'affiliate program id')
  return value as AffiliateProgramId
}

export function affiliateId(value: string): AffiliateId {
  assertUuidV7(value, 'affiliate id')
  return value as AffiliateId
}

export function affiliateLinkId(value: string): AffiliateLinkId {
  assertUuidV7(value, 'affiliate link id')
  return value as AffiliateLinkId
}

export function affiliateClickId(value: string): AffiliateClickId {
  assertUuidV7(value, 'affiliate click id')
  return value as AffiliateClickId
}

export function attributionId(value: string): AttributionId {
  assertUuidV7(value, 'attribution id')
  return value as AttributionId
}

export function commissionId(value: string): CommissionId {
  assertUuidV7(value, 'commission id')
  return value as CommissionId
}

export function clawbackId(value: string): ClawbackId {
  assertUuidV7(value, 'clawback id')
  return value as ClawbackId
}

export function aiUsageId(value: string): AiUsageId {
  assertUuidV7(value, 'ai usage id')
  return value as AiUsageId
}

export function payoutId(value: string): PayoutId {
  assertUuidV7(value, 'payout id')
  return value as PayoutId
}

export function payoutItemId(value: string): PayoutItemId {
  assertUuidV7(value, 'payout item id')
  return value as PayoutItemId
}

export function beneficiaryAccountId(value: string): BeneficiaryAccountId {
  assertUuidV7(value, 'beneficiary account id')
  return value as BeneficiaryAccountId
}

export function requestId(value: string): RequestId {
  if (value.length < 1 || value.length > REQUEST_ID_MAX_LENGTH) {
    throw new InvalidIdentifierError(
      `Invalid request id: expected between 1 and ${String(REQUEST_ID_MAX_LENGTH)} characters.`,
    )
  }
  if (!REQUEST_ID_PATTERN.test(value)) {
    throw new InvalidIdentifierError(
      'Invalid request id: expected letters, digits, dot, underscore, colon, or hyphen.',
    )
  }
  return value as RequestId
}

// ---------------------------------------------------------------------------
// Schemas
//
// Used at system boundaries to validate external input and brand it in one step.
// ---------------------------------------------------------------------------

export const workspaceIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as WorkspaceId)

export const userIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as UserId)

export const ledgerAccountIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as LedgerAccountId)

export const ledgerTransactionIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as LedgerTransactionId)

export const ledgerEntryIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as LedgerEntryId)

export const jobIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as JobId)

export const productIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as ProductId)

export const variantIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as VariantId)

export const assetIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AssetId)

export const productAssetIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as ProductAssetId)

export const discountIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as DiscountId)

export const storefrontIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as StorefrontId)

export const storefrontEventIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as StorefrontEventId)

export const orderIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as OrderId)

export const orderItemIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as OrderItemId)

export const orderTransitionIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as OrderTransitionId)

export const paymentIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as PaymentId)

export const paymentAccountIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as PaymentAccountId)

export const refundIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as RefundId)

export const disputeIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as DisputeId)

export const customerIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as CustomerId)

export const webhookEventIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as WebhookEventId)

export const entitlementIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as EntitlementId)

export const downloadGrantIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as DownloadGrantId)

export const downloadEventIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as DownloadEventId)

export const affiliateProgramIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AffiliateProgramId)

export const affiliateIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AffiliateId)

export const affiliateLinkIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AffiliateLinkId)

export const affiliateClickIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AffiliateClickId)

export const attributionIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AttributionId)

export const commissionIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as CommissionId)

export const clawbackIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as ClawbackId)

export const aiUsageIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as AiUsageId)

export const payoutIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as PayoutId)

export const payoutItemIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as PayoutItemId)

export const beneficiaryAccountIdSchema = z
  .string()
  .regex(UUID_V7_PATTERN, 'Expected a UUIDv7.')
  .transform((value) => value as BeneficiaryAccountId)

export const requestIdSchema = z
  .string()
  .min(1)
  .max(REQUEST_ID_MAX_LENGTH)
  .regex(REQUEST_ID_PATTERN, 'Expected letters, digits, dot, underscore, colon, or hyphen.')
  .transform((value) => value as RequestId)
