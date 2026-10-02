/**
 * Who may open a workspace, decided on the server before any page renders.
 *
 * Responsibilities:
 * - Resolve the signed-in user's membership in a workspace under both
 *   isolation layers (the query runs inside that workspace's RLS scope).
 * - Pick where a user lands after sign-in: the workspace they last opened, if
 *   they are still a member of it, otherwise onboarding.
 */
import {
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type UserId,
} from '@creatorhub/contracts'
import { storefronts, workspaceMembers, workspaces } from '@creatorhub/db'
import type { WorkspaceRole } from '@creatorhub/domain'

import { rememberDefaultWorkspace } from './auth'
import { getDatabase } from './db'
import { storefrontUrl } from './env'
import { getServerSession, type ServerSession } from './server-session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type WorkspaceAccess = {
  readonly session: ServerSession
  readonly role: WorkspaceRole
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly currency: string
  }
  readonly storefront: {
    readonly subdomain: string
    readonly status: string
    readonly url: string
  } | null
}

async function membershipIn(rawWorkspaceId: string, actorId: UserId) {
  if (!UUID.test(rawWorkspaceId)) return null
  const context = workspaceContext({
    workspaceId: toWorkspaceId(rawWorkspaceId),
    actorId,
    requestId: requestId(`req-acc-${Date.now().toString(36)}`),
  })
  return getDatabase().withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const member = await workspaceMembers.findMemberByUserId(scope, actorId)
    if (!member) return null
    const ws = await workspaces.findCurrentWorkspace(scope)
    if (!ws) return null
    const store = await storefronts.findStorefrontByWorkspaceId(scope)
    return { member, ws, store }
  })
}

/** Null when signed out; `{ session }` alone when signed in but not a member. */
export async function getWorkspaceAccess(
  rawWorkspaceId: string,
): Promise<{ session: ServerSession | null; access: WorkspaceAccess | null }> {
  const session = await getServerSession()
  if (!session) return { session: null, access: null }

  const found = await membershipIn(rawWorkspaceId, session.userId)
  if (!found) return { session, access: null }

  // Remember this workspace so the next sign-in comes back to it.
  if (session.user.defaultWorkspaceId !== found.ws.id) {
    await rememberDefaultWorkspace(session.user.id, found.ws.id).catch(() => undefined)
  }

  return {
    session,
    access: {
      session,
      role: found.member.role,
      workspace: {
        id: found.ws.id,
        name: found.ws.name,
        slug: found.ws.slug,
        currency: found.ws.defaultCurrency,
      },
      storefront: found.store
        ? {
            subdomain: found.store.subdomain,
            status: found.store.status,
            url: storefrontUrl(found.store.subdomain),
          }
        : null,
    },
  }
}

/** Where a signed-in user should land. */
export async function homeWorkspaceFor(session: ServerSession): Promise<string | null> {
  const hint = session.user.defaultWorkspaceId
  if (!hint) return null
  const found = await membershipIn(hint, session.userId)
  return found ? found.ws.id : null
}
