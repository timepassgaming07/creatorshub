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
  createOrderPaymentPosting,
  createPayoutPosting,
  createRefundPosting,
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
