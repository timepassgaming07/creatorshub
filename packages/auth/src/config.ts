/**
 * Authentication package configuration, validated at import.
 *
 * Responsibilities: turn environment variables into a checked, typed shape.
 * Dependencies: zod. No database calls.
 *
 * This package connects as `creatorhub_auth` (ADR-0017), never as
 * `creatorhub_app`. Connecting as the application role means sign-in cannot
 * read a user row before any workspace is known, which is exactly what the RLS
 * policies from 1.3 are written to prevent.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const POSTGRES_URL = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith('postgres://') || value.startsWith('postgresql://'),
    'Expected a postgres:// or postgresql:// URL.',
  )

const configSchema = z.object({
  /** Authentication only. Must be creatorhub_auth, not creatorhub_app (ADR-0017). */
  databaseAuthUrl: POSTGRES_URL,

  /**
   * The application's base URL. Needed by Better Auth for callback URL
   * construction, cookie domain configuration, and origin checking.
   */
  baseUrl: z.url(),

  /**
   * At least 32 bytes, hex-encoded. Generated once, not stored in a file.
   * This is the key Better Auth uses to sign session tokens, encrypt
   * verification tokens, and derive CSRF tokens.
   *
   * Rotation: generate a new key, add it to the env var, and both old and new
   * keys are valid until the old one is removed. That allows zero-downtime
   * rotation without invalidating active sessions.
   */
  secret: z.string().min(64),
})

export type AuthConfig = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConfigError'
  }
}

export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
  const result = configSchema.safeParse({
    databaseAuthUrl: env['DATABASE_AUTH_URL'],
    baseUrl: env['AUTH_BASE_URL'] ?? env['NEXT_PUBLIC_BASE_URL'],
    secret: env['AUTH_SECRET'],
  })

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
      .filter((path) => path.length > 0)
      .sort()

    throw new AuthConfigError(
      `Authentication configuration invalid: ${fields.join(', ')}. ` +
        'Set DATABASE_AUTH_URL, AUTH_BASE_URL, and AUTH_SECRET. See docs/adr/0017-authentication-database-role.md.',
    )
  }

  return result.data
}
