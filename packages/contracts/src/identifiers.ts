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

export function requestId(value: string): RequestId {
  if (value.length === 0 || value.length > REQUEST_ID_MAX_LENGTH) {
    throw new InvalidIdentifierError(
      `Invalid request id: expected 1 to ${String(REQUEST_ID_MAX_LENGTH)} characters.`,
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
// For parsing at a boundary, where a bad value is an expected outcome and needs
// a reportable error rather than a thrown one.
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

export const requestIdSchema = z
  .string()
  .min(1)
  .max(REQUEST_ID_MAX_LENGTH)
  .regex(REQUEST_ID_PATTERN, 'Expected letters, digits, dot, underscore, colon, or hyphen.')
  .transform((value) => value as RequestId)
