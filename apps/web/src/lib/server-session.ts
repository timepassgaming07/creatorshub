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

    return {
      userId: userId(session.user.id),
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    }
  } catch {
    return null
  }
}
