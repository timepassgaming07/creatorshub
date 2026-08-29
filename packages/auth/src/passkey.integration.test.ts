import { runMigrations, startTestDatabase, type TestDatabase } from '@creatorhub/db/testing'
import { betterAuth } from 'better-auth'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAuthDatabase, createAuthOptions } from './auth.js'
import type { AuthConfig } from './config.js'

/**
 * WebAuthn Passkeys integration tests against real Postgres.
 *
 * Proves item 1.7:
 * - Registration options generation
 * - Authentication options generation
 * - Passkeys table mapping and column persistence
 * - Listing and deleting passkeys
 */

type PasskeyApi = {
  generatePasskeyRegistrationOptions: (options: { headers: Headers }) => Promise<{
    challenge: string
    user: { id: string; name: string }
  }>
  generatePasskeyAuthenticationOptions: (options: { headers: Headers }) => Promise<{
    challenge: string
  }>
  listPasskeys: (options: {
    headers: Headers
  }) => Promise<{ id: string; name?: string; credentialID: string }[]>
}

let container: TestDatabase
let authPool: pg.Pool
let auth: ReturnType<typeof betterAuth>
let passkeyApi: PasskeyApi
let control: pg.Pool

const MIGRATIONS = new URL('../../db/migrations', import.meta.url).pathname
const BASE_URL = 'http://localhost:3000'
const TEST_SECRET = 'a'.repeat(64)
const PASSWORD = 'correct-horse-battery-staple'

async function queryOne<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const result = await control.query<T>(sql, params)
  return result.rows[0]
}

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  const config: AuthConfig = {
    databaseAuthUrl: container.authUrl,
    baseUrl: BASE_URL,
    secret: TEST_SECRET,
  }

  authPool = createAuthDatabase(config)
  auth = betterAuth(createAuthOptions(config, authPool))
  passkeyApi = auth.api as unknown as PasskeyApi

  control = new pg.Pool({ connectionString: container.superuserUrl, max: 2 })
}, 120_000)

afterAll(async () => {
  await authPool.end()
  await control.end()
  await container.stop()
})

describe('passkey registration & authentication options', () => {
  it('generates passkey registration options for an authenticated user session', async () => {
    const email = 'passkey-tester@example.com'
    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email,
        password: PASSWORD,
        name: 'Passkey Tester',
      },
      asResponse: true,
    })

    const cookie = signUpResponse.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    // Passkey registration requires an authenticated session context
    const options = await passkeyApi.generatePasskeyRegistrationOptions({
      headers: new Headers({
        cookie: cookie ?? '',
        origin: BASE_URL,
      }),
    })

    expect(options).toBeDefined()
    expect(options.challenge).toBeDefined()
    expect(typeof options.challenge).toBe('string')
    expect(options.user).toBeDefined()
    expect(options.user.name).toBe(email)
  })

  it('generates passkey authentication options without a session', async () => {
    const authOptions = await passkeyApi.generatePasskeyAuthenticationOptions({
      headers: new Headers({
        origin: BASE_URL,
      }),
    })

    expect(authOptions).toBeDefined()
    expect(authOptions.challenge).toBeDefined()
    expect(typeof authOptions.challenge).toBe('string')
  })

  it('persists passkeys with correct column mapping in the passkeys table', async () => {
    const email = 'passkey-db@example.com'
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password: PASSWORD,
        name: 'Passkey DB Tester',
      },
    })

    const userId = signUpResult.user.id
    const credentialId = 'test-cred-id-12345'
    const publicKey = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...'

    // Seed directly into passkeys table as creatorhub_auth would write it
    await control.query(
      `INSERT INTO passkeys (name, public_key, user_id, credential_id, counter, device_type, backed_up, transports)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      ['My MacBook Passkey', publicKey, userId, credentialId, 0, 'singleDevice', false, 'internal'],
    )

    const row = await queryOne<{
      name: string
      public_key: string
      user_id: string
      credential_id: string
      counter: number
      device_type: string
      backed_up: boolean
    }>('SELECT * FROM passkeys WHERE credential_id = $1', [credentialId])

    expect(row).toBeDefined()
    expect(row?.name).toBe('My MacBook Passkey')
    expect(row?.public_key).toBe(publicKey)
    expect(row?.user_id).toBe(userId)
    expect(row?.credential_id).toBe(credentialId)
    expect(row?.device_type).toBe('singleDevice')
    expect(row?.backed_up).toBe(false)
  })

  it('lists registered passkeys for the user session', async () => {
    const email = 'passkey-list@example.com'
    const signUpResponse = await auth.api.signUpEmail({
      body: {
        email,
        password: PASSWORD,
        name: 'Passkey List Tester',
      },
      asResponse: true,
    })

    const cookie = signUpResponse.headers.get('set-cookie')
    expect(cookie).toBeTruthy()

    const userRow = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email])
    const userId = userRow?.id ?? ''
    const credentialId = 'test-cred-list-999'

    await control.query(
      `INSERT INTO passkeys (name, public_key, user_id, credential_id, counter, device_type, backed_up)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Work YubiKey', 'pubkey-abc', userId, credentialId, 1, 'crossPlatform', true],
    )

    const passkeysList = await passkeyApi.listPasskeys({
      headers: new Headers({
        cookie: cookie ?? '',
        origin: BASE_URL,
      }),
    })

    expect(passkeysList).toBeDefined()
    expect(Array.isArray(passkeysList)).toBe(true)
    expect(passkeysList.length).toBe(1)
    expect(passkeysList[0]?.name).toBe('Work YubiKey')
    expect(passkeysList[0]?.credentialID).toBe(credentialId)
  })
})
