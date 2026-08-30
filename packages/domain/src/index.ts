/**
 * @creatorhub/domain — business rules, and nothing else.
 *
 * Responsibilities: pricing, order state, commission, attribution, entitlement —
 * every rule that would still be true if we changed database, framework, and
 * payment provider on the same day.
 *
 * Dependencies: @creatorhub/contracts, and zod. Nothing else, by lint rule.
 *
 * This package declares the interfaces it needs (ports) and never learns how
 * they are implemented. The composition root in apps/web supplies the
 * implementations. See ADR-0002 and ADR-0007; the enforcement lives in
 * @creatorhub/config/eslint/domain.
 *
 * Modules are added here as their slices land. Only this file is public.
 */
export {
  UNEXPECTED,
  all,
  domainError,
  err,
  flatMap,
  isErr,
  isOk,
  map,
  mapError,
  ok,
  unwrapOr,
} from './result.js'

export type { DomainError, Result } from './result.js'

/**
 * Authorisation (ADR-0006, item 1.8). Pure functions over a role and a
 * permission. Deliberately not delegated to the auth library, which knows who
 * someone is and nothing about what they may do.
 */
export {
  WORKSPACE_ROLES,
  authorise,
  can,
  permissionsFor,
  roleFromString,
} from './identity/policy.js'

export type { Membership, Permission, WorkspaceRole } from './identity/policy.js'

/**
 * Double-entry ledger invariants and postings (ADR-0008, item 2.4, 2.5).
 */
export { deriveAccountBalance, validateBalancedTransaction } from './ledger/invariants.js'

export {
  createDisputePosting,
  createOrderPaymentPosting,
  createPayoutPosting,
  createRefundPosting,
  type DisputePostingParams,
  type OrderPaymentPostingParams,
  type PayoutPostingParams,
  type RefundPostingParams,
} from './ledger/postings.js'

/**
 * Catalogue pricing and currency calculation rules (Item 3.5).
 */
export {
  InvalidPricingError,
  calculateSavings,
  resolveEffectivePrice,
  validateProductPricing,
  type DiscountSavings,
  type ProductPriceInput,
  type VariantPriceInput,
} from './catalogue/pricing.js'

/**
 * Discount evaluation domain rules (Item 3.6).
 */
export {
  evaluateDiscount,
  type DiscountEvaluationFailure,
  type DiscountEvaluationResult,
  type DiscountEvaluationSuccess,
} from './catalogue/discounts.js'

/**
 * Order and payment state machine (Slice 5 §5.3).
 */
export {
  INVALID_ORDER_TRANSITION,
  INVALID_PAYMENT_TRANSITION,
  ORDER_TRANSITION_GRAPH,
  PAYMENT_STATUS_TRANSITION_GRAPH,
  UNAUTHORIZED_ORDER_TRANSITION,
  canTransitionOrderStatus,
  canTransitionPaymentStatus,
  isOrderPaid,
  isOrderTerminal,
  isPaymentTerminal,
  transitionOrderStatus,
  transitionPaymentStatus,
  type InvalidOrderTransitionError,
  type InvalidPaymentTransitionError,
  type UnauthorizedOrderTransitionError,
} from './orders/state-machine.js'

/**
 * Server-authoritative order pricing (Slice 5 §5.4).
 */
export {
  CURRENCY_MISMATCH,
  EMPTY_ORDER,
  INVALID_ORDER_QUANTITY,
  PRICING_CALCULATION_ERROR,
  PRODUCT_NOT_PURCHASABLE,
  calculateServerOrderPricing,
  type CalculateOrderPricingInput,
  type CalculatedLineItem,
  type CalculatedOrderPricing,
  type CheckoutItemInput,
  type ServerProductPriceInfo,
} from './orders/pricing.js'

/**
 * Tax calculation and GST compliance (Slice 5 §5.5).
 */
export {
  GSTIN_REGEX,
  INVALID_GSTIN,
  INVALID_TAXABLE_AMOUNT,
  calculateOrderTax,
  validateGstin,
  type CalculateTaxParams,
  type CalculatedTaxBreakdown,
  type TaxComponent,
  type TaxScheme,
} from './orders/tax.js'

/**
 * Affiliate attribution and commission invariants (Slice 8 §8.4, §8.5, §8.6, §8.7).
 */
export {
  DEFAULT_WINDOW_DAYS,
  MAX_COMMISSION_BPS,
  MIN_COMMISSION_BPS,
  MS_PER_DAY,
  calculateCommissionMinor,
  evaluateAttribution,
  isClickWithinWindow,
  isSelfReferral,
  type AttributionDecision,
  type EvaluateAttributionParams,
} from './affiliates/attribution.js'

