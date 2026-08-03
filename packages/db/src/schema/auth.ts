/**
 * Authentication tables, owned by Better Auth (ADR-0006).
 *
 * Responsibilities: declare the shape Better Auth expects, so migrations are
 * reviewed SQL like every other table rather than generated at runtime.
 * Dependencies: drizzle-orm, and `users` from the identity schema.
 *
 * These are declared here despite the library owning them, and that is a change
 * of position worth stating. The earlier reasoning was that declaring a table the
 * library also migrates gives one schema two sources of truth. That is right,
 * and the resolution is that Better Auth's own migration generator is never run:
 * ADR-0005 rule 2 requires migrations be reviewed as SQL, and a library that
 * mutates the schema at boot cannot satisfy that. So these declarations are the
 * single source of truth, and the library is configured to match them.
 *
 * None of these tables carries `workspace_id`, and that is not an oversight. A
 * session belongs to a person, not a workspace, and one session acts across
 * every workspace its user belongs to. They are reached only by
 * `creatorhub_auth` (ADR-0017), and the tenancy check has them declared as
 * exemptions with those reasons.
 *
 * Column names follow our convention rather than the library's. Better Auth
 * defaults to singular table names and camelCase columns; the mapping lives in
 * the auth package configuration, in one place, rather than bending the data
 * model to a dependency.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './identity.js'

// ---------------------------------------------------------------------------
// Shared column builders
// ---------------------------------------------------------------------------

const primaryKey = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/**
 * Every auth table cascades from its user. Deleting a person must not leave
 * their sessions behind: an orphaned session row is a credential with no owner.
 *
 * This is the opposite choice from `audit_logs`, which uses `ON DELETE restrict`
 * so history survives. The difference is that a session is a live capability and
 * an audit row is evidence.
 */
const userReference = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

/**
 * Server-side session records, which is what makes "sign out everywhere" real
 * (ADR-0006). A stateless token cannot be revoked before it expires.
 *
 * `ip_address` and `user_agent` are recorded here rather than in a separate log,
 * so login history and the device list are reads of this table. One row per
 * sign-in, and revoking a device is deleting the row it names.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryKey(),
    userId: userReference(),

    /**
     * The session token, stored hashed by the library, never the raw value in a
     * readable column. Unique because it is looked up on every authenticated
     * request and two sessions sharing one token would be a collision no code
     * could recover from.
     */
    token: text('token').notNull(),

    /**
     * Absolute expiry, 30 days from creation per ADR-0017. The idle timeout is
     * enforced by the library refreshing this column, so an abandoned session
     * stops being refreshed and expires on its own.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('uq_sessions__token').on(table.token),

    // Every authenticated request resolves a session, and "list my devices"
    // and "sign out everywhere" both scan by user.
    index('idx_sessions__user').on(table.userId),

    // The cleanup job deletes expired rows; without this it is a full scan that
    // grows with every sign-in ever made.
    index('idx_sessions__expires_at').on(table.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

/**
 * Credentials, one row per authentication method per user.
 *
 * For email and password there is one row with `provider_id = 'credential'` and
 * the Argon2id hash in `password`. Social providers, when they arrive, add rows
 * rather than columns.
 *
 * The OAuth token columns are declared because Better Auth writes them, and are
 * unused in M1 since no social provider is configured. They exist now so that
 * adding one is a configuration change rather than a migration on a populated
 * table.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryKey(),
    userId: userReference(),

    /** The provider's own identifier for this user. For credentials, our user id. */
    accountId: text('account_id').notNull(),

    /** `credential` for email and password. A provider name otherwise. */
    providerId: text('provider_id').notNull(),

    /**
     * The Argon2id hash. Null for social providers, which have no password.
     *
     * `creatorhub_app` has no privilege on this table at all (ADR-0017), so
     * feature code cannot read this column even with a tenant set.
     */
    password: text('password'),

    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // One account per provider per user. Without this a second sign-up through
    // the same provider silently creates a duplicate credential.
    uniqueIndex('uq_accounts__provider_account').on(table.providerId, table.accountId),

    index('idx_accounts__user').on(table.userId),
  ],
)

// ---------------------------------------------------------------------------
// verification_tokens
// ---------------------------------------------------------------------------

/**
 * Short-lived tokens for email verification and password reset.
 *
 * Single use and hashed at rest: the row is deleted when redeemed, and `value`
 * holds a hash rather than the token that was emailed. A leaked database backup
 * therefore does not yield working reset links.
 *
 * Expiry is 15 to 30 minutes depending on the flow, set by the library rather
 * than by a database default, because the two flows differ and a column default
 * would have to pick one.
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: primaryKey(),

    /** What is being verified: an email address, or a reset request subject. */
    identifier: text('identifier').notNull(),

    /** The hashed token. Never the value that was sent. */
    value: text('value').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_verification_tokens__identifier').on(table.identifier),
    index('idx_verification_tokens__expires_at').on(table.expiresAt),
  ],
)

// ---------------------------------------------------------------------------
// rate_limits
// ---------------------------------------------------------------------------

/**
 * Request counters, for item 1.9.
 *
 * Two dimensions share this table. Better Auth owns the per-IP, per-path counters
 * and keys them itself; `packages/auth` writes the per-account counters with a
 * namespaced key, because the library never learns which account a failed
 * sign-in was for and a limiter keyed on address alone is defeated by anyone with
 * a few addresses.
 *
 * Not tenant-scoped, and could not be: rate limiting happens before there is a
 * session, so before any workspace is known. That is the same reason the other
 * tables in this file are exempt, and the same role reaches them all (ADR-0017).
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    id: primaryKey(),

    /** `${ip}:${path}` from the library, or `account:${action}:${email}` from ours. */
    key: text('key').notNull(),

    count: integer('count').notNull().default(0),

    /**
     * Epoch milliseconds, because that is what the library writes. A
     * `timestamptz` would be the better column and would also stop the library's
     * own queries working, so the type follows the dependency here.
     */
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),

    createdAt: createdAt(),
  },
  (table) => [
    // A second row for one key is a counter that has forked and stopped
    // limiting, which is the failure mode that matters.
    uniqueIndex('uq_rate_limits__key').on(table.key),

    // The cleanup job scans by window. Without this it reads every key ever
    // seen, which on the sign-in path is every address that has ever tried.
    index('idx_rate_limits__last_request').on(table.lastRequest),
  ],
)

// ---------------------------------------------------------------------------
// Registry entries
// ---------------------------------------------------------------------------

/**
 * Declared exemptions for the tenancy check (item 1.5), with reasons.
 *
 * The check requires every table to have `workspace_id` or an entry here. These
 * three are genuinely not tenant-scoped, and each still needs RLS enabled,
 * forced, and a policy, which the check enforces separately.
 */
export const AUTH_TABLES_WITHOUT_WORKSPACE = {
  sessions:
    'A session belongs to a person, not a workspace. One session acts across every workspace its user is a member of. Reached only by creatorhub_auth (ADR-0017).',
  accounts:
    'A credential belongs to a person, not a workspace. Reached only by creatorhub_auth, and creatorhub_app has no privilege on it at all (ADR-0017).',
  verification_tokens:
    'A verification token is issued before any workspace context exists, and often before the user has one. Reached only by creatorhub_auth (ADR-0017).',
  rate_limits:
    'A rate limit is counted before there is a session, so before any workspace is known. Keyed by address and path, or by account, neither of which is a tenant. Reached only by creatorhub_auth (ADR-0017).',
} as const
