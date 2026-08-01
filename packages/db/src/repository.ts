/**
 * Tenant-scoped repository base.
 *
 * Responsibilities: give every repository its tenant predicate for free, and
 * make writing a query without one impossible.
 * Dependencies: drizzle-orm, contracts.
 *
 * This is ADR-0012 layer 1. RLS in migration 0001 is layer 2, and the two are
 * independent by construction: this file adds a WHERE clause, Postgres applies a
 * policy, and neither knows about the other. A leak needs both to fail at once.
 *
 * The design rule is that the tenant predicate is not something a caller
 * remembers to add. `scoped()` returns the predicate already built, and
 * `insertValues()` returns the row already stamped. A repository method that
 * wanted to omit the tenant would have to go out of its way, and the isolation
 * suite in 1.12 would fail it.
 *
 * Deliberately thin. It is a set of helpers over a transaction, not a base class
 * with inherited query methods, because an inheritance hierarchy over data
 * access is how a `findAll()` that nobody scoped ends up in the parent.
 */
import type { WorkspaceContext, WorkspaceId } from '@creatorhub/contracts'
import { and, eq, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { TenantTransaction } from './client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A table that carries `workspace_id`.
 *
 * Structural, so a table missing the column cannot be passed to a tenant-scoped
 * repository at all. That is a compile error rather than a runtime surprise, and
 * it is why `users` and `workspaces` need their own handling: they genuinely do
 * not have the column, and the type system says so.
 */
export type TenantTable = PgTable & {
  workspaceId: PgColumn
}

/**
 * Everything a repository needs, and nothing it does not.
 *
 * It holds the transaction rather than the pool, so a repository cannot outlive
 * the transaction whose tenant setting makes RLS work. Constructing one outside
 * `withWorkspace` is not possible, because that is the only source of a
 * `TenantTransaction`.
 */
export type RepositoryScope = {
  readonly tx: TenantTransaction
  readonly context: WorkspaceContext
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a write names a workspace other than the scope's.
 *
 * A programming error, not a domain outcome, so it throws rather than returning
 * a Result: no user action produces it and no caller can sensibly recover. RLS
 * would reject the same write, but this fails earlier and says which workspace
 * was expected, which turns a Postgres 42501 into an actionable message.
 */
export class CrossTenantWriteError extends Error {
  constructor(
    readonly expected: WorkspaceId,
    readonly received: WorkspaceId,
  ) {
    super(
      `Refusing to write into workspace ${received} from a scope bound to ${expected}. ` +
        'A repository may only write rows belonging to its own workspace.',
    )
    this.name = 'CrossTenantWriteError'
  }
}

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

/**
 * The tenant predicate, optionally combined with more conditions.
 *
 * Every read in every repository starts here. The workspace comparison is first
 * and is not optional; extra conditions are appended, never substituted.
 *
 * Callers write `where(scoped(scope, table, eq(table.id, id)))` rather than
 * assembling their own `and(...)`, so the shape of a scoped query is uniform
 * across repositories and a missing predicate is visible in review.
 */
export function scoped(
  scope: RepositoryScope,
  table: TenantTable,
  ...conditions: (SQL | undefined)[]
): SQL {
  const predicate = eq(table.workspaceId, scope.context.workspaceId)
  const extra = conditions.filter((condition): condition is SQL => condition !== undefined)

  // `and` with a single argument returns it unchanged, so this is the same
  // predicate either way. Written explicitly because a reader should not have to
  // know that to be sure the tenant filter survives.
  return extra.length === 0 ? predicate : (and(predicate, ...extra) ?? predicate)
}

/**
 * Stamp a row with the scope's workspace before insert.
 *
 * The caller cannot supply `workspaceId`: it is removed from the accepted type,
 * so passing one is a compile error rather than a silently ignored field. This
 * is the insert-side equivalent of `scoped`, and it is why a repository cannot
 * create a row in the wrong tenant even by accident.
 */
export function insertValues<T extends Record<string, unknown>>(
  scope: RepositoryScope,
  values: Omit<T, 'workspaceId'>,
): T {
  return { ...values, workspaceId: scope.context.workspaceId } as unknown as T
}

/**
 * Assert that a workspace id matches the scope.
 *
 * For the few places a workspace id arrives from outside and has to be checked
 * rather than stamped: a bulk operation, or a value read from a request body.
 * Prefer `insertValues`, which makes the check unnecessary.
 */
export function assertSameWorkspace(scope: RepositoryScope, workspaceId: WorkspaceId): void {
  if (workspaceId !== scope.context.workspaceId) {
    throw new CrossTenantWriteError(scope.context.workspaceId, workspaceId)
  }
}
