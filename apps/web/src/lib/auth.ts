/**
 * Authentication instance and database connection for the web application.
 *
 * Responsibilities: instantiate Better Auth configured against the third database
 * role (`creatorhub_auth`), per ADR-0017.
 * Dependencies: @creatorhub/auth, better-auth.
 *
 * The connection string this uses connects as `creatorhub_auth`, never as
 * `creatorhub_app`. Pointing it at the application role fails sign-in.
 */
import { createAuthDatabase, createAuthOptions, loadAuthConfig } from '@creatorhub/auth'
import { betterAuth } from 'better-auth'

type AuthInstance = ReturnType<typeof betterAuth>
type AuthPool = ReturnType<typeof createAuthDatabase>

const globalForAuth = globalThis as unknown as {
  authPool?: AuthPool
  auth?: AuthInstance
}

export function getAuthPool(): AuthPool {
  if (!globalForAuth.authPool) {
    const config = loadAuthConfig(process.env)
    globalForAuth.authPool = createAuthDatabase(config)
  }

  return globalForAuth.authPool
}

export function getAuth(): AuthInstance {
  if (!globalForAuth.auth) {
    const config = loadAuthConfig(process.env)
    const pool = getAuthPool()
    if (process.env.NODE_ENV !== 'production') {
      globalForAuth.authPool = pool
    }
    const options = createAuthOptions(config, pool)
    globalForAuth.auth = betterAuth(options)
  }

  return globalForAuth.auth
}
