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
 * 1. **The connection is a `pg` Pool built from `DATABASE_AUTH_URL`.** The
 *    `database` option accepts a driver pool, a Kysely dialect, or an adapter
 *    instance. It does not accept `{ provider, url }`, which is drizzle-kit's
 *    shape. The role must be `creatorhub_auth`: the application role has no
 *    privilege on `sessions` or `accounts` at all, so pointing this at
 *    `DATABASE_URL` fails on the first sign-in with a permission error that
 *    names nothing useful.
 *
 * 2. **`casing: 'snake'` does the column mapping.** Our data model is
 *    `snake_case` per `coding-standards.md`; the library defaults to camel.
 *    One option covers every column, so the per-field `createdAt` mappings that
 *    would otherwise be needed on all four models disappear.
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
// Construction
// ---------------------------------------------------------------------------

/**
 * Build the authentication options.
 *
 * Takes config rather than reading the environment, so an integration test can
 * point this at a throwaway container without mutating process state.
 */
export function createAuthOptions(config: AuthConfig): BetterAuthOptions {
  return {
    appName: 'CreatorHub',

    /**
     * A dedicated pool as `creatorhub_auth`, separate from the application pool
     * in `packages/db`. Two pools is the cost of the role separation, and it is
     * cheap: this one is touched at sign-in, not on every request.
     */
    database: new pg.Pool({
      connectionString: config.databaseAuthUrl,
      max: AUTH_POOL_MAX,
    }),

    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,

    // -------------------------------------------------------------------
    // Schema mapping
    // -------------------------------------------------------------------
    user: { modelName: TABLES.user },
    account: { modelName: TABLES.account },

    session: {
      modelName: TABLES.session,
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
       */
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
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

/**
 * Column naming for the Kysely adapter the library builds from the pool.
 *
 * Separate from `createAuthOptions` because it is not part of
 * `BetterAuthOptions`: the library reads it when constructing its adapter. Kept
 * beside the options so the two cannot drift.
 */
export const AUTH_DATABASE_CASING = 'snake' as const
