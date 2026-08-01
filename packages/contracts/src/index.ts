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
  requestId,
  requestIdSchema,
  userId,
  userIdSchema,
  workspaceId,
  workspaceIdSchema,
} from './identifiers.js'

export type { RequestId, UserId, WorkspaceId } from './identifiers.js'

export { withWorkspaceId, workspaceContext } from './workspace-context.js'

export type { WorkspaceContext } from './workspace-context.js'
