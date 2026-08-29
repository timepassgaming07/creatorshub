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
