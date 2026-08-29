/**
 * Client-side authentication utilities.
 *
 * Responsibilities: expose Better Auth hooks and methods for client components.
 * Dependencies: better-auth/react, @better-auth/passkey/client.
 */
'use client'

import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  plugins: [passkeyClient()],
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
