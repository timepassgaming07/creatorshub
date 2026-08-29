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
import * as auditLogRepo from './audit-log.js'
import * as ledgerRepo from './ledger.js'
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
  'workspace-members': workspaceMembersRepo,
  'audit-log': auditLogRepo,
  workspaces: workspacesRepo,
  ledger: ledgerRepo,
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
}
