/**
 * Rate limiting. Item 1.9.
 *
 * Responsibilities: hold the limits in one place, and count attempts per account
 * as well as per address.
 * Dependencies: pg. No Better Auth import.
 *
 * **Why there are two limiters and not one.** Better Auth's `rateLimit` option
 * keys on the client address and the request path, which stops one machine
 * hammering one endpoint. It cannot key on the account, because at the point the
 * limiter runs the library has not yet decided which account a request concerns,
 * and by the time it has, the request is already being served.
 *
 * Address alone is not enough, in both directions:
 *
 *   Too weak. Someone with a few dozen addresses, which is a morning's work,
 *   gets a few dozen times the attempts against one person's password. The limit
 *   that protects an individual account has to be counted against that account.
 *
 *   Too strong. An office, a university, or a mobile carrier puts thousands of
 *   people behind one address. A limit tight enough to stop an attacker locks out
 *   everyone who shares their NAT.
 *
 * So the address limits stay loose and per-path, in the library, and the tight
 * limits are per-account, here. Neither alone is the control; the pair is.
 *
 * **Failures are counted, successes are not.** A rate limiter that counts every
 * sign-in punishes the person who mistypes once and then succeeds. `recordFailure`
 * is called on rejection and `clear` on success, which is what makes the counter
 * mean "consecutive failures" rather than "attempts".
 *
 * Connects as `creatorhub_auth`, because the counters live in a table only that
 * role reaches (ADR-0017). This module never sees a workspace: rate limiting
 * happens before any session exists.
 */
import pg from 'pg'

// ---------------------------------------------------------------------------
// The limits
//
// From the founder's instructions, recorded here rather than in prose so that
// changing one is a code review rather than a discovery.
// ---------------------------------------------------------------------------

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * One limit: how many, in how long.
 *
 * `window` is milliseconds because that is what `Date.now()` gives and what the
 * `last_request` column holds. Named units above keep the declarations readable
 * without a comment explaining each number.
 */
export type Limit = {
  readonly max: number
  readonly window: number
}

/**
 * What is being limited.
 *
 * A closed union rather than a string, so a typo is a compile error rather than
 * a limiter that silently counts nothing. Every member has an entry in
 * `ACCOUNT_LIMITS` below, which the type system enforces.
 */
export type LimitedAction =
  'sign-in' | 'password-reset-hourly' | 'password-reset-daily' | 'verification-resend'

/**
 * Per-account limits, counted against the address being attempted.
 *
 * These are the ones that protect an individual creator. The `Record` is
 * exhaustive over `LimitedAction`, so adding an action without deciding its limit
 * fails to compile.
 */
export const ACCOUNT_LIMITS: Record<LimitedAction, Limit> = {
  /**
   * Five failed sign-ins per fifteen minutes.
   *
   * Tight, because it counts consecutive failures against one account and a
   * legitimate person does not fail five times in a quarter of an hour. Combined
   * with Argon2id at 19 MiB, an attacker gets five guesses per fifteen minutes
   * per account no matter how many addresses they have.
   */
  'sign-in': { max: 5, window: 15 * MINUTE },

  /**
   * Three password resets an hour, ten a day.
   *
   * Both, because the hourly limit alone permits 72 emails a day to someone who
   * did not ask for any, which is a way to use us to harass a person.
   */
  'password-reset-hourly': { max: 3, window: HOUR },
  'password-reset-daily': { max: 10, window: DAY },

  /** Three verification emails an hour. Same reasoning as reset. */
  'verification-resend': { max: 3, window: HOUR },
}

/**
 * Per-address limits, for the library's own `customRules`.
 *
 * Deliberately looser than the per-account ones, because an address can be shared
 * by thousands of people. These stop a single machine flooding an endpoint; they
 * are not what protects one account.
 *
 * Keyed by the library's path, and `window` is in seconds here rather than
 * milliseconds, because that is the unit `BetterAuthRateLimitRule` uses. The
 * mismatch is the library's; converting at the boundary is better than storing
 * two units in one constant.
 */
export const ADDRESS_LIMITS = {
  '/sign-in/email': { window: HOUR / SECOND, max: 20 },
  '/sign-up/email': { window: HOUR / SECOND, max: 10 },
  '/request-password-reset': { window: HOUR / SECOND, max: 20 },
  '/send-verification-email': { window: HOUR / SECOND, max: 20 },
} as const

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

/**
 * How long to refuse, once the limit is passed.
 *
 * Exponential in the number of failures beyond the limit, capped. The cap exists
 * because an uncapped backoff is a denial of service against the account owner:
 * an attacker who fails often enough locks the real person out for a day, which
 * turns a failed attack into a successful one.
 *
 * Doubling from the window means the sixth failure waits 15 minutes, the seventh
 * 30, the eighth an hour, then capped.
 */
const MAX_BACKOFF = 2 * HOUR

export function backoffFor(action: LimitedAction, failures: number): number {
  const limit = ACCOUNT_LIMITS[action]
  const excess = failures - limit.max

  if (excess <= 0) {
    return 0
  }

  // 2^(excess-1) times the window, so the first refusal waits exactly one window.
  const backoff = limit.window * Math.pow(2, excess - 1)

  return Math.min(backoff, MAX_BACKOFF)
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export type RateLimitDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false

      /**
       * Seconds until the caller may retry, for the `Retry-After` header.
       *
       * Seconds rather than milliseconds because that is what the header takes,
       * and rounded up because rounding down tells the client to retry while it
       * is still refused.
       */
      readonly retryAfter: number
    }

export type RateLimiter = {
  /**
   * Is this account allowed one more attempt at this action?
   *
   * Reads without writing. The counter moves on `recordFailure`, so a successful
   * sign-in leaves no trace and an unsuccessful one costs the attempt.
   */
  check: (action: LimitedAction, identifier: string) => Promise<RateLimitDecision>

  /** Count one failure. Returns the decision that now applies. */
  recordFailure: (action: LimitedAction, identifier: string) => Promise<RateLimitDecision>

  /**
   * Forget the failures for this account and action.
   *
   * Called on success. Without it, five failures followed by a correct password
   * still leaves the account one failure from being locked, so a person who
   * eventually remembers their password is punished for the attempts that got
   * them there.
   */
  clear: (action: LimitedAction, identifier: string) => Promise<void>

  /** Delete counters whose window has passed. For a scheduled job. */
  prune: () => Promise<number>

  close: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * The key an account counter is stored under.
 *
 * Namespaced with `account:` so it cannot collide with the library's own
 * `${ip}:${path}` keys in the same table, and so a query can tell the two apart.
 *
 * The identifier is lowercased, because `Ada@example.com` and `ada@example.com`
 * are one account: `users.email` is `citext`. Without this, changing the case of
 * one letter resets the counter.
 */
function keyFor(action: LimitedAction, identifier: string): string {
  return `account:${action}:${identifier.toLowerCase()}`
}

type CounterRow = {
  count: number
  last_request: string
}

export function createRateLimiter(connectionString: string): RateLimiter {
  const pool = new pg.Pool({ connectionString, max: 3 })

  /**
   * Read a counter, treating one outside its window as absent.
   *
   * The window is checked on read rather than by deleting expired rows, so the
   * limiter is correct whether or not the prune job has run. A limiter that
   * depends on a cron having fired is a limiter that fails open.
   */
  async function currentFailures(action: LimitedAction, identifier: string): Promise<number> {
    const limit = ACCOUNT_LIMITS[action]

    const result = await pool.query<CounterRow>(
      `select count, last_request from rate_limits where key = $1`,
      [keyFor(action, identifier)],
    )

    const row = result.rows[0]
    if (row === undefined) {
      return 0
    }

    const elapsed = Date.now() - Number(row.last_request)

    return elapsed > limit.window ? 0 : row.count
  }

  function decide(action: LimitedAction, failures: number): RateLimitDecision {
    const backoff = backoffFor(action, failures)

    if (backoff === 0) {
      return { allowed: true }
    }

    return { allowed: false, retryAfter: Math.ceil(backoff / SECOND) }
  }

  return {
    async check(action, identifier) {
      return decide(action, await currentFailures(action, identifier))
    },

    async recordFailure(action, identifier) {
      const limit = ACCOUNT_LIMITS[action]
      const key = keyFor(action, identifier)
      const now = Date.now()

      // One statement, so two simultaneous failed attempts cannot both read the
      // same count and write the same increment. The unique index on `key` makes
      // ON CONFLICT the arbiter, and Postgres serialises the two.
      //
      // The CASE resets rather than increments when the previous attempt was
      // outside the window, which is what keeps the counter meaning "failures in
      // the last N minutes" without a separate expiry pass.
      const result = await pool.query<CounterRow>(
        `insert into rate_limits (key, count, last_request)
         values ($1, 1, $2)
         on conflict (key) do update set
           count = case
             when $2::bigint - rate_limits.last_request > $3::bigint then 1
             else rate_limits.count + 1
           end,
           last_request = $2
         returning count, last_request`,
        [key, now, limit.window],
      )

      return decide(action, result.rows[0]?.count ?? 1)
    },

    async clear(action, identifier) {
      await pool.query(`delete from rate_limits where key = $1`, [keyFor(action, identifier)])
    },

    async prune() {
      // The longest window any limit uses, so nothing still in force is deleted.
      // Computed rather than written as a constant, because a new action with a
      // longer window would otherwise have its counters pruned while live.
      const longest = Math.max(...Object.values(ACCOUNT_LIMITS).map((limit) => limit.window))

      const result = await pool.query(`delete from rate_limits where last_request < $1`, [
        Date.now() - longest,
      ])

      return result.rowCount ?? 0
    },

    async close() {
      await pool.end()
    },
  }
}
