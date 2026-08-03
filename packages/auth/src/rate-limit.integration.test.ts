import { runMigrations, startTestDatabase, type TestDatabase } from '@creatorhub/db/testing'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ACCOUNT_LIMITS, createRateLimiter, type RateLimiter } from './rate-limit.js'

/**
 * The per-account rate limiter, against a real Postgres.
 *
 * The arithmetic is covered by the unit tests. What needs a database is the
 * counting: that two attempts in one window accumulate, that a window expiring
 * resets, that success clears, and that the counter is atomic under concurrency.
 *
 * The last one is the reason this suite exists rather than a mock. A limiter that
 * reads a count, adds one, and writes it back loses increments the moment two
 * attempts arrive together, and losing increments is exactly the property an
 * attacker exploits: fire ten requests at once and the counter registers two.
 * That failure is invisible without a real transaction.
 */

let container: TestDatabase
let limiter: RateLimiter
let control: pg.Pool

const MIGRATIONS = new URL('../../db/migrations', import.meta.url).pathname

let counter = 0
const nextEmail = () => `limit-${String(++counter)}@example.com`

beforeAll(async () => {
  container = await startTestDatabase()
  await runMigrations({ migrationUrl: container.migrationUrl, migrationsFolder: MIGRATIONS })

  limiter = createRateLimiter(container.authUrl)
  control = new pg.Pool({ connectionString: container.superuserUrl, max: 2 })
}, 120_000)

afterAll(async () => {
  // The pool before the container, or in-flight queries fail with 57P01 and the
  // failure names the wrong thing entirely.
  await limiter.close()
  await control.end()
  await container.stop()
})

beforeEach(async () => {
  await control.query('delete from rate_limits')
})

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

describe('counting failures', () => {
  it('allows an account that has never failed', async () => {
    const decision = await limiter.check('sign-in', nextEmail())

    expect(decision.allowed).toBe(true)
  })

  it('allows attempts up to the limit', async () => {
    const email = nextEmail()

    for (let attempt = 1; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      const decision = await limiter.recordFailure('sign-in', email)

      expect(decision.allowed).toBe(true)
    }
  })

  it('refuses the attempt after the limit, with a retry time', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    const decision = await limiter.check('sign-in', email)

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      // Fifteen minutes in seconds, which is what `Retry-After` takes.
      expect(decision.retryAfter).toBe(15 * 60)
    }
  })

  it('counts one row per account, not one per attempt', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    const result = await control.query<{ count: string }>(
      'select count(*) as count from rate_limits',
    )

    expect(Number(result.rows[0]?.count)).toBe(1)
  })

  // Two people failing to sign in must not share a counter, or one person
  // mistyping their password locks out the other.
  it('counts each account separately', async () => {
    const first = nextEmail()
    const second = nextEmail()

    for (let attempt = 0; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      await limiter.recordFailure('sign-in', first)
    }

    expect((await limiter.check('sign-in', first)).allowed).toBe(false)
    expect((await limiter.check('sign-in', second)).allowed).toBe(true)
  })

  // Each action has its own limit, so failing to sign in must not consume the
  // allowance for requesting a reset. Otherwise someone locked out of their
  // account also cannot recover it, which is the worst possible time to refuse.
  it('counts each action separately', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    expect((await limiter.check('sign-in', email)).allowed).toBe(false)
    expect((await limiter.check('password-reset-hourly', email)).allowed).toBe(true)
  })

  // `users.email` is citext, so these are one account. Without lowercasing, an
  // attacker resets the counter by changing the case of a single letter.
  it('treats the address case-insensitively', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      await limiter.recordFailure('sign-in', email.toUpperCase())
    }

    expect((await limiter.check('sign-in', email.toLowerCase())).allowed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Clearing and expiry
// ---------------------------------------------------------------------------

describe('clearing', () => {
  // The counter means "consecutive failures", not "attempts". Someone who
  // mistypes four times and then succeeds should not be one failure away from
  // being locked out for the rest of the window.
  it('forgets failures once the account signs in', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    await limiter.clear('sign-in', email)

    expect((await limiter.check('sign-in', email)).allowed).toBe(true)

    const result = await control.query<{ count: string }>(
      'select count(*) as count from rate_limits',
    )
    expect(Number(result.rows[0]?.count)).toBe(0)
  })

  it('clears only the action asked for', async () => {
    const email = nextEmail()

    await limiter.recordFailure('sign-in', email)
    await limiter.recordFailure('password-reset-hourly', email)

    await limiter.clear('sign-in', email)

    const result = await control.query<{ key: string }>('select key from rate_limits')

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.key).toContain('password-reset-hourly')
  })
})

describe('the window', () => {
  // Backdated rather than waited out: the sign-in window is fifteen minutes, and
  // a test that sleeps for it is a test nobody runs. `last_request` is the only
  // input to the expiry decision, so moving it is a faithful simulation.
  it('resets once the previous attempt falls outside it', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt <= ACCOUNT_LIMITS['sign-in'].max; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    expect((await limiter.check('sign-in', email)).allowed).toBe(false)

    const past = Date.now() - ACCOUNT_LIMITS['sign-in'].window - 1000
    await control.query('update rate_limits set last_request = $1', [past])

    expect((await limiter.check('sign-in', email)).allowed).toBe(true)
  })

  // The reset has to happen on the count as well as the decision. If the row kept
  // its old count and only the check ignored it, the next single failure would
  // push it straight back over the limit.
  it('restarts the count at one after expiry', async () => {
    const email = nextEmail()

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await limiter.recordFailure('sign-in', email)
    }

    const past = Date.now() - ACCOUNT_LIMITS['sign-in'].window - 1000
    await control.query('update rate_limits set last_request = $1', [past])

    await limiter.recordFailure('sign-in', email)

    const result = await control.query<{ count: number }>('select count from rate_limits')

    expect(result.rows[0]?.count).toBe(1)
  })

  it('holds the count while still inside the window', async () => {
    const email = nextEmail()

    await limiter.recordFailure('sign-in', email)
    await limiter.recordFailure('sign-in', email)

    const result = await control.query<{ count: number }>('select count from rate_limits')

    expect(result.rows[0]?.count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

describe('under concurrency', () => {
  // The case a mock cannot catch, and the one an attacker uses. Read-modify-write
  // loses increments when requests overlap, so ten simultaneous attempts register
  // as two or three and the limit never trips.
  //
  // The counter is a single INSERT ... ON CONFLICT DO UPDATE, so Postgres
  // serialises the contending statements on the unique index and every increment
  // lands.
  it('loses no increments when attempts arrive together', async () => {
    const email = nextEmail()
    const attempts = 20

    await Promise.all(
      Array.from({ length: attempts }, () => limiter.recordFailure('sign-in', email)),
    )

    const result = await control.query<{ count: number }>('select count from rate_limits')

    expect(result.rows[0]?.count).toBe(attempts)
  })

  it('refuses after concurrent attempts pass the limit', async () => {
    const email = nextEmail()

    await Promise.all(Array.from({ length: 20 }, () => limiter.recordFailure('sign-in', email)))

    expect((await limiter.check('sign-in', email)).allowed).toBe(false)
  })

  it('keeps one row under contention', async () => {
    const email = nextEmail()

    await Promise.all(Array.from({ length: 20 }, () => limiter.recordFailure('sign-in', email)))

    const result = await control.query<{ count: string }>(
      'select count(*) as count from rate_limits',
    )

    expect(Number(result.rows[0]?.count)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

describe('pruning', () => {
  it('deletes counters older than the longest window', async () => {
    const email = nextEmail()
    await limiter.recordFailure('sign-in', email)

    const longest = Math.max(...Object.values(ACCOUNT_LIMITS).map((limit) => limit.window))
    await control.query('update rate_limits set last_request = $1', [Date.now() - longest - 60_000])

    expect(await limiter.prune()).toBe(1)

    const result = await control.query<{ count: string }>(
      'select count(*) as count from rate_limits',
    )
    expect(Number(result.rows[0]?.count)).toBe(0)
  })

  // A prune that deletes a live counter is a limiter that resets on a cron, which
  // is worse than no cron at all: the attack window becomes predictable.
  it('leaves a counter that is still in force', async () => {
    await limiter.recordFailure('sign-in', nextEmail())

    expect(await limiter.prune()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// The role separation
// ---------------------------------------------------------------------------

describe('the rate_limits table', () => {
  // ADR-0017. The counters sit with the other pre-session tables, and the
  // application role has no privilege on them at all. Migration 0006 revokes
  // rather than merely omitting, because ADR-0015's default privileges had
  // already granted everything.
  it('is unreachable by the application role', async () => {
    const app = new pg.Pool({ connectionString: container.databaseUrl, max: 1 })

    try {
      await expect(app.query('select count(*) from rate_limits')).rejects.toMatchObject({
        code: '42501',
      })
    } finally {
      await app.end()
    }
  })

  it('has row level security enabled and forced', async () => {
    const result = await control.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'rate_limits'`,
    )

    expect(result.rows[0]?.relrowsecurity).toBe(true)
    expect(result.rows[0]?.relforcerowsecurity).toBe(true)
  })

  // A policy with no role clause applies to every role, including any added
  // later. Every policy on this table names the one role that should reach it.
  it('scopes its policy to the auth role', async () => {
    const result = await control.query<{ roles: string[] }>(
      `select roles::text[] from pg_policies where tablename = 'rate_limits'`,
    )

    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(row.roles).not.toContain('public')
      expect(row.roles).toContain('creatorhub_auth')
    }
  })

  // Two rows for one key is a counter that has forked, and a forked counter
  // limits nothing: each half stays under the threshold.
  it('refuses a second row for the same key', async () => {
    await control.query(
      `insert into rate_limits (key, count, last_request) values ('dup', 1, $1)`,
      [Date.now()],
    )

    await expect(
      control.query(`insert into rate_limits (key, count, last_request) values ('dup', 1, $1)`, [
        Date.now(),
      ]),
    ).rejects.toMatchObject({ code: '23505' })
  })
})
