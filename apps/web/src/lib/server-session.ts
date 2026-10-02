/**
 * Server-side session extraction for Server Actions and Route Handlers.
 *
 * Responsibilities: extract and validate the authenticated user from request headers.
 * Dependencies: @creatorhub/contracts, better-auth.
 */
import { headers } from 'next/headers'
import { userId, type UserId } from '@creatorhub/contracts'

import { getAuth } from './auth'

export type ServerSession = {
  readonly userId: UserId
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name?: string | null
    readonly emailVerified?: boolean
    /** A routing hint only. Verify membership before trusting it. */
    readonly defaultWorkspaceId?: string | null
  }
}

export async function getServerSession(): Promise<ServerSession | null> {
  try {
    const requestHeaders = await headers()
    const session = await getAuth().api.getSession({
      headers: requestHeaders,
    })

    if (!session?.user) {
      return null
    }

    const user = session.user as typeof session.user & { defaultWorkspaceId?: string | null }

    return {
      userId: userId(user.id),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        defaultWorkspaceId: user.defaultWorkspaceId ?? null,
      },
    }
  } catch {
    return null
  }
}
