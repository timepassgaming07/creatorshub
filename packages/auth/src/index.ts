/**
 * @creatorhub/auth — authentication: sign-in, sign-up, sessions, verification.
 *
 * Responsibilities: own the Better Auth instance, enforce the configured
 * security policies, and expose session management.
 *
 * The connection string this package uses is the one guarantee that must not
 * bend. It connects as `creatorhub_auth`, never as `creatorhub_app`. Pointing
 * it at the application role makes sign-in silently fail on a permission
 * error that reads like a library bug and names nothing about the role.
 *
 * What is not here: authorisation. The policy module lives in
 * `packages/domain` per ADR-0006, which deliberately keeps permission logic
 * out of the authentication library.
 */
export { AuthConfigError, loadAuthConfig } from './config.js'
export type { AuthConfig } from './config.js'

export { argon2idPassword } from './hash.js'

export { AUTH_DATABASE_CASING, createAuthOptions } from './auth.js'

export { createSessionStore } from './session.js'
export type { SessionRecord, SessionStore } from './session.js'
