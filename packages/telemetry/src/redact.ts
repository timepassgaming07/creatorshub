/**
 * Redaction — strip secrets before anything reaches a log.
 *
 * Responsibilities: recursively replace sensitive values in structured log data.
 * Dependencies: none.
 *
 * Security standards §8: "Secrets never logged. Log redaction covers known key
 * names and token patterns."
 *
 * Two independent strategies, because either alone leaks:
 *
 * - **By key name.** Catches `password`, `authorization`, `stripeSecretKey`.
 *   Fails when a secret is logged under a neutral name.
 * - **By value shape.** Catches anything that looks like a provider key or a
 *   JWT regardless of where it sits. Fails on high-entropy secrets with no
 *   recognisable prefix.
 *
 * Redaction is a safety net, not a licence. The rule is still: do not log
 * secrets. This is what catches the case where someone logs a whole request
 * object without thinking about what is inside it.
 */

/** Substring matches, lowercased. Broad on purpose — a false positive costs a log line. */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'cookie',
  'session',
  'credential',
  'privatekey',
  'private_key',
  'signature',
  'webhook_secret',
  'client_secret',
  'card',
  'cvv',
  'cvc',
  'pan',
  'ssn',
]

/**
 * Value shapes that are secrets wherever they appear.
 *
 * Provider prefixes are listed explicitly rather than matched by generic entropy
 * so that ordinary identifiers — an order ID, a slug — are not mangled.
 */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/g, // Stripe secret
  /\brk_(?:live|test)_[A-Za-z0-9]{8,}/g, // Stripe restricted
  /\bwhsec_[A-Za-z0-9]{8,}/g, // Stripe webhook signing
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /\bBearer\s+[A-Za-z0-9._-]{16,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

export const REDACTED = '[redacted]'

/** Depth cap. A cyclic or pathological object must not turn a log call into a hang. */
const MAX_DEPTH = 8

export function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[-_\s]/g, '')
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment.replace(/_/g, '')))
}

export function redactString(value: string): string {
  let result = value
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    // Patterns are global; reset lastIndex so repeated calls stay correct.
    pattern.lastIndex = 0
    result = result.replace(pattern, REDACTED)
  }
  return result
}

/**
 * Recursively redact a value for logging.
 *
 * Returns a new structure; the input is never mutated, because a logger that
 * modifies what it is handed is a bug that surfaces far from its cause.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'

  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack === undefined ? undefined : redactString(value.stack),
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1))
  }

  if (value instanceof Map || value instanceof Set) {
    return redact([...value], depth + 1)
  }

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = isSensitiveKey(key) ? REDACTED : redact(entry, depth + 1)
  }
  return result
}
