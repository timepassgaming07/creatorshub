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
  jobId,
  jobIdSchema,
  ledgerAccountId,
  ledgerAccountIdSchema,
  ledgerEntryId,
  ledgerEntryIdSchema,
  ledgerTransactionId,
  ledgerTransactionIdSchema,
  requestId,
  requestIdSchema,
  userId,
  userIdSchema,
  workspaceId,
  workspaceIdSchema,
} from './identifiers.js'

export type {
  JobId,
  LedgerAccountId,
  LedgerEntryId,
  LedgerTransactionId,
  RequestId,
  UserId,
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

export { withWorkspaceId, workspaceContext } from './workspace-context.js'

export type { WorkspaceContext } from './workspace-context.js'
