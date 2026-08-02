import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runMigrations } from '../migrate.js'
import { startTestDatabase, type TestDatabase } from '../testing/harness.js'

/**
 * Proves the derivation in ADR-0018.
 *
 * `users` carries two columns for one fact: `email_verified`, which Better Auth
 * writes, and `email_verified_at`, which is ours and authoritative. A trigger
 * derives the second from the first.
 *
 * A trigger is invisible at the call site, which is exactly why it needs a test.
 * Someone reading an INSERT will not see the timestamp being set, so the only
 * thing standing between the derivation and silent breakage is this file. Delete
 * the trigger from migration 0004 and every case below fails.
 *
 * Run as the auth role rather than the superuser wherever the flow being modelled
 * is one authentication performs, because a trigger that works for a superuser
 * and fails for `creatorhub_auth` is a trigger that fails in production.
 */

let container: TestDatabase
let auth: postgres.Sql
let control: postgres.Sql

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname

type UserRow = {
  id: string
  email_verified: boolean
  email_verified_at: Date | null
}

/** Unique per case, so no test depends on another having cleaned up. */
let counter = 0
const nextEmail = () => `verify-${String(++counter)}@example.com`

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  control = postgres(container.superuserUrl, { max: 1, onnotice: () => undefined })
  auth = postgres(container.authUrl, { max: 1, onnotice: () => undefined })
}, 120_000)

afterAll(async () => {
  await auth.end()
  await control.end()
  await container.stop()
})

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

describe('on insert', () => {
  // The sign-up path. Better Auth inserts with emailVerified false, and the
  // timestamp must stay null rather than recording the moment of sign-up as a
  // verification that never happened.
  it('leaves the timestamp null when the flag is false', async () => {
    const [row] = await auth<UserRow[]>`
      insert into users (email, name, email_verified)
      values (${nextEmail()}, 'Unverified', false)
      returning id, email_verified, email_verified_at
    `

    expect(row?.email_verified).toBe(false)
    expect(row?.email_verified_at).toBeNull()
  })

  // The default, which is what an insert that names no verification column gets.
  it('defaults the flag to false and the timestamp to null', async () => {
    const [row] = await auth<UserRow[]>`
      insert into users (email, name)
      values (${nextEmail()}, 'Defaulted')
      returning id, email_verified, email_verified_at
    `

    expect(row?.email_verified).toBe(false)
    expect(row?.email_verified_at).toBeNull()
  })

  // A user created already verified, which is what a social sign-in or an
  // administrative import produces. The timestamp is set even though the caller
  // never mentioned it.
  it('sets the timestamp when the flag is true', async () => {
    const [row] = await auth<UserRow[]>`
      insert into users (email, name, email_verified)
      values (${nextEmail()}, 'Preverified', true)
      returning id, email_verified, email_verified_at
    `

    expect(row?.email_verified).toBe(true)
    expect(row?.email_verified_at).not.toBeNull()
  })

  // An explicit timestamp is not overwritten, so a backfill can carry the real
  // verification date rather than the date of the import.
  it('respects a timestamp supplied alongside the flag', async () => {
    const supplied = new Date('2025-01-15T10:30:00.000Z')

    const [row] = await auth<UserRow[]>`
      insert into users (email, name, email_verified, email_verified_at)
      values (${nextEmail()}, 'Imported', true, ${supplied})
      returning id, email_verified, email_verified_at
    `

    expect(row?.email_verified_at?.toISOString()).toBe(supplied.toISOString())
  })
})

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe('on update', () => {
  // The verification path, and the case that matters most. Better Auth flips the
  // boolean; nothing in its code knows our timestamp exists.
  it('sets the timestamp when the flag goes false to true', async () => {
    const email = nextEmail()

    const [created] = await auth<UserRow[]>`
      insert into users (email, name) values (${email}, 'Verifying')
      returning id, email_verified, email_verified_at
    `
    expect(created?.email_verified_at).toBeNull()

    const [updated] = await auth<UserRow[]>`
      update users set email_verified = true where id = ${created?.id ?? ''}
      returning id, email_verified, email_verified_at
    `

    expect(updated?.email_verified).toBe(true)
    expect(updated?.email_verified_at).not.toBeNull()
  })

  // Changing an email address resets verification. The timestamp must clear, or
  // the two columns disagree and a reader has to guess which is right.
  it('clears the timestamp when the flag goes true to false', async () => {
    const [created] = await auth<UserRow[]>`
      insert into users (email, name, email_verified)
      values (${nextEmail()}, 'Unverifying', true)
      returning id, email_verified, email_verified_at
    `
    expect(created?.email_verified_at).not.toBeNull()

    const [updated] = await auth<UserRow[]>`
      update users set email_verified = false where id = ${created?.id ?? ''}
      returning id, email_verified, email_verified_at
    `

    expect(updated?.email_verified).toBe(false)
    expect(updated?.email_verified_at).toBeNull()
  })

  // Idempotence. Verifying an already-verified user must not move the timestamp,
  // because the answer to "when was this verified" is the first time, not the
  // most recent write.
  it('does not move the timestamp when the flag is set true again', async () => {
    const [created] = await auth<UserRow[]>`
      insert into users (email, name, email_verified)
      values (${nextEmail()}, 'Reverifying', true)
      returning id, email_verified, email_verified_at
    `

    const [updated] = await auth<UserRow[]>`
      update users set email_verified = true where id = ${created?.id ?? ''}
      returning id, email_verified, email_verified_at
    `

    expect(updated?.email_verified_at?.toISOString()).toBe(
      created?.email_verified_at?.toISOString(),
    )
  })

  // An unrelated update must not touch verification state. The trigger is scoped
  // to the column with `UPDATE OF`, and this is what that scoping buys.
  it('leaves verification alone when another column changes', async () => {
    const [created] = await auth<UserRow[]>`
      insert into users (email, name, email_verified)
      values (${nextEmail()}, 'Renaming', true)
      returning id, email_verified, email_verified_at
    `

    const [updated] = await auth<UserRow[]>`
      update users set name = 'Renamed' where id = ${created?.id ?? ''}
      returning id, email_verified, email_verified_at
    `

    expect(updated?.email_verified).toBe(true)
    expect(updated?.email_verified_at?.toISOString()).toBe(
      created?.email_verified_at?.toISOString(),
    )
  })
})

// ---------------------------------------------------------------------------
// The column contract Better Auth depends on
// ---------------------------------------------------------------------------

describe('the column', () => {
  // The library declares the field `required: true` and reads it on every
  // session resolution. A nullable column would hand it null where it expects a
  // boolean, which surfaces as a session that cannot be resolved rather than as a
  // schema error.
  it('is not null with a default of false', async () => {
    const [row] = await control<{ is_nullable: string; column_default: string | null }[]>`
      select is_nullable, column_default
      from information_schema.columns
      where table_name = 'users' and column_name = 'email_verified'
    `

    expect(row?.is_nullable).toBe('NO')
    expect(row?.column_default).toContain('false')
  })

  it('is a boolean, which is the type the library declares', async () => {
    const [row] = await control<{ data_type: string }[]>`
      select data_type from information_schema.columns
      where table_name = 'users' and column_name = 'email_verified'
    `

    expect(row?.data_type).toBe('boolean')
  })

  // Both triggers exist. Named rather than counted, because a count passes when
  // one trigger is replaced by an unrelated one.
  it.each(['trg_users__set_email_verified_at_insert', 'trg_users__sync_email_verified_at_update'])(
    'has the trigger %s',
    async (name) => {
      const rows = await control<{ tgname: string }[]>`
      select tgname from pg_trigger
      where tgrelid = 'users'::regclass and not tgisinternal and tgname = ${name}
    `

      expect(rows).toHaveLength(1)
    },
  )
})
