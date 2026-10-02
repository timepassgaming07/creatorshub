/**
 * The shape every dashboard server action shares: who is asking, may they do
 * this in this workspace, then run the work inside that workspace's RLS scope.
 *
 * Failures a creator can act on are thrown as `ActionFailure` and come back
 * with their message. Anything else is logged and reported generically, so an
 * internal error never leaks a stack or a SQL fragment into the UI.
 */
import {
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type WorkspaceContext,
} from '@creatorhub/contracts'
import type { RepositoryScope } from '@creatorhub/db'
import { authorise, type Permission, type WorkspaceRole } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getWorkspaceAccess, type WorkspaceAccess } from './workspace-access'

export type ActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string }

export class ActionFailure extends Error {
  override readonly name = 'ActionFailure'
}

export type MemberContext = {
  readonly context: WorkspaceContext
  readonly access: WorkspaceAccess
  readonly actorId: string
}

/** Resolve and authorise the caller, without opening a transaction. */
export async function authoriseMember(
  rawWorkspaceId: string,
  permission: Permission,
): Promise<MemberContext> {
  const { session, access } = await getWorkspaceAccess(rawWorkspaceId)
  if (!session) throw new ActionFailure('Your session ended. Sign in again to continue.')
  if (!access) throw new ActionFailure('You are not a member of this workspace.')
  const wsId = toWorkspaceId(access.workspace.id)
  const decision = authorise(
    { userId: session.userId, workspaceId: wsId, role: access.role as WorkspaceRole },
    wsId,
    permission,
  )
  if (!decision.ok) throw new ActionFailure('Your role does not allow this. Ask an owner or admin.')
  return {
    context: workspaceContext({
      workspaceId: wsId,
      actorId: session.userId,
      requestId: requestId(`req-act-${Date.now().toString(36)}`),
    }),
    access,
    actorId: session.userId,
  }
}

export function inWorkspace<T>(
  member: MemberContext,
  work: (scope: RepositoryScope) => Promise<T>,
): Promise<T> {
  return getDatabase().withWorkspace(member.context, (tx) => work({ tx, context: member.context }))
}

/** Turn a thrown failure into a result the client can render. */
export async function runAction<T>(
  label: string,
  work: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() }
  } catch (error) {
    if (error instanceof Error && error.name === 'ActionFailure')
      return { ok: false, error: error.message }
    // Next uses thrown errors for redirect() and notFound(); let those through.
    if (error instanceof Error && 'digest' in error) throw error
    console.error(`[action] ${label} failed`, error)
    return { ok: false, error: 'Something went wrong on our side. Try again in a moment.' }
  }
}

/** Authorise, then run `work` in one tenant-scoped transaction. */
export function memberAction<T>(
  label: string,
  rawWorkspaceId: string,
  permission: Permission,
  work: (scope: RepositoryScope, member: MemberContext) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(label, async () => {
    const member = await authoriseMember(rawWorkspaceId, permission)
    return inWorkspace(member, (scope) => work(scope, member))
  })
}

/** A Postgres unique violation, which drizzle wraps in its own error. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidates = [error, error instanceof Error ? error.cause : undefined]
  return candidates.some((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return false
    const pg = candidate as { code?: unknown; constraint_name?: unknown; message?: unknown }
    if (pg.code !== '23505') return false
    return (
      constraint === undefined ||
      pg.constraint_name === constraint ||
      String(pg.message).includes(constraint)
    )
  })
}
