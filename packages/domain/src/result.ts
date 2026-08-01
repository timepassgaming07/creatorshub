/**
 * Result — the return type for expected failures.
 *
 * Responsibilities: let a domain operation report a failure the caller is
 * supposed to handle, without using exceptions for control flow.
 * Dependencies: none.
 *
 * The distinction this encodes (coding-standards §5):
 *
 * - A card is declined, a slug is taken, a role is insufficient. These are
 *   *outcomes*. Every caller must deal with them, so they are values, and the
 *   type system makes forgetting impossible.
 * - A database is unreachable, an invariant is broken. These are *bugs or
 *   outages*. No caller can sensibly recover, so they throw and are handled once
 *   at the boundary.
 *
 * The failure mode this prevents is the one where a decline is thrown, caught by
 * a generic handler three layers up, and shown to a buyer as "Something went
 * wrong" instead of "Your bank declined this card."
 */

export type Result<T, E = DomainError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

/** Transform a success value, leaving a failure untouched. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

/** Chain an operation that can itself fail. */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/** Transform a failure, leaving a success untouched. */
export function mapError<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error))
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

/**
 * Collect many results into one.
 *
 * Fails on the first failure. Where every failure matters — form validation, for
 * instance — collect the errors at the call site instead; this is for the case
 * where one failure makes the rest irrelevant.
 */
export function all<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) return result
    values.push(result.value)
  }
  return ok(values)
}

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

/**
 * The shape every expected failure takes.
 *
 * The three user-facing fields are required rather than optional because the
 * manifesto requires every user-facing error to answer: what happened, why, and
 * what to do next. An optional field is one a tired engineer leaves empty.
 *
 * `code` is for us — logs, metrics, and tests. The other three are for the
 * person reading the screen.
 */
export type DomainError = {
  readonly code: string
  readonly title: string
  readonly detail: string
  readonly action: string
}

export function domainError(error: DomainError): DomainError {
  return error
}

/**
 * A failure that is genuinely nobody's fault and nobody's decision.
 *
 * Deliberately sparse. Reach for a specific error type; this exists so that a
 * caller has something to return rather than throwing, not as a default.
 */
export const UNEXPECTED: DomainError = {
  code: 'unexpected',
  title: 'Something went wrong',
  detail: 'We could not complete that action.',
  action: 'Try again. If it keeps happening, contact support.',
}
