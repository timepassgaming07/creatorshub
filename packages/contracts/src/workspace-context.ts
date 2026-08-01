/**
 * WorkspaceContext — who is acting, in which workspace, on which request.
 *
 * Responsibilities: carry the tenant predicate and the audit facts from the
 * request boundary down to the database.
 * Dependencies: identifiers. No I/O, no framework.
 *
 * This is the value the whole tenancy model turns on (ADR-0012). Every
 * tenant-scoped query is filtered by its `workspaceId`, and the same value is
 * what the Postgres RLS policy reads from the transaction-local session
 * setting. Two enforcement layers, one input.
 *
 * It is passed explicitly rather than held in ambient storage. Explicit
 * threading is uglier at the call site and obvious in review, and the
 * alternative fails by leaking a context across an await boundary in a way no
 * reviewer can see. For the one value whose misuse means a creator reads another
 * creator's customer list, hard to misuse beats pleasant to use. A convenience
 * wrapper may later resolve a context and call through to the same functions,
 * but the core stays explicit.
 *
 * An object rather than a bare id because the audit log needs the actor and the
 * request on every write, and threading three parameters through every
 * repository method invites getting the order wrong.
 */
import type { RequestId, UserId, WorkspaceId } from './identifiers.js'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

export type WorkspaceContext = {
  /** The tenant. Both isolation layers key off this. */
  readonly workspaceId: WorkspaceId

  /** Correlates every log line, audit row, and outbox event for one request. */
  readonly requestId: RequestId

  /**
   * The acting user, when there is one.
   *
   * Absent for system work: scheduled jobs, webhook processing, and the outbox
   * publisher all act on a workspace with no user behind the request. The audit
   * log records those as `system` rather than inventing a user.
   */
  readonly actorId?: UserId
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

/**
 * Build a context. The fields are already branded, so validation happened at the
 * boundary where the raw strings arrived.
 *
 * The input accepts an explicit `undefined` actor; the output never carries one.
 * Callers usually have `session?.user?.id`, which is `UserId | undefined`, and
 * `exactOptionalPropertyTypes` would otherwise reject it at every call site.
 * Absorbing it here is the reason this constructor exists: the alternative is
 * the same conditional spread repeated everywhere, and one of those eventually
 * lands an `actorId: undefined` key in a serialised audit row.
 */
export function workspaceContext(input: {
  workspaceId: WorkspaceId
  requestId: RequestId
  actorId?: UserId | undefined
}): WorkspaceContext {
  return {
    workspaceId: input.workspaceId,
    requestId: input.requestId,
    ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
  }
}

/**
 * Narrow a context to a different workspace.
 *
 * Deliberately not a general setter. The only legitimate use is a platform
 * operation that crosses tenants under an explicit audit obligation
 * (ADR-0012), and naming it this way makes those call sites greppable.
 */
export function withWorkspaceId(context: WorkspaceContext, target: WorkspaceId): WorkspaceContext {
  return { ...context, workspaceId: target }
}
