import { describe, expect, it } from 'vitest'

import { AuthConfigError, loadAuthConfig } from './config.js'

const VALID = {
  DATABASE_AUTH_URL: 'postgres://creatorhub_auth:pw@localhost:5432/creatorhub',
  AUTH_BASE_URL: 'https://creatorhub.com',
  AUTH_SECRET: 'a'.repeat(64),
}

describe('loadAuthConfig', () => {
  it('reads a complete environment', () => {
    const config = loadAuthConfig(VALID)

    expect(config.databaseAuthUrl).toBe(VALID.DATABASE_AUTH_URL)
    expect(config.baseUrl).toBe(VALID.AUTH_BASE_URL)
  })

  // security.md requires a missing secret to fail at boot rather than at first
  // use. An authentication package that starts without a signing key would mint
  // sessions nobody can verify.
  it.each(['DATABASE_AUTH_URL', 'AUTH_BASE_URL', 'AUTH_SECRET'])(
    'throws when %s is missing',
    (key) => {
      // Rebuilt without the key rather than deleted from a copy, so the test
      // does not mutate a shared fixture between cases.
      const incomplete = Object.fromEntries(Object.entries(VALID).filter(([name]) => name !== key))

      expect(() => loadAuthConfig(incomplete)).toThrow(AuthConfigError)
    },
  )

  it('names the offending variables so the failure is actionable', () => {
    expect(() => loadAuthConfig({})).toThrow(/DATABASE_AUTH_URL/)
  })

  it('points at the ADR that explains the third role', () => {
    expect(() => loadAuthConfig({})).toThrow(/0017/)
  })

  it.each([
    ['mysql', 'mysql://localhost:3306/db'],
    ['http', 'http://localhost:5432/db'],
    ['empty', ''],
  ])('rejects a %s connection URL', (_label, url) => {
    expect(() => loadAuthConfig({ ...VALID, DATABASE_AUTH_URL: url })).toThrow(AuthConfigError)
  })

  // A short secret is a weak signing key, and the failure mode is forgeable
  // session tokens rather than anything visible at runtime.
  it('rejects a secret shorter than 64 characters', () => {
    expect(() => loadAuthConfig({ ...VALID, AUTH_SECRET: 'a'.repeat(63) })).toThrow(AuthConfigError)
  })

  it('accepts a secret of exactly 64 characters', () => {
    expect(loadAuthConfig({ ...VALID, AUTH_SECRET: 'b'.repeat(64) }).secret).toHaveLength(64)
  })

  it('rejects a base URL that is not a URL', () => {
    expect(() => loadAuthConfig({ ...VALID, AUTH_BASE_URL: 'creatorhub.com' })).toThrow(
      AuthConfigError,
    )
  })

  // The error message reaches logs and error trackers. A connection string
  // carries a password, so it must not be echoed back.
  it('does not echo the connection string into the error', () => {
    try {
      loadAuthConfig({ ...VALID, DATABASE_AUTH_URL: 'mysql://user:sup3rs3cr3t@host/db' })
      expect.unreachable('expected an AuthConfigError')
    } catch (error) {
      expect((error as Error).message).not.toContain('sup3rs3cr3t')
    }
  })

  it('does not echo the secret into the error', () => {
    try {
      loadAuthConfig({ ...VALID, AUTH_SECRET: 'too-short-but-memorable' })
      expect.unreachable('expected an AuthConfigError')
    } catch (error) {
      expect((error as Error).message).not.toContain('too-short-but-memorable')
    }
  })

  it('falls back to NEXT_PUBLIC_BASE_URL when AUTH_BASE_URL is absent', () => {
    const { AUTH_BASE_URL: _omitted, ...rest } = VALID

    const config = loadAuthConfig({ ...rest, NEXT_PUBLIC_BASE_URL: 'https://example.test' })

    expect(config.baseUrl).toBe('https://example.test')
  })
})
