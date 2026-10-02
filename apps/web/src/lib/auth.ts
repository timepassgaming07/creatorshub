/**
 * Authentication instance and database connection for the web application.
 *
 * Responsibilities: instantiate Better Auth configured against the third database
 * role (`creatorhub_auth`), per ADR-0017, with email delivery for password
 * reset and verification.
 * Dependencies: @creatorhub/auth, better-auth.
 *
 * The connection string this uses connects as `creatorhub_auth`, never as
 * `creatorhub_app`. Pointing it at the application role fails sign-in.
 */
import {
  createAuthDatabase,
  createAuthOptions,
  loadAuthConfig,
  type AuthMailer,
} from '@creatorhub/auth'
import { betterAuth } from 'better-auth'

import { getEmailService } from './email'

type AuthInstance = ReturnType<typeof betterAuth>
type AuthPool = ReturnType<typeof createAuthDatabase>

const globalForAuth = globalThis as unknown as {
  authPool?: AuthPool
  auth?: AuthInstance
}

const mailer: AuthMailer = {
  async sendPasswordReset({ to, name, url }) {
    await getEmailService().sendPasswordReset({ to, name, url })
  },
  async sendEmailVerification({ to, name, url }) {
    await getEmailService().sendEmailVerification({ to, name, url })
  },
}

export function getAuthPool(): AuthPool {
  globalForAuth.authPool ??= createAuthDatabase(loadAuthConfig(process.env))
  return globalForAuth.authPool
}

export function getAuth(): AuthInstance {
  globalForAuth.auth ??= betterAuth(
    createAuthOptions(loadAuthConfig(process.env), getAuthPool(), mailer),
  )
  return globalForAuth.auth
}

/**
 * Record the workspace a user last opened, so sign-in can return them to it.
 * Written through Better Auth's adapter, which connects as the auth role that
 * owns updates to `users` (migration 0027).
 */
export async function rememberDefaultWorkspace(userId: string, workspaceId: string): Promise<void> {
  const context = await getAuth().$context
  await context.internalAdapter.updateUser(userId, { defaultWorkspaceId: workspaceId })
}
