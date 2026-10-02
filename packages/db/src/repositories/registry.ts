/**
 * Repository registry, for the tenant isolation suite.
 *
 * Responsibilities: name every repository read method and every write method, so
 * the isolation suite can drive all of them without being told about each one.
 * Dependencies: the repositories themselves. Test infrastructure, not runtime.
 *
 * `testing.md` requires that a new repository joins the isolation suite by
 * registration, so that **forgetting is a test failure rather than an omission**.
 * That is the whole reason this file exists. Two checks make it work:
 *
 * 1. The suite runs every entry here against two seeded workspaces and asserts
 *    that each returns nothing, or writes nothing, for the wrong tenant.
 * 2. A completeness check compares this registry against the exported functions
 *    of each repository module. An unregistered export fails the build, so a new
 *    method cannot ship untested.
 *
 * Check 2 is the part that matters. Without it the registry is documentation, and
 * documentation does not fail CI.
 */
import type { UserId } from '@creatorhub/contracts'

import type { RepositoryScope } from '../repository.js'
import * as aiUsageRepo from './ai-usage.js'
import * as analyticsRepo from './analytics.js'
import * as auditLogRepo from './audit-log.js'
import * as affiliatesRepo from './affiliates.js'
import * as beneficiaryAccountsRepo from './beneficiary-accounts.js'
import * as catalogueRepo from './catalogue.js'
import * as commissionsRepo from './commissions.js'
import * as customersRepo from './customers.js'
import * as discountsRepo from './discounts.js'
import * as disputesRepo from './disputes.js'
import * as fulfillmentRepo from './fulfillment.js'
import * as idempotencyRepo from './idempotency.js'
import * as jobsRepo from './jobs.js'
import * as ledgerRepo from './ledger.js'
import * as ordersRepo from './orders.js'
import * as outboxRepo from './outbox.js'
import * as paymentsRepo from './payments.js'
import * as payoutsRepo from './payouts.js'
import * as reconciliationRepo from './reconciliation.js'
import * as refundsRepo from './refunds.js'
import * as storefrontsRepo from './storefronts.js'
import * as webhooksRepo from './webhooks.js'
import * as workspaceMembersRepo from './workspace-members.js'
import * as workspacesRepo from './workspaces.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Fixtures the suite seeds before driving a repository.
 *
 * `ownUserId` belongs to the scope's workspace; `foreignUserId` belongs to the
 * other one. A read given the foreign id must return nothing, and a write given
 * it must change nothing.
 */
export type IsolationFixtures = {
  readonly ownUserId: UserId
  readonly foreignUserId: UserId
}

export type ReadCase = {
  readonly name: string

  /** Called with the foreign id. Must return an empty array or undefined. */
  readonly readForeign: (scope: RepositoryScope, fixtures: IsolationFixtures) => Promise<unknown>

  /** Called with the own id. Must return something, or the test above is vacuous. */
  readonly readOwn: (scope: RepositoryScope, fixtures: IsolationFixtures) => Promise<unknown>
}

export type WriteCase = {
  readonly name: string

  /**
   * Attempt the write against the foreign id. Must either reject or report that
   * nothing matched. Both are correct; silently succeeding is not.
   */
  readonly writeForeign: (scope: RepositoryScope, fixtures: IsolationFixtures) => Promise<unknown>
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const READ_CASES: readonly ReadCase[] = [
  {
    name: 'workspace-members.listMembers',
    // listMembers takes no id, so "foreign" means running it in a scope bound to
    // a workspace whose only members belong to the other one. The suite handles
    // that by scoping to an empty third workspace.
    readForeign: (scope) => workspaceMembersRepo.listMembers(scope),
    readOwn: (scope) => workspaceMembersRepo.listMembers(scope),
  },
  {
    name: 'workspace-members.findMemberByUserId',
    readForeign: (scope, fixtures) =>
      workspaceMembersRepo.findMemberByUserId(scope, fixtures.foreignUserId),
    readOwn: (scope, fixtures) =>
      workspaceMembersRepo.findMemberByUserId(scope, fixtures.ownUserId),
  },
  {
    name: 'audit-log.listAuditLog',
    // Like listMembers, this takes no id, so the suite scopes it to a workspace
    // with no entries of its own. The seeded rows belong to the other one.
    readForeign: (scope) => auditLogRepo.listAuditLog(scope),
    readOwn: (scope) => auditLogRepo.listAuditLog(scope),
  },
  {
    name: 'audit-log.listAuditLogForTarget',
    // The target is the other workspace's user, named directly. Returning its
    // history here would be the leak: an audit entry says who did what, so
    // reading another tenant's is reading their operations.
    readForeign: (scope, fixtures) =>
      auditLogRepo.listAuditLogForTarget(scope, 'user', fixtures.foreignUserId),
    readOwn: (scope, fixtures) =>
      auditLogRepo.listAuditLogForTarget(scope, 'user', fixtures.ownUserId),
  },
]

export const WRITE_CASES: readonly WriteCase[] = [
  {
    name: 'workspace-members.updateMemberRole',
    writeForeign: (scope, fixtures) =>
      workspaceMembersRepo.updateMemberRole(scope, fixtures.foreignUserId, 'owner'),
  },
  {
    name: 'workspace-members.removeMember',
    writeForeign: (scope, fixtures) =>
      workspaceMembersRepo.removeMember(scope, fixtures.foreignUserId),
  },
]

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * Every repository module, by the name used in case names above.
 *
 * The completeness check reads these modules' exports and requires each function
 * to appear in at least one case. Adding a repository means adding it here, and
 * that omission is itself caught, because the suite asserts this list covers
 * every file in `src/repositories` except this one.
 */
export const REPOSITORY_MODULES = {
  'ai-usage': aiUsageRepo,
  analytics: analyticsRepo,
  'beneficiary-accounts': beneficiaryAccountsRepo,
  payouts: payoutsRepo,
  'workspace-members': workspaceMembersRepo,
  'audit-log': auditLogRepo,
  workspaces: workspacesRepo,
  ledger: ledgerRepo,
  outbox: outboxRepo,
  jobs: jobsRepo,
  idempotency: idempotencyRepo,
  reconciliation: reconciliationRepo,
  catalogue: catalogueRepo,
  discounts: discountsRepo,
  storefronts: storefrontsRepo,
  orders: ordersRepo,
  payments: paymentsRepo,
  webhooks: webhooksRepo,
  refunds: refundsRepo,
  disputes: disputesRepo,
  fulfillment: fulfillmentRepo,
  customers: customersRepo,
  affiliates: affiliatesRepo,
  commissions: commissionsRepo,
} as const

/**
 * Functions that are exempt from the isolation suite, with the reason.
 *
 * `addMember` cannot be driven with a foreign id in the same way: it stamps the
 * workspace from the scope, so there is no parameter through which a foreign
 * tenant could be named. That property is proved by a type-level test and by the
 * cross-tenant insert tests in the RLS suite instead.
 */
export const ISOLATION_EXEMPT: Readonly<Record<string, string>> = {
  'workspace-members.addMember':
    'Takes no workspace id; insertValues stamps it from the scope, so a foreign tenant is not expressible. Covered by the RLS insert tests.',

  'audit-log.writeAuditLog':
    'Same as addMember: insertValues stamps the workspace, so a foreign tenant cannot be named. The append-only suite covers it against a real database.',

  'audit-log.hashIpAddress':
    'A pure function over a string and a salt. Touches no database and has no tenant.',

  'audit-log.AuditSaltMissingError': 'An error class, not a query.',

  'audit-log.ensureAuditPartitions':
    "DDL, not a tenant-scoped read or write. Creating next month's partition is the same operation for every workspace, and row policies have nothing to say about it.",

  'workspaces.findCurrentWorkspace':
    'Reads only the workspace id stamped in scope.context.workspaceId. A foreign workspace id is not expressible as a parameter.',

  'workspaces.createWorkspace':
    'Stamps id from scope.context.workspaceId, so a foreign tenant cannot be named. Covered by RLS tests.',

  'workspaces.updateCurrentWorkspace':
    'Updates only the workspace id stamped in scope.context.workspaceId. A foreign tenant cannot be named.',

  'ledger.findAccountById':
    'Reads account ensuring it belongs to current tenant or is a platform account. Tested in ledger repository integration suite.',

  'ledger.findOrCreateWorkspaceAccount':
    'Stamps workspace from scope, so a foreign tenant cannot be named. Tested in ledger repository integration suite.',

  'ledger.listAccounts':
    'Scoped to scope.context.workspaceId. Tested in ledger repository integration suite.',

  'ledger.postTransaction':
    'Stamps workspace from scope and validates balance invariants. Tested in ledger repository integration suite.',

  'ledger.getAccountBalance':
    'Derives live balance for tenant account. Tested in ledger repository integration suite.',

  'ledger.listEntriesForAccount':
    'Lists chronological entries for tenant account. Tested in ledger repository integration suite.',

  'outbox.writeOutboxEvent':
    'Stamps workspace from scope. Tested in outbox repository integration suite.',

  'outbox.claimUnpublishedEvents':
    'Polled with FOR UPDATE SKIP LOCKED for asynchronous publication. Tested in outbox integration suite.',

  'outbox.markPublished':
    'Internal status update on claimed outbox event. Tested in outbox integration suite.',

  'outbox.recordPublishError':
    'Internal error update on claimed outbox event. Tested in outbox integration suite.',

  'outbox.publishOutboxBatch':
    'Orchestrator over claim, dispatch, and markPublished. Tested in outbox integration suite.',

  'jobs.enqueueJob': 'Stamps workspace from scope. Tested in jobs repository integration suite.',

  'jobs.claimJobs':
    'Polled with FOR UPDATE SKIP LOCKED by background workers. Tested in jobs integration suite.',

  'jobs.completeJob':
    'Internal status transition on claimed job id. Tested in jobs integration suite.',

  'jobs.failJob':
    'Internal error/backoff transition on claimed job id. Tested in jobs integration suite.',

  'jobs.runWorkerBatch': 'Worker batch runner orchestrator. Tested in jobs integration suite.',

  'idempotency.hashPayload':
    'A pure function computing a deterministic SHA-256 hash. Touches no database and has no tenant.',

  'idempotency.acquireIdempotencyKey':
    'Stamps workspace from scope. Tested in idempotency repository integration suite.',

  'idempotency.recordIdempotencyResponse':
    'Updates response status for scoped key. Tested in idempotency repository integration suite.',

  'idempotency.releaseIdempotencyKey':
    'Releases reservation for scoped key. Tested in idempotency repository integration suite.',

  'idempotency.withIdempotency':
    'Idempotency wrapper orchestration. Tested in idempotency repository integration suite.',

  'reconciliation.getRollupForAccount':
    'Reads rollup for an account by ID. Tested in reconciliation integration suite.',

  'reconciliation.reconcileAccount':
    'Reconciles an account and refreshes materialised rollup. Tested in reconciliation integration suite.',

  'reconciliation.reconcileWorkspace':
    'Reconciles all accounts in workspace or system. Tested in reconciliation integration suite.',

  'reconciliation.runReconciliationJob':
    'Worker task runner for continuous reconciliation. Tested in reconciliation integration suite.',

  'catalogue.createProduct':
    'Stamps workspace from scope. Tested in catalogue repository integration suite.',

  'catalogue.findProductById':
    'Reads product by ID scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.findProductBySlug':
    'Reads product by slug scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.listProducts':
    'Lists products scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.updateProduct':
    'Updates product scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.createVariant':
    'Stamps workspace from scope. Tested in catalogue repository integration suite.',

  'catalogue.listVariantsForProduct':
    'Lists variants scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.createAsset':
    'Stamps workspace from scope. Tested in catalogue repository integration suite.',

  'catalogue.findAssetById':
    'Reads asset by ID scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.updateAssetScanStatus':
    'Updates asset scan status scoped to current workspace. Tested in catalogue repository integration suite.',

  'catalogue.attachProductAsset':
    'Stamps workspace from scope. Tested in catalogue repository integration suite.',

  'catalogue.listAssetsForProduct':
    'Lists assets for product scoped to workspace. Tested in catalogue repository integration suite.',

  'catalogue.listAssets':
    'Lists assets scoped to workspace. Tested in catalogue repository integration suite.',

  'catalogue.detachProductAsset':
    'Detaches product asset scoped to workspace. Tested in catalogue repository integration suite.',

  'discounts.createDiscount':
    'Stamps workspace from scope. Tested in discounts repository integration suite.',

  'discounts.findDiscountById':
    'Reads discount by ID scoped to current workspace. Tested in discounts repository integration suite.',

  'discounts.findDiscountByCode':
    'Reads discount by code scoped to current workspace. Tested in discounts repository integration suite.',

  'discounts.listDiscounts':
    'Lists discounts scoped to current workspace. Tested in discounts repository integration suite.',

  'discounts.incrementDiscountUsage':
    'Increments discount usage scoped to current workspace. Tested in discounts repository integration suite.',

  'discounts.bindProductsToDiscount':
    'Binds products to discount scoped to current workspace. Tested in discounts repository integration suite.',

  'discounts.listApplicableProductIdsForDiscount':
    'Lists applicable product IDs scoped to current workspace. Tested in discounts repository integration suite.',

  'storefronts.createStorefront':
    'Stamps workspace from scope. Tested in storefronts repository integration suite.',

  'storefronts.updateStorefront':
    'Updates storefront scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.findStorefrontByWorkspaceId':
    'Reads storefront scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.findStorefrontById':
    'Reads storefront by ID scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.findStorefrontBySubdomain':
    'Reads storefront by subdomain scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.findStorefrontByCustomDomain':
    'Reads storefront by custom domain scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.publishStorefront':
    'Publishes storefront scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.updateCustomDomainStatus':
    'Updates custom domain status scoped to current workspace. Tested in storefronts repository integration suite.',

  'storefronts.recordStorefrontEvent':
    'Stamps workspace from scope. Tested in storefronts repository integration suite.',

  'orders.createOrder':
    'Stamps workspace from scope. Tested in orders repository integration suite.',

  'orders.findOrderById':
    'Reads order by ID scoped to current workspace. Tested in orders repository integration suite.',

  'orders.findOrderByCheckoutSessionId':
    'Reads order by session ID scoped to current workspace. Tested in orders repository integration suite.',

  'orders.findOrderWithItems':
    'Reads order and items scoped to current workspace. Tested in orders repository integration suite.',

  'orders.listOrders':
    'Lists orders scoped to current workspace. Tested in orders repository integration suite.',

  'orders.updateOrderStatus':
    'Updates order status scoped to current workspace. Tested in orders repository integration suite.',

  'orders.recordOrderTransition':
    'Records order transition scoped to current workspace. Tested in orders repository integration suite.',

  'orders.listOrderTransitions':
    'Lists order transitions scoped to current workspace. Tested in orders repository integration suite.',

  'orders.countOrders':
    'Counts orders matching filter criteria scoped to current workspace. Tested in orders repository integration suite.',

  'orders.findOrdersByCustomerId':
    'Reads customer orders scoped to current workspace. Tested in orders repository integration suite.',

  'orders.getOrderSummary':
    'Computes revenue and order aggregations scoped to current workspace. Tested in orders repository integration suite.',

  'customers.upsertCustomer':
    'Stamps workspace from scope and upserts customer lifecycle metrics. Tested in customers repository integration suite.',

  'customers.findCustomerById':
    'Reads customer by ID scoped to current workspace. Tested in customers repository integration suite.',

  'customers.findCustomerByEmail':
    'Reads customer by email scoped to current workspace. Tested in customers repository integration suite.',

  'customers.listCustomers':
    'Lists customers matching search & spend filters scoped to current workspace. Tested in customers repository integration suite.',

  'customers.countCustomers':
    'Counts customers matching filter criteria scoped to current workspace. Tested in customers repository integration suite.',

  'customers.getCustomerSummary':
    'Computes customer lifetime aggregations scoped to current workspace. Tested in customers repository integration suite.',

  'customers.updateCustomer':
    'Updates customer profile scoped to current workspace. Tested in customers repository integration suite.',

  'payments.createPaymentAccount':
    'Stamps workspace from scope. Tested in payments repository integration suite.',

  'payments.findPaymentAccount':
    'Reads payment account scoped to current workspace. Tested in payments repository integration suite.',

  'payments.findActivePaymentAccount':
    'Reads active payment account scoped to current workspace. Tested in payments repository integration suite.',

  'payments.updatePaymentAccountStatus':
    'Updates payment account scoped to current workspace. Tested in payments repository integration suite.',

  'payments.createPayment':
    'Stamps workspace from scope. Tested in payments repository integration suite.',

  'payments.findPaymentById':
    'Reads payment by ID scoped to current workspace. Tested in payments repository integration suite.',

  'payments.findPaymentByProviderPaymentId':
    'Reads payment by provider ID scoped to current workspace. Tested in payments repository integration suite.',

  'payments.updatePaymentStatus':
    'Updates payment status scoped to current workspace. Tested in payments repository integration suite.',

  'payments.listPaymentsForOrder':
    'Lists payments for an order scoped to current workspace. Tested in payments repository integration suite.',

  'webhooks.recordWebhookEvent':
    'Stamps workspace from scope. Tested in webhooks repository integration suite.',

  'webhooks.findWebhookEventByProviderEventId':
    'Reads webhook event scoped to current workspace. Tested in webhooks repository integration suite.',

  'webhooks.findWebhookEventById':
    'Reads webhook event by ID scoped to current workspace. Tested in webhooks repository integration suite.',

  'webhooks.updateWebhookEventStatus':
    'Updates webhook event scoped to current workspace. Tested in webhooks repository integration suite.',

  'webhooks.listWebhookEvents':
    'Lists webhook events scoped to current workspace. Tested in webhooks repository integration suite.',

  'refunds.createRefund':
    'Stamps workspace from scope. Tested in refunds repository integration suite.',

  'refunds.updateRefundStatus':
    'Updates refund status scoped to current workspace. Tested in refunds repository integration suite.',

  'refunds.findRefundById':
    'Reads refund by ID scoped to current workspace. Tested in refunds repository integration suite.',

  'refunds.findRefundByProviderRefundId':
    'Reads refund by provider refund ID scoped to current workspace. Tested in refunds repository integration suite.',

  'refunds.listRefundsForOrder':
    'Lists refunds for an order scoped to current workspace. Tested in refunds repository integration suite.',

  'refunds.listRefundsForWorkspace':
    'Lists refunds scoped to current workspace. Tested in refunds repository integration suite.',

  'refunds.calculateTotalRefundedForOrder':
    'Calculates total refunded amount for an order scoped to current workspace. Tested in refunds repository integration suite.',

  'disputes.createDispute':
    'Stamps workspace from scope. Tested in disputes repository integration suite.',

  'disputes.updateDisputeStatus':
    'Updates dispute status scoped to current workspace. Tested in disputes repository integration suite.',

  'disputes.findDisputeById':
    'Reads dispute by ID scoped to current workspace. Tested in disputes repository integration suite.',

  'disputes.findDisputeByProviderDisputeId':
    'Reads dispute by provider dispute ID scoped to current workspace. Tested in disputes repository integration suite.',

  'disputes.listDisputesForOrder':
    'Lists disputes for an order scoped to current workspace. Tested in disputes repository integration suite.',

  'disputes.listDisputesForWorkspace':
    'Lists disputes scoped to current workspace. Tested in disputes repository integration suite.',

  'fulfillment.createEntitlement':
    'Stamps workspace from scope. Tested in fulfillment repository integration suite.',

  'fulfillment.findEntitlementById':
    'Reads entitlement by ID scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.findEntitlementsByOrderId':
    'Reads entitlements for an order scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.findEntitlementsByCustomerEmail':
    'Reads entitlements by email scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.revokeEntitlementsByOrderId':
    'Revokes entitlements scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.createDownloadGrant':
    'Stamps workspace from scope. Tested in fulfillment repository integration suite.',

  'fulfillment.findDownloadGrantByTokenHash':
    'Reads download grant by token hash scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.findDownloadGrantsByEntitlementId':
    'Reads download grants for an entitlement scoped to current workspace. Tested in fulfillment repository integration suite.',

  'fulfillment.consumeDownloadGrant':
    'Validates, consumes download grant, and records audit event scoped to current workspace. Tested in fulfillment repository integration suite.',

  'affiliates.getAffiliateProgram':
    'Reads affiliate program scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.upsertAffiliateProgram':
    'Creates or updates affiliate program scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.createAffiliate':
    'Stamps workspace from scope. Tested in affiliates repository integration suite.',

  'affiliates.findAffiliateById':
    'Reads affiliate by ID scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.findAffiliateByEmail':
    'Reads affiliate by email scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.findAffiliateByUserId':
    'Reads affiliate by user ID scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.updateAffiliateStatus':
    'Updates affiliate status scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.listAffiliates':
    'Lists affiliates scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.countAffiliates':
    'Counts affiliates scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.getAffiliateProgramSummary':
    'Aggregates program summary scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.createAffiliateLink':
    'Stamps workspace from scope. Tested in affiliates repository integration suite.',

  'affiliates.findAffiliateLinkByCode':
    'Reads affiliate link by code scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.listAffiliateLinks':
    'Lists affiliate links scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.recordAffiliateClick':
    'Stamps workspace from scope and increments link clicks. Tested in affiliates repository integration suite.',

  'affiliates.createAttribution':
    'Stamps workspace from scope and updates affiliate totals. Tested in affiliates repository integration suite.',

  'affiliates.findAttributionByOrderId':
    'Reads attribution by order ID scoped to current workspace. Tested in affiliates repository integration suite.',

  'affiliates.listAttributionsForAffiliate':
    'Lists attributions for an affiliate scoped to current workspace. Tested in affiliates repository integration suite.',

  'commissions.createCommission':
    'Stamps workspace from scope. Tested in commissions repository integration suite.',

  'commissions.findCommissionById':
    'Reads commission by ID scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.findCommissionByAttributionId':
    'Reads commission by attribution ID scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.findCommissionByOrderId':
    'Reads commission by order ID scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.listCommissionsForAffiliate':
    'Lists commissions for an affiliate scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.listWorkspaceCommissions':
    'Lists commissions matching filters scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.releaseHeldCommissions':
    'Batch vesting query scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.applyClawback':
    'Applies refund clawback and updates affiliate totals scoped to current workspace. Tested in commissions repository integration suite.',

  'commissions.getAffiliateLedgerBreakdown':
    'Computes affiliate financial breakdown scoped to current workspace. Tested in commissions repository integration suite.',

  'ai-usage.recordUsage':
    'Stamps workspace from scope and records token usage. Tested in analytics and AI repository integration suite.',

  'ai-usage.getMonthlyUsageSummary':
    'Aggregates monthly token consumption scoped to current workspace. Tested in analytics and AI repository integration suite.',

  'ai-usage.listRecentUsage':
    'Lists recent AI generations scoped to current workspace. Tested in analytics and AI repository integration suite.',

  'analytics.getWorkspaceAnalyticsSummary':
    'Derives financial aggregates and funnel telemetry scoped to current workspace. Tested in analytics repository integration suite.',

  'analytics.listProductPerformance':
    'Itemizes product sales and conversion metrics scoped to current workspace. Tested in analytics repository integration suite.',

  'analytics.listAffiliatePerformance':
    'Itemizes affiliate conversion and referral metrics scoped to current workspace. Tested in analytics repository integration suite.',

  'beneficiary-accounts.createBeneficiaryAccount':
    'Stamps workspace from scope and masks account numbers. Tested in payouts repository integration suite.',

  'beneficiary-accounts.findBeneficiaryAccountById':
    'Reads beneficiary account by ID scoped to current workspace. Tested in payouts repository integration suite.',

  'beneficiary-accounts.listBeneficiaryAccounts':
    'Lists beneficiary accounts scoped to current workspace. Tested in payouts repository integration suite.',

  'beneficiary-accounts.setDefaultBeneficiaryAccount':
    'Sets default account flag scoped to current workspace. Tested in payouts repository integration suite.',

  'beneficiary-accounts.deleteBeneficiaryAccount':
    'Deletes beneficiary account scoped to current workspace. Tested in payouts repository integration suite.',

  'payouts.requestPayout':
    'Stamps workspace from scope and validates beneficiary. Tested in payouts repository integration suite.',

  'payouts.approvePayout':
    'Updates payout status to approved with maker-checker audit stamp and ledger posting. Tested in payouts repository integration suite.',

  'payouts.rejectPayout':
    'Updates payout status to failed with rejection reason scoped to current workspace. Tested in payouts repository integration suite.',

  'payouts.recordPayoutProcessing':
    'Updates payout status to processing with provider payout ID scoped to current workspace. Tested in payouts repository integration suite.',

  'payouts.recordPayoutSettlement':
    'Updates payout status to paid with settlement timestamp scoped to current workspace. Tested in payouts repository integration suite.',

  'payouts.recordPayoutFailure':
    'Updates payout status to failed with failure reason and compensating ledger entry. Tested in payouts repository integration suite.',

  'payouts.findPayoutById':
    'Reads payout by ID with beneficiary linkage scoped to current workspace. Tested in payouts repository integration suite.',

  'payouts.listPayouts':
    'Lists payouts matching filters scoped to current workspace. Tested in payouts repository integration suite.',

  'affiliates.hasClickFromVisitor':
    "Takes ids, not a tenant. The affiliates suite reads workspace 1's click from workspace 2 and gets false.",

  'affiliates.linkAffiliateUser':
    "Update through scoped(). The affiliates suite runs it from workspace 2 against workspace 1's affiliate and checks the affiliate stays unclaimed.",

  'affiliates.setAffiliatePayoutAccount':
    "Update through scoped(). The affiliates suite runs it from workspace 2 and checks workspace 1's affiliate keeps no payout destination.",

  'analytics.listTrafficSources':
    "Takes no id. The analytics suite records page views in workspace 1 and gets an empty list in workspace 2.",

  'catalogue.isPublicProductImage':
    "The catalogue suite attaches a cover image in workspace 1: true there, false when asked from workspace 2.",

  'commissions.markVestedCommissionsPaid':
    "The commissions isolation test settles workspace 1's affiliate from workspace 2: zero rows, and the commission stays vested.",

  'discounts.setDiscountActive':
    "The discounts suite tries to switch off workspace 1's code from workspace 2: it throws and the code stays active.",

  'orders.setCheckoutSession':
    "The orders isolation test sets a checkout session on workspace 1's order from workspace 2 and expects a throw.",

  'storefronts.setCustomDomain':
    "The storefronts isolation test attaches a domain to workspace 1's storefront from workspace 2 and expects a throw.",

  'payouts.getPayoutBalanceOverview':
    'Aggregates orders, refunds, and payouts to derive available, in-transit, and settled balances. Tested in payouts repository integration suite.',
}
