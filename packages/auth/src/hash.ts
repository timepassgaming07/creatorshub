/**
 * Argon2id password hashing, replacing Better Auth's default scrypt.
 *
 * Responsibilities: hash a password before it reaches the database, and verify
 * a password against a stored hash.
 * Dependencies: @node-rs/argon2. No I/O.
 *
 * Better Auth accepts a `password: { hash, verify }` pair in its email-and-password
 * configuration. This is the implementation of both functions.
 *
 * Parameters are the OWASP recommendation: 19 MiB memory, 2 iterations,
 * parallelism 1 (ADR-0017). They are also the library defaults for the v2
 * binding, so they are stated explicitly rather than assumed, because a default
 * can change between versions and a hash that cannot be verified on upgrade is a
 * password reset for every user.
 *
 * @node-rs/argon2 is chosen over the more common `argon2` package because it
 * ships prebuilt binaries and needs no native compiler on CI runners. pnpm
 * already refuses install-time builds by default.
 */
import { hash, verify } from '@node-rs/argon2'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OWASP_MEMORY = 19_456 // KiB
const OWASP_ITERATIONS = 2
const OWASP_PARALLELISM = 1

const HASH_OPTIONS = {
  memoryCost: OWASP_MEMORY,
  timeCost: OWASP_ITERATIONS,
  parallelism: OWASP_PARALLELISM,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The shape Better Auth's `emailAndPassword.password` option expects: a hash
 * function and a verify function, each returning a Promise.
 *
 * Exporting as a pre-built object rather than two functions so the same options
 * are guaranteed across both. A future caller cannot set one with different
 * parameters.
 */
export const argon2idPassword = {
  /** Hash a plaintext password. Called at sign-up and password change. */
  hash: async (plaintext: string): Promise<string> => hash(plaintext, HASH_OPTIONS),

  /** Verify a plaintext password against a stored hash. Called at sign-in. */
  verify: async (candidate: { hash: string; password: string }): Promise<boolean> => {
    // The library passes an object with the stored hash and the plaintext
    const storedHash = candidate.hash

    // A hash that was never set means this user has no password credential and
    // signed up through another mechanism. Reject to avoid a timing side channel.
    if (storedHash === '') {
      return false
    }

    return verify(storedHash, candidate.password)
  },
} as const
