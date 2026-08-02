/**
 * Session records: login history and device management.
 *
 * Responsibilities: read and revoke session rows directly.
 * Dependencies: pg. No Better Auth import.
 *
 * This queries the `sessions` table rather than calling through Better Auth's
 * endpoint API, and that is a deliberate choice rather than a shortcut.
 *
 * The library's session endpoints are HTTP handlers. Calling them from server
 * code means constructing a `Request` with the right cookie header and reading a
 * `Response` back, so a function that wants "this user's devices" has to forge
 * the request that would have asked for them. That is awkward to type, awkward to
 * test, and couples our code to the library's wire format instead of its data.
 *
 * The table is ours. It is declared in `packages/db/src/schema/auth.ts`, its
 * shape is fixed by a reviewed migration, and reading it is a query. The one
 * thing that must stay true is that revocation deletes the row, because
 * ADR-0006 requires sign-out-everywhere to be real and a row that still exists
 * is a session that still works.
 *
 * Connects as `creatorhub_auth`. The application role has no privilege on this
 * table at all (ADR-0017), so this cannot live in `packages/db`.
 */
import pg from 'pg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One active session, as shown on a "your devices" screen.
 *
 * `ipAddress` and `userAgent` are nullable because a session created by a
 * non-browser client may carry neither, and a screen has to render that case
 * rather than assume it away.
 */
export type SessionRecord = {
  readonly id: string
  readonly userId: string
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly createdAt: Date
  readonly expiresAt: Date
}

export type SessionStore = {
  /**
   * Every unexpired session for a user, newest first.
   *
   * Expired rows are excluded rather than returned and filtered by the caller,
   * because a screen listing an expired session as an active device is wrong in
   * a way the user cannot act on.
   */
  listActive: (userId: string) => Promise<SessionRecord[]>

  /** Revoke one session. Returns false when it did not exist or was not theirs. */
  revoke: (userId: string, sessionId: string) => Promise<boolean>

  /**
   * Revoke every session except the one given. This is "sign out other
   * devices": the caller keeps working and everything else stops.
   */
  revokeOthers: (userId: string, keepSessionId: string) => Promise<number>

  /**
   * Revoke every session including the current one. This is what a password
   * change and a role change trigger, per the rotation policy in ADR-0017.
   */
  revokeAll: (userId: string) => Promise<number>

  /** Delete expired rows. Called by a scheduled job, not on the request path. */
  deleteExpired: () => Promise<number>

  close: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string
  user_id: string
  ip_address: string | null
  user_agent: string | null
  created_at: Date
  expires_at: Date
}

function toRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

export function createSessionStore(connectionString: string): SessionStore {
  const pool = new pg.Pool({ connectionString, max: 3 })

  return {
    async listActive(userId) {
      const result = await pool.query<SessionRow>(
        `select id, user_id, ip_address, user_agent, created_at, expires_at
         from sessions
         where user_id = $1 and expires_at > now()
         order by created_at desc`,
        [userId],
      )

      return result.rows.map(toRecord)
    },

    // Every mutation is scoped by user_id as well as session id. A session id is
    // not a secret in the way a token is, and without the user predicate a
    // caller holding someone else's session id could revoke it.
    async revoke(userId, sessionId) {
      const result = await pool.query(`delete from sessions where user_id = $1 and id = $2`, [
        userId,
        sessionId,
      ])

      return (result.rowCount ?? 0) > 0
    },

    async revokeOthers(userId, keepSessionId) {
      const result = await pool.query(`delete from sessions where user_id = $1 and id <> $2`, [
        userId,
        keepSessionId,
      ])

      return result.rowCount ?? 0
    },

    async revokeAll(userId) {
      const result = await pool.query(`delete from sessions where user_id = $1`, [userId])

      return result.rowCount ?? 0
    },

    async deleteExpired() {
      const result = await pool.query(`delete from sessions where expires_at <= now()`)

      return result.rowCount ?? 0
    },

    async close() {
      await pool.end()
    },
  }
}
