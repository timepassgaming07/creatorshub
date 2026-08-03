/**
 * Better Auth configuration.
 *
 * Responsibilities: construct the library's options against our schema, our
 * database role, and the security policies in ADR-0017.
 * Dependencies: better-auth types, pg, the Argon2id hook.
 *
 * Four things here are load-bearing, and each one was found by reading the
 * library's type definitions rather than assuming:
 *
 * 1. **The pool is created by the caller, not here.** `createAuthDatabase`
 *    returns it and `createAuthOptions` takes it. That looks like ceremony until
 *    you need to shut down: a pool constructed inside the options object is
 *    unreachable, so nothing can close it. In production that is a process that
 *    will not exit; in tests it is a container stopped while connections are
 *    still open, which surfaces as SQLSTATE 57P01 on four unrelated assertions.
 *
 * 2. **Column names are mapped per field, explicitly.** There is a `casing`
 *    option, but only on the `{ dialect, type }` and `{ db, type }` shapes of
 *    the `database` option, not when a driver pool is passed, and its
 *    documented effect is table names. The supported mechanism for columns is
 *    `fields` on each model, typed as
 *    `Partial<Record<Exclude<Keys, 'id'>, string>>`. Every field the library
 *    declares in `@better-auth/core/src/db/get-tables.ts` and whose name differs
 *    from our column is listed below. A missing entry is not a type error; it is
 *    a runtime "column does not exist" on first use.
 *
 * 3. **`modelName` remaps the table names.** The library's defaults are
 *    singular. Ours are plural, which is the convention, so each model names its
 *    table explicitly.
 *
 * 4. **`verification.expiresIn` does not exist.** Token lifetime lives on
 *    `emailVerification.expiresIn` instead. The `verification` option carries
 *    storage concerns, and `storeIdentifier: 'hashed'` is the one that matters:
 *    it is what makes tokens hashed at rest, so a leaked backup does not yield
 *    working reset links.
 *
 * Better Auth's own migration generator is never run. ADR-0005 rule 2 requires
 * migrations be reviewed as SQL, so `packages/db/src/schema/auth.ts` and the
 * migrations beside it are the single source of truth. This file is configured to
 * match that schema, not to create it.
 */
import type { BetterAuthOptions } from 'better-auth'
import pg from 'pg'

import type { AuthConfig } from './config.js'
import { argon2idPassword } from './hash.js'

// ---------------------------------------------------------------------------
// Policy constants
//
// Named rather than inlined, because a bare 2592000 in a config object is a
// number nobody can review. Every value traces to ADR-0017.
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY = 24 * 60 * 60

/** Absolute session lifetime. A session cannot outlive this regardless of use. */
const SESSION_ABSOLUTE_LIFETIME = 30 * SECONDS_PER_DAY

/**
 * Idle timeout, expressed as how often an active session is refreshed.
 *
 * Better Auth extends `expires_at` when a session is used and is older than
 * this. A session left untouched for longer stops being refreshed and expires,
 * which is what makes this an idle timeout rather than a separate mechanism.
 */
const SESSION_IDLE_REFRESH = 7 * SECONDS_PER_DAY

/** Verification and reset token lifetime, in the 15 to 30 minute band. */
const VERIFICATION_TOKEN_LIFETIME = 20 * 60

/** Pool size. Sign-in is once per session, not once per request. */
const AUTH_POOL_MAX = 5

// ---------------------------------------------------------------------------
// Table names
// ---------------------------------------------------------------------------

/**
 * Our plural table names, against the library's singular defaults.
 *
 * `verification_tokens` rather than `verifications` because the rows are tokens
 * and the name should say so.
 */
const TABLES = {
  user: 'users',
  session: 'sessions',
  account: 'accounts',
  verification: 'verification_tokens',
} as const

// ---------------------------------------------------------------------------
// Column names
//
// One entry per field whose column differs from the library's default. Fields
// that already match, `email`, `name`, `token`, `identifier`, `value`, `scope`,
// and `password`, are deliberately absent rather than mapped to themselves.
// ---------------------------------------------------------------------------

/**
 * `image` is the library's avatar field; ours is `avatar_url`, which says what
 * it holds rather than what it is.
 *
 * `emailVerified` maps to the boolean added in migration 0004, not to
 * `email_verified_at`. The library declares the field a boolean and Postgres
 * will not take one into a timestamp. The timestamp stays authoritative and is
 * derived by trigger. See ADR-0018.
 */
const USER_FIELDS = {
  emailVerified: 'email_verified',
  image: 'avatar_url',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const

const SESSION_FIELDS = {
  userId: 'user_id',
  expiresAt: 'expires_at',
  ipAddress: 'ip_address',
  userAgent: 'user_agent',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const

const ACCOUNT_FIELDS = {
  userId: 'user_id',
  accountId: 'account_id',
  providerId: 'provider_id',
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  idToken: 'id_token',
  accessTokenExpiresAt: 'access_token_expires_at',
  refreshTokenExpiresAt: 'refresh_token_expires_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const

const VERIFICATION_FIELDS = {
  expiresAt: 'expires_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * The authentication connection pool, as `creatorhub_auth`.
 *
 * Separate from the application pool in `packages/db`, which is the cost of the
 * role separation and a cheap one: this pool is touched at sign-in, not on every
 * request. The application role has no privilege on `sessions` or `accounts` at
 * all, so a pool built from `DATABASE_URL` fails on the first sign-in with a
 * permission error that names nothing useful.
 *
 * Returned rather than hidden so the caller owns the lifecycle. Whoever creates
 * it calls `end()` on it: the composition root at shutdown, the test in
 * `afterAll` before the container stops.
 */
export function createAuthDatabase(config: AuthConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.databaseAuthUrl,
    max: AUTH_POOL_MAX,
  })
}

/**
 * Build the authentication options.
 *
 * Takes config and a pool rather than reading the environment or constructing a
 * connection, so an integration test can point this at a throwaway container
 * without mutating process state and can close what it opened.
 */
export function createAuthOptions(config: AuthConfig, database: pg.Pool): BetterAuthOptions {
  return {
    appName: 'CreatorHub',

    database,

    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,

    // -------------------------------------------------------------------
    // Schema mapping
    // -------------------------------------------------------------------
    user: {
      modelName: TABLES.user,
      fields: USER_FIELDS,
    },

    account: {
      modelName: TABLES.account,
      fields: ACCOUNT_FIELDS,
    },

    session: {
      modelName: TABLES.session,
      fields: SESSION_FIELDS,
      expiresIn: SESSION_ABSOLUTE_LIFETIME,
      updateAge: SESSION_IDLE_REFRESH,

      /**
       * Deliberately not enabling the cookie cache.
       *
       * It trades a database read per request for a signed cookie holding the
       * session, which means revocation is not immediate: a revoked session
       * keeps working until the cached cookie expires. ADR-0006 requires
       * sign-out-everywhere to be real, so the read stays.
       */
    },

    verification: {
      modelName: TABLES.verification,
      fields: VERIFICATION_FIELDS,

      /**
       * Tokens hashed at rest. The row stores a hash, not the value that was
       * emailed, so a leaked database backup yields no working links.
       */
      storeIdentifier: 'hashed',
    },

    // -------------------------------------------------------------------
    // Email and password
    // -------------------------------------------------------------------
    emailAndPassword: {
      enabled: true,

      /**
       * Sign-in is allowed before verification; workspace creation is not.
       * That gate belongs to the workspace flow rather than here, because a
       * user who cannot sign in also cannot resend their verification email.
       */
      requireEmailVerification: false,

      /** Argon2id at OWASP parameters, replacing the library's scrypt default. */
      password: argon2idPassword,

      /** Long enough to matter, short enough not to push people to reuse. */
      minPasswordLength: 12,
      maxPasswordLength: 128,

      /**
       * Password reset is on, and the library refuses the endpoint outright
       * without this callback: `requestPasswordReset` answers "Reset password
       * isn't enabled" rather than failing to deliver. ADR-0017 sets rate limits
       * for the reset flow, which presumes the flow exists.
       *
       * Empty for the same reason as the verification mailer: no delivery port
       * until slice 6. The token is created and stored regardless, which is what
       * the reset endpoint needs and what the integration suite reads.
       */
      sendResetPassword: async () => {
        await Promise.resolve()
      },

      /** Reset tokens live in the same short band as verification tokens. */
      resetPasswordTokenExpiresIn: VERIFICATION_TOKEN_LIFETIME,

      /**
       * Every other session dies when the password changes. ADR-0017 requires
       * rotation on password change, and the reason is the case that matters: a
       * password is reset because someone else may have had it, so leaving their
       * session alive defeats the reset.
       */
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      expiresIn: VERIFICATION_TOKEN_LIFETIME,

      /**
       * No mailer exists until slice 6, so these are wired to the delivery port
       * then. Async and empty rather than absent: the library's type requires a
       * Promise, and a synchronous stub would be a type error that a cast would
       * hide.
       *
       * The consequence today is that a verification token is created and stored
       * but never delivered. The integration suite reads the token from the
       * database, which is what it would have to do anyway.
       */
      sendVerificationEmail: async () => {
        await Promise.resolve()
      },
    },

    // -------------------------------------------------------------------
    // Cookies and CSRF
    // -------------------------------------------------------------------
    advanced: {
      cookiePrefix: 'creatorhub',

      /**
       * ADR-0006 and ADR-0017. `SameSite=Lax` rather than `Strict` so a link
       * from an email lands signed in; `Strict` would drop the cookie on that
       * navigation and look like a broken login.
       *
       * `secure` follows the base URL rather than being hard true. A cookie
       * marked Secure is not stored over plain HTTP, so hard-coding it makes
       * local development over `http://localhost` fail to hold a session, which
       * reads as a broken login rather than a cookie policy. Every deployed
       * environment is HTTPS, so this is true everywhere that matters.
       */
      defaultCookieAttributes: {
        httpOnly: true,
        secure: config.baseUrl.startsWith('https://'),
        sameSite: 'lax',
        path: '/',
      },

      /**
       * Our ids are UUIDv7, generated by Postgres per ADR-0015, so the library
       * must not generate its own. `uuidv7()` is the column default, and the
       * time ordering the data model depends on comes from the database rather
       * than from whatever the library would produce.
       */
      database: {
        generateId: false,
      },
    },

    /**
     * CSRF protection. The library checks `Origin` against this list on every
     * state-changing request, so a cross-site form post is rejected before it
     * reaches a handler. Only our own origin is trusted; there is no separate
     * frontend domain to admit.
     */
    trustedOrigins: [config.baseUrl],
  }
}
