'use server'

/**
 * Server Actions for Workspace Creation, Member Management, and Governance.
 *
 * Responsibilities:
 * - Validate input schemas
 * - Check authentication and authorization using @creatorhub/domain policy module
 * - Enforce RLS tenant isolation using @creatorhub/db
 * - Append audit logs for state changes (workspace.created, member.invited, member.role_changed, member.removed)
 * - Return not-found (404-like) for cross-workspace access attempts, preventing enumeration leaks.
 */
import { requestId, userId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import { auditLog, workspaceMembers, workspaces } from '@creatorhub/db'
import {
  authorise,
  permissionsFor,
  type Membership,
  type Permission,
  type WorkspaceRole,
} from '@creatorhub/domain'

import { getAuthPool, rememberDefaultWorkspace } from './auth'
import { getEmailService } from './email'
import { appUrl } from './env'
import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { generateUuidV7 } from './uuidv7'
import { auditOptions } from './env'


export type ActionError = {
  readonly code: string
  readonly title: string
  readonly detail: string
  readonly action?: string
  readonly status: 400 | 401 | 403 | 404 | 500
}

export type ActionResponse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ActionError }

// ---------------------------------------------------------------------------
// Create Workspace
// ---------------------------------------------------------------------------

export type CreateWorkspaceInput = {
  readonly name: string
  readonly slug: string
  readonly timezone?: string
  readonly defaultCurrency?: string
}

export async function createWorkspaceAction(
  input: CreateWorkspaceInput,
): Promise<ActionResponse<{ workspaceId: string; slug: string }>> {
  const session = await getServerSession()
  if (!session) {
    return {
      success: false,
      error: {
        code: 'auth.unauthenticated',
        title: 'Please sign in',
        detail: 'You must be signed in to create a workspace.',
        action: 'Sign in and try again.',
        status: 401,
      },
    }
  }

  const name = input.name.trim()
  const slug = input.slug.trim().toLowerCase()

  if (name.length < 2) {
    return {
      success: false,
      error: {
        code: 'validation.name_too_short',
        title: 'Invalid workspace name',
        detail: 'Workspace name must be at least 2 characters long.',
        status: 400,
      },
    }
  }

  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 3 || slug.length > 48) {
    return {
      success: false,
      error: {
        code: 'validation.invalid_slug',
        title: 'Invalid subdomain slug',
        detail: 'Slug must be 3-48 characters, lowercase alphanumeric and hyphens only.',
        action: 'Choose a valid URL slug like "my-store".',
        status: 400,
      },
    }
  }

  const newWorkspaceId = workspaceId(generateUuidV7())
  const reqId = requestId(`req-${Date.now().toString()}`)
  const context = workspaceContext({
    workspaceId: newWorkspaceId,
    requestId: reqId,
    actorId: session.userId,
  })

  try {
    const db = getDatabase()
    await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      await workspaces.createWorkspace(scope, {
        name,
        slug,
        timezone: input.timezone ?? 'Asia/Kolkata',
        defaultCurrency: input.defaultCurrency ?? 'INR',
      })

      await workspaceMembers.addMember(scope, {
        userId: session.userId,
        role: 'owner',
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: session.userId,
        action: 'workspace.created',
        targetType: 'workspace',
        targetId: newWorkspaceId,
        metadata: { name, slug },
      })
    })

    // Sign-in returns the creator here from now on.
    await rememberDefaultWorkspace(session.user.id, newWorkspaceId).catch(() => undefined)

    return {
      success: true,
      data: { workspaceId: newWorkspaceId, slug },
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    if (errMessage.includes('unique') || errMessage.includes('uq_workspaces__slug')) {
      return {
        success: false,
        error: {
          code: 'workspace.slug_taken',
          title: 'Subdomain already taken',
          detail: `The subdomain "${slug}" is already in use by another workspace.`,
          action: 'Please choose a different subdomain name.',
          status: 400,
        },
      }
    }

    return {
      success: false,
      error: {
        code: 'workspace.create_failed',
        title: 'Could not create workspace',
        detail: 'An unexpected error occurred while creating the workspace.',
        action: 'Please try again in a few moments.',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Get Workspace & Members
// ---------------------------------------------------------------------------

export type MemberDisplay = {
  readonly id: string
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: WorkspaceRole
  readonly joinedAt: string
}

export type WorkspaceData = {
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly defaultCurrency: string
    readonly platformFeeBps: number
    readonly timezone: string
    readonly status: string
  }
  readonly members: readonly MemberDisplay[]
  readonly currentRole: WorkspaceRole
  readonly permissions: readonly Permission[]
}

export async function getWorkspaceDataAction(
  targetWorkspaceIdRaw: string,
): Promise<ActionResponse<WorkspaceData>> {
  const session = await getServerSession()
  if (!session) {
    return {
      success: false,
      error: {
        code: 'auth.unauthenticated',
        title: 'Please sign in',
        detail: 'You must be signed in to view this workspace.',
        status: 401,
      },
    }
  }

  const targetWsId = workspaceId(targetWorkspaceIdRaw)
  const reqId = requestId(`req-${Date.now().toString()}`)
  const context = workspaceContext({
    workspaceId: targetWsId,
    requestId: reqId,
    actorId: session.userId,
  })

  try {
    const db = getDatabase()
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      const memberRecord = await workspaceMembers.findMemberByUserId(scope, session.userId)
      if (!memberRecord) {
        return {
          success: false,
          error: {
            code: 'authorisation.wrong_workspace',
            title: 'Not found',
            detail: 'We could not find that.',
            action: 'Check the link and try again.',
            status: 404,
          },
        }
      }

      const membership: Membership = {
        userId: session.userId,
        workspaceId: targetWsId,
        role: memberRecord.role,
      }

      const authResult = authorise(membership, targetWsId, 'workspace.view')
      if (!authResult.ok) {
        if (authResult.error.code === 'authorisation.wrong_workspace') {
          return {
            success: false,
            error: {
              code: 'authorisation.wrong_workspace',
              title: authResult.error.title,
              detail: authResult.error.detail,
              action: authResult.error.action,
              status: 404,
            },
          }
        }

        return {
          success: false,
          error: {
            code: authResult.error.code,
            title: authResult.error.title,
            detail: authResult.error.detail,
            action: authResult.error.action,
            status: 403,
          },
        }
      }

      const wsRecord = await workspaces.findCurrentWorkspace(scope)
      if (!wsRecord) {
        return {
          success: false,
          error: {
            code: 'workspace.not_found',
            title: 'Not found',
            detail: 'We could not find that workspace.',
            status: 404,
          },
        }
      }

      const membersList = await workspaceMembers.listMembers(scope)

      // Fetch user profile info (name, email)
      const userIds = membersList.map((m) => m.userId)
      const pool = getAuthPool()
      const userRows = await pool
        .query<{ id: string; email: string; name: string | null }>(
          `SELECT id, email, name FROM users WHERE id = ANY($1)`,
          [userIds],
        )
        .then((res) => res.rows)

      const userMap = new Map(userRows.map((u) => [u.id, u]))

      const formattedMembers: MemberDisplay[] = membersList.map((m) => {
        const u = userMap.get(m.userId)
        return {
          id: m.id,
          userId: m.userId,
          name: u?.name ?? 'Unnamed User',
          email: u?.email ?? '',
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        }
      })

      return {
        success: true,
        data: {
          workspace: {
            id: wsRecord.id,
            name: wsRecord.name,
            slug: wsRecord.slug,
            defaultCurrency: wsRecord.defaultCurrency,
            platformFeeBps: wsRecord.platformFeeBps,
            timezone: wsRecord.timezone,
            status: wsRecord.status,
          },
          members: formattedMembers,
          currentRole: memberRecord.role,
          permissions: permissionsFor(memberRecord.role),
        },
      }
    })
  } catch {
    return {
      success: false,
      error: {
        code: 'workspace.fetch_failed',
        title: 'Not found',
        detail: 'We could not find that.',
        action: 'Check the link and try again.',
        status: 404,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Invite Member
// ---------------------------------------------------------------------------

export type InviteMemberInput = {
  readonly workspaceId: string
  readonly email: string
  readonly role: 'admin' | 'member'
}

export async function inviteMemberAction(
  input: InviteMemberInput,
): Promise<ActionResponse<{ memberId: string }>> {
  const session = await getServerSession()
  if (!session) {
    return {
      success: false,
      error: {
        code: 'auth.unauthenticated',
        title: 'Please sign in',
        detail: 'You must be signed in to invite members.',
        status: 401,
      },
    }
  }

  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) {
    return {
      success: false,
      error: {
        code: 'validation.invalid_email',
        title: 'Invalid email address',
        detail: 'Please enter a valid email address.',
        status: 400,
      },
    }
  }

  const targetWsId = workspaceId(input.workspaceId)
  const reqId = requestId(`req-${Date.now().toString()}`)
  const context = workspaceContext({
    workspaceId: targetWsId,
    requestId: reqId,
    actorId: session.userId,
  })

  try {
    const db = getDatabase()
    const result = await db.withWorkspace(context, async (tx): Promise<
      | { success: false; error: ActionError }
      | {
          success: true
          data: { memberId: string }
          invite: { targetUserId: string; isNewUser: boolean; workspaceName: string }
        }
    > => {
      const scope = { tx, context }

      const actorMember = await workspaceMembers.findMemberByUserId(scope, session.userId)
      if (!actorMember) {
        return {
          success: false,
          error: {
            code: 'authorisation.wrong_workspace',
            title: 'Not found',
            detail: 'We could not find that.',
            status: 404,
          },
        }
      }

      const membership: Membership = {
        userId: session.userId,
        workspaceId: targetWsId,
        role: actorMember.role,
      }

      const authCheck = authorise(membership, targetWsId, 'member.invite')
      if (!authCheck.ok) {
        return {
          success: false,
          error: {
            code: authCheck.error.code,
            title: authCheck.error.title,
            detail: authCheck.error.detail,
            action: authCheck.error.action,
            status: authCheck.error.code === 'authorisation.wrong_workspace' ? 404 : 403,
          },
        }
      }

      // Find or create user row via auth pool
      const pool = getAuthPool()
      let targetUser = await pool
        .query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
        .then((r) => r.rows[0])

      let isNewUser = false
      if (!targetUser) {
        const created = await pool.query<{ id: string }>(
          'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
          [email, email.split('@')[0]],
        )
        targetUser = created.rows[0]
        isNewUser = true
      }

      if (!targetUser) {
        return {
          success: false,
          error: {
            code: 'member.user_resolution_failed',
            title: 'Could not resolve user',
            detail: 'Could not find or create user for this email address.',
            status: 500,
          },
        }
      }

      const targetUserId = userId(targetUser.id)

      // Check if already a member
      const existingMember = await workspaceMembers.findMemberByUserId(scope, targetUserId)
      if (existingMember) {
        return {
          success: false,
          error: {
            code: 'member.already_member',
            title: 'Already a member',
            detail: 'This user is already a member of this workspace.',
            status: 400,
          },
        }
      }

      const memberId = await workspaceMembers.addMember(scope, {
        userId: targetUserId,
        role: input.role,
        invitedByUserId: session.userId,
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: session.userId,
        action: 'member.invited',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { email, role: input.role },
      })

      const ws = await workspaces.findCurrentWorkspace(scope)
      return {
        success: true as const,
        data: { memberId },
        invite: {
          targetUserId: targetUser.id,
          isNewUser,
          workspaceName: ws?.name ?? 'a workspace',
        },
      }
    })

    if (!result.success) return result

    // After commit: point a brand-new user at this workspace, then email them.
    if (result.invite.isNewUser) {
      await rememberDefaultWorkspace(result.invite.targetUserId, targetWsId).catch(() => undefined)
    }
    const next = `/workspaces/${targetWsId}`
    const url = result.invite.isNewUser
      ? `${appUrl()}/forgot-password?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
      : `${appUrl()}/sign-in?redirect=${encodeURIComponent(next)}`
    await getEmailService()
      .sendMemberInvite({
        to: email,
        workspaceName: result.invite.workspaceName,
        inviterName: session.user.name ?? session.user.email,
        role: input.role,
        url,
      })
      .catch((error: unknown) => {
        console.error('[invite] email failed', error instanceof Error ? error.message : error)
      })

    return { success: true, data: result.data }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'member.invite_failed',
        title: 'Could not invite member',
        detail: err instanceof Error ? err.message : 'An unexpected error occurred.',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Update Member Role
// ---------------------------------------------------------------------------

export type UpdateRoleInput = {
  readonly workspaceId: string
  readonly targetUserId: string
  readonly role: 'admin' | 'member'
}

export async function updateMemberRoleAction(
  input: UpdateRoleInput,
): Promise<ActionResponse<{ updated: boolean }>> {
  const session = await getServerSession()
  if (!session) {
    return {
      success: false,
      error: {
        code: 'auth.unauthenticated',
        title: 'Please sign in',
        detail: 'You must be signed in to manage member roles.',
        status: 401,
      },
    }
  }

  const targetWsId = workspaceId(input.workspaceId)
  const reqId = requestId(`req-${Date.now().toString()}`)
  const context = workspaceContext({
    workspaceId: targetWsId,
    requestId: reqId,
    actorId: session.userId,
  })

  try {
    const db = getDatabase()
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      const actorMember = await workspaceMembers.findMemberByUserId(scope, session.userId)
      if (!actorMember) {
        return {
          success: false,
          error: {
            code: 'authorisation.wrong_workspace',
            title: 'Not found',
            detail: 'We could not find that.',
            status: 404,
          },
        }
      }

      const membership: Membership = {
        userId: session.userId,
        workspaceId: targetWsId,
        role: actorMember.role,
      }

      const authCheck = authorise(membership, targetWsId, 'member.role.change')
      if (!authCheck.ok) {
        return {
          success: false,
          error: {
            code: authCheck.error.code,
            title: authCheck.error.title,
            detail: authCheck.error.detail,
            action: authCheck.error.action,
            status: authCheck.error.code === 'authorisation.wrong_workspace' ? 404 : 403,
          },
        }
      }

      const targetId = userId(input.targetUserId)
      const updated = await workspaceMembers.updateMemberRole(scope, targetId, input.role)

      if (updated) {
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: session.userId,
          action: 'member.role_changed',
          targetType: 'user',
          targetId: targetId,
          metadata: { newRole: input.role },
        })
      }

      return {
        success: true,
        data: { updated },
      }
    })
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'member.update_failed',
        title: 'Could not update role',
        detail: err instanceof Error ? err.message : 'An error occurred.',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Remove Member
// ---------------------------------------------------------------------------

export type RemoveMemberInput = {
  readonly workspaceId: string
  readonly targetUserId: string
}

export async function removeMemberAction(
  input: RemoveMemberInput,
): Promise<ActionResponse<{ removed: boolean }>> {
  const session = await getServerSession()
  if (!session) {
    return {
      success: false,
      error: {
        code: 'auth.unauthenticated',
        title: 'Please sign in',
        detail: 'You must be signed in to remove members.',
        status: 401,
      },
    }
  }

  const targetWsId = workspaceId(input.workspaceId)
  const reqId = requestId(`req-${Date.now().toString()}`)
  const context = workspaceContext({
    workspaceId: targetWsId,
    requestId: reqId,
    actorId: session.userId,
  })

  try {
    const db = getDatabase()
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      const actorMember = await workspaceMembers.findMemberByUserId(scope, session.userId)
      if (!actorMember) {
        return {
          success: false,
          error: {
            code: 'authorisation.wrong_workspace',
            title: 'Not found',
            detail: 'We could not find that.',
            status: 404,
          },
        }
      }

      const membership: Membership = {
        userId: session.userId,
        workspaceId: targetWsId,
        role: actorMember.role,
      }

      const authCheck = authorise(membership, targetWsId, 'member.remove')
      if (!authCheck.ok) {
        return {
          success: false,
          error: {
            code: authCheck.error.code,
            title: authCheck.error.title,
            detail: authCheck.error.detail,
            action: authCheck.error.action,
            status: authCheck.error.code === 'authorisation.wrong_workspace' ? 404 : 403,
          },
        }
      }

      const targetId = userId(input.targetUserId)
      const removed = await workspaceMembers.removeMember(scope, targetId)

      if (removed) {
        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: session.userId,
          action: 'member.removed',
          targetType: 'user',
          targetId: targetId,
        })
      }

      return {
        success: true,
        data: { removed },
      }
    })
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'member.remove_failed',
        title: 'Could not remove member',
        detail: err instanceof Error ? err.message : 'An error occurred.',
        status: 500,
      },
    }
  }
}
