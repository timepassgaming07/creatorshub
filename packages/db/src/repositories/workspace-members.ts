/**
 * Workspace membership repository.
 *
 * Responsibilities: read and write `workspace_members` for one workspace.
 * Dependencies: drizzle-orm, the repository base.
 *
 * The first repository, and therefore the worked example every later one copies.
 * Note what is absent: no method takes a workspace id, and no query writes its
 * own tenant predicate. Both come from the scope, which is why a caller cannot
 * ask for another tenant's rows even deliberately.
 *
 * Every method here is registered in the isolation suite (1.12). A new method
 * that is not covered there is a test failure, so forgetting is loud.
 */
import type { UserId } from '@creatorhub/contracts'
import { eq } from 'drizzle-orm'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import { workspaceMembers } from '../schema/identity.js'

export type WorkspaceRole = 'owner' | 'admin' | 'member'

export type WorkspaceMember = {
  readonly id: string
  readonly userId: UserId
  readonly role: WorkspaceRole
  readonly joinedAt: Date
}

/**
 * Every membership in the current workspace.
 *
 * The tenant predicate comes from `scoped`, not from the caller. There is no
 * overload that returns memberships across workspaces, because the only honest
 * implementation of that would take an unscoped client, which this package does
 * not expose.
 */
export async function listMembers(scope: RepositoryScope): Promise<WorkspaceMember[]> {
  const rows = await scope.tx
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .where(scoped(scope, workspaceMembers))

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId as UserId,
    role: row.role,
    joinedAt: row.joinedAt,
  }))
}

/**
 * One membership by user, or undefined.
 *
 * Returns undefined rather than throwing when absent: "this user is not a
 * member" is an ordinary answer to an authorisation question, not an exception.
 */
export async function findMemberByUserId(
  scope: RepositoryScope,
  userId: UserId,
): Promise<WorkspaceMember | undefined> {
  const rows = await scope.tx
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .where(scoped(scope, workspaceMembers, eq(workspaceMembers.userId, userId)))
    .limit(1)

  const row = rows[0]
  if (row === undefined) {
    return undefined
  }

  return {
    id: row.id,
    userId: row.userId as UserId,
    role: row.role,
    joinedAt: row.joinedAt,
  }
}

/**
 * Add a member to the current workspace.
 *
 * `insertValues` stamps the workspace, and the parameter type has no
 * `workspaceId` field, so supplying one is a compile error rather than a
 * silently ignored value.
 */
export async function addMember(
  scope: RepositoryScope,
  member: { userId: UserId; role: WorkspaceRole; invitedByUserId?: UserId },
): Promise<string> {
  const rows = await scope.tx
    .insert(workspaceMembers)
    .values(
      insertValues(scope, {
        userId: member.userId,
        role: member.role,
        ...(member.invitedByUserId === undefined
          ? {}
          : { invitedByUserId: member.invitedByUserId }),
      }),
    )
    .returning({ id: workspaceMembers.id })

  return rows[0]?.id ?? ''
}

/**
 * Change a member's role.
 *
 * Scoped on the way in, so a caller holding another workspace's user id changes
 * nothing rather than changing the wrong row. Returns whether a row matched, so
 * the caller can tell "not a member" from "role updated" without a second query.
 */
export async function updateMemberRole(
  scope: RepositoryScope,
  userId: UserId,
  role: WorkspaceRole,
): Promise<boolean> {
  const rows = await scope.tx
    .update(workspaceMembers)
    .set({ role, updatedAt: new Date() })
    .where(scoped(scope, workspaceMembers, eq(workspaceMembers.userId, userId)))
    .returning({ id: workspaceMembers.id })

  return rows.length > 0
}

/** Remove a member from the current workspace. */
export async function removeMember(scope: RepositoryScope, userId: UserId): Promise<boolean> {
  const rows = await scope.tx
    .delete(workspaceMembers)
    .where(scoped(scope, workspaceMembers, eq(workspaceMembers.userId, userId)))
    .returning({ id: workspaceMembers.id })

  return rows.length > 0
}
