/**
 * Client-side authentication utilities.
 *
 * Responsibilities: expose Better Auth hooks and methods for client components.
 * Dependencies: better-auth/react.
 */
'use client'

import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
