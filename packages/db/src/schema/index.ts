/**
 * Schema barrel.
 *
 * Every table in the system is re-exported here, and drizzle-kit reads this file
 * to generate migrations. A table that is not reachable from here does not exist
 * as far as migration generation is concerned, which is a silent omission, so new
 * schema files are added here in the same commit that creates them.
 */
export {
  NON_TENANT_TABLES,
  TENANT_TABLES,
  auditActorType,
  auditLogs,
  users,
  workspaceMembers,
  workspaceRole,
  workspaceStatus,
  workspaces,
} from './identity.js'

export {
  AUTH_TABLES_WITHOUT_WORKSPACE,
  accounts,
  passkeys,
  rateLimits,
  sessions,
  verificationTokens,
} from './auth.js'

export {
  ledgerAccountKind,
  ledgerAccountOwnerType,
  ledgerAccounts,
  ledgerEntries,
  ledgerEntryDirection,
  ledgerTransactionKind,
  ledgerTransactions,
  type LedgerAccount,
  type LedgerEntry,
  type LedgerTransaction,
  type NewLedgerAccount,
  type NewLedgerEntry,
  type NewLedgerTransaction,
} from './ledger.js'

export { outbox, type NewOutboxRecord, type OutboxRecord } from './outbox.js'

export { jobStatus, jobs, type JobTableRecord, type NewJobTableRecord } from './jobs.js'

export {
  idempotencyKeys,
  type IdempotencyKeyRecord,
  type NewIdempotencyKeyRecord,
} from './idempotency.js'

export {
  ledgerBalanceRollups,
  type LedgerBalanceRollupRecord,
  type NewLedgerBalanceRollupRecord,
} from './reconciliation.js'

export {
  assetScanStatus,
  assets,
  productAssetRole,
  productAssets,
  productStatus,
  productVariants,
  productVisibility,
  products,
  variantInventoryPolicy,
  type AssetRecord,
  type NewAssetRecord,
  type NewProductAssetRecord,
  type NewProductRecord,
  type NewProductVariantRecord,
  type ProductAssetRecord,
  type ProductRecord,
  type ProductVariantRecord,
} from './catalogue.js'

export {
  discountProducts,
  discountType,
  discounts,
  type DiscountProductRecord,
  type DiscountRecord,
  type NewDiscountProductRecord,
  type NewDiscountRecord,
} from './discounts.js'

export {
  customDomainStatus,
  storefrontEventType,
  storefrontEvents,
  storefrontStatus,
  storefronts,
  type NewStorefrontEventRow,
  type NewStorefrontRecord,
  type StorefrontEventRow,
  type StorefrontRecord,
} from './storefronts.js'

export {
  orderItems,
  orderPaymentStatus,
  orderStatus,
  orderTransitionActorType,
  orderTransitions,
  orders,
  type NewOrderItemRecord,
  type NewOrderRecord,
  type NewOrderTransitionRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderTransitionRecord,
} from './orders.js'

export {
  paymentAccountStatus,
  paymentAccounts,
  paymentProvider,
  paymentStatus,
  payments,
  type NewPaymentAccountRecord,
  type NewPaymentRowRecord,
  type PaymentAccountRecord,
  type PaymentRowRecord,
} from './payments.js'

export {
  webhookEventStatus,
  webhookEvents,
  type NewWebhookEventRecord,
  type WebhookEventRecord,
} from './webhooks.js'

export { refundStatus, refunds, type NewRefundRecord, type RefundRecord } from './refunds.js'

export { disputeStatus, disputes, type DisputeRecord, type NewDisputeRecord } from './disputes.js'

export { downloadEvents, downloadGrants, entitlementStatus, entitlements } from './fulfillment.js'

export { customers, type CustomerRecord, type NewCustomerRecord } from './customers.js'

export {
  affiliateClicks,
  affiliateLinks,
  affiliatePrograms,
  affiliates,
  attributions,
  type AffiliateClickRow,
  type AffiliateLinkRow,
  type AffiliateProgramRow,
  type AffiliateRow,
  type AttributionRow,
  type NewAffiliateClickRow,
  type NewAffiliateLinkRow,
  type NewAffiliateProgramRow,
  type NewAffiliateRow,
  type NewAttributionRow,
} from './affiliates.js'

export {
  commissionClawbacks,
  commissions,
  type CommissionClawbackRow,
  type CommissionRow,
  type NewCommissionClawbackRow,
  type NewCommissionRow,
} from './commissions.js'

export { aiUsage, type AiUsageRow, type InsertAiUsageRow } from './ai.js'

export {
  beneficiaryAccounts,
  payoutItems,
  payouts,
  type BeneficiaryAccount,
  type NewBeneficiaryAccount,
  type NewPayout,
  type NewPayoutItem,
  type Payout,
  type PayoutItem,
} from './payouts.js'
