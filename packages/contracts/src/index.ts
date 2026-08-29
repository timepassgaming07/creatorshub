/**
 * @creatorhub/contracts — the shared vocabulary between layers.
 *
 * Everything crossing a boundary is described here: money, identifiers, and
 * (as they arrive) the zod schemas for every command and view model. Domain,
 * database, API, and UI all speak these types, which is what stops each layer
 * inventing its own slightly different shape.
 *
 * This file is the only public surface. Deep imports are unresolvable by design.
 */
export {
  CurrencyMismatchError,
  InvalidMoneyError,
  absolute,
  add,
  allocate,
  basisPoints,
  compare,
  currency,
  equals,
  fromDecimalString,
  greaterThan,
  isNegative,
  isPositive,
  isZero,
  lessThan,
  minorUnitExponent,
  money,
  moneySchema,
  multiply,
  negate,
  percentage,
  subtract,
  sum,
  toDecimalString,
  toWire,
  zero,
} from './money.js'

export type { BasisPoints, CurrencyCode, Money, MoneyWire } from './money.js'

export {
  InvalidIdentifierError,
  assetId,
  assetIdSchema,
  discountId,
  discountIdSchema,
  jobId,
  jobIdSchema,
  ledgerAccountId,
  ledgerAccountIdSchema,
  ledgerEntryId,
  ledgerEntryIdSchema,
  ledgerTransactionId,
  ledgerTransactionIdSchema,
  productAssetId,
  productAssetIdSchema,
  productId,
  productIdSchema,
  requestId,
  requestIdSchema,
  storefrontId,
  storefrontIdSchema,
  userId,
  userIdSchema,
  variantId,
  variantIdSchema,
  workspaceId,
  workspaceIdSchema,
} from './identifiers.js'

export type {
  AssetId,
  DiscountId,
  JobId,
  LedgerAccountId,
  LedgerEntryId,
  LedgerTransactionId,
  ProductAssetId,
  ProductId,
  RequestId,
  StorefrontId,
  UserId,
  VariantId,
  WorkspaceId,
} from './identifiers.js'

export {
  LEDGER_ACCOUNT_KINDS,
  LEDGER_ACCOUNT_OWNER_TYPES,
  LEDGER_ENTRY_DIRECTIONS,
  LEDGER_TRANSACTION_KINDS,
  getAccountNormalBalance,
  ledgerAccountKindSchema,
  ledgerAccountOwnerTypeSchema,
  ledgerEntryDirectionSchema,
  ledgerEntryProposalSchema,
  ledgerTransactionKindSchema,
  postTransactionInputSchema,
} from './ledger.js'

export type {
  AccountBalance,
  AccountNormalBalance,
  LedgerAccountKind,
  LedgerAccountOwnerType,
  LedgerEntryDirection,
  LedgerEntryProposal,
  LedgerTransactionKind,
  PostTransactionInput,
} from './ledger.js'

export {
  JOB_STATUSES,
  calculateExponentialBackoff,
  enqueueJobInputSchema,
  jobStatusSchema,
} from './jobs.js'

export type { BackoffOptions, EnqueueJobInput, JobRecord, JobStatus } from './jobs.js'

export {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  canonicalizeJson,
  idempotencyKeyStringSchema,
  idempotencyOptionsSchema,
  idempotencyScopeSchema,
} from './idempotency.js'

export type { IdempotencyOptions, IdempotencyRecord } from './idempotency.js'

export { reconciliationStatusSchema } from './reconciliation.js'

export type {
  AccountReconciliationResult,
  ReconciliationStatus,
  WorkspaceReconciliationSummary,
} from './reconciliation.js'

export {
  ASSET_SCAN_STATUSES,
  PRODUCT_ASSET_ROLES,
  PRODUCT_SLUG_PATTERN,
  PRODUCT_STATUSES,
  PRODUCT_VISIBILITIES,
  VARIANT_INVENTORY_POLICIES,
  assetScanStatusSchema,
  attachProductAssetInputSchema,
  createAssetInputSchema,
  createProductInputSchema,
  createVariantInputSchema,
  productAssetRoleSchema,
  productSlugSchema,
  productStatusSchema,
  productVisibilitySchema,
  updateProductInputSchema,
  variantInventoryPolicySchema,
} from './catalogue.js'

export type {
  AssetScanStatus,
  AttachProductAssetInput,
  CreateAssetInput,
  CreateProductInput,
  CreateVariantInput,
  ProductAssetRole,
  ProductStatus,
  ProductVisibility,
  UpdateProductInput,
  VariantInventoryPolicy,
} from './catalogue.js'

export {
  COUPON_CODE_PATTERN,
  DISCOUNT_TYPES,
  couponCodeSchema,
  createDiscountInputSchema,
  currencyCodeSchema,
  discountEvaluationContextSchema,
  discountTypeSchema,
} from './discounts.js'

export type {
  CreateDiscountInput,
  DiscountEvaluationContext,
  DiscountRecord,
  DiscountType,
} from './discounts.js'

export {
  CERTIFICATE_STATUSES,
  CUSTOM_DOMAIN_PATTERN,
  CUSTOM_DOMAIN_STATUSES,
  DEFAULT_PLATFORM_CNAME_TARGET,
  RESERVED_SUBDOMAINS,
  STOREFRONT_STATUSES,
  SUBDOMAIN_PATTERN,
  THEME_LAYOUT_PRESETS,
  buildDomainChallenge,
  createStorefrontInputSchema,
  customDomainSchema,
  customDomainStatusSchema,
  storefrontStatusSchema,
  storefrontThemeSchema,
  subdomainSchema,
  themeLayoutPresetSchema,
  updateStorefrontInputSchema,
} from './storefronts.js'

export type {
  CertificateStatus,
  CreateStorefrontInput,
  CustomDomainChallenge,
  CustomDomainStatus,
  CustomDomainVerificationResult,
  StorefrontRecord,
  StorefrontStatus,
  StorefrontTheme,
  ThemeLayoutPreset,
  UpdateStorefrontInput,
} from './storefronts.js'

export { withWorkspaceId, workspaceContext } from './workspace-context.js'

export type { WorkspaceContext } from './workspace-context.js'
