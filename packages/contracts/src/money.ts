/**
 * Money — the only permitted representation of a monetary value.
 *
 * Responsibilities: represent amounts exactly, and provide every arithmetic
 * operation the platform is allowed to perform on them.
 * Dependencies: zod (schema only). No I/O, no framework.
 *
 * Two constraints drive the whole design:
 *
 * 1. Amounts are integer minor units held in `bigint`. Floating point cannot
 *    represent 0.1 exactly, and `number` loses integer precision above 2^53.
 *    A ledger that must balance to the penny cannot tolerate either.
 * 2. Currency travels with the amount. A bare number eventually gets added to
 *    a different currency, and nothing in the type system stops it.
 *
 * Formatting deliberately lives outside this module. Rendering is a view
 * concern and needs a locale; see MoneyDisplay in @creatorhub/ui.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ISO 4217 alphabetic currency code, uppercase. */
export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' }

export type Money = {
  readonly amount: bigint
  readonly currency: CurrencyCode
}

/**
 * Hundredths of a percent. 2000 basis points is 20%.
 *
 * Commission and fee rates are expressed this way so a rate is an exact integer
 * rather than 0.2, which is not representable in binary floating point.
 */
export type BasisPoints = number & { readonly __brand: 'BasisPoints' }

const BASIS_POINTS_SCALE = 10_000n

// ---------------------------------------------------------------------------
// Errors
//
// These are programming errors, not domain outcomes: no user action produces
// them, and no caller can sensibly recover. Per the error-handling standard,
// unexpected failures throw rather than returning a Result.
// ---------------------------------------------------------------------------

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(`Cannot operate on ${left} and ${right}: currencies must match.`)
    this.name = 'CurrencyMismatchError'
  }
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMoneyError'
  }
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

const CURRENCY_PATTERN = /^[A-Z]{3}$/

export function currency(code: string): CurrencyCode {
  if (!CURRENCY_PATTERN.test(code)) {
    throw new InvalidMoneyError(
      `Invalid currency code: "${code}". Expected three uppercase letters.`,
    )
  }
  return code as CurrencyCode
}

const exponentCache = new Map<string, number>()

/**
 * Number of decimal places the currency subdivides into: 2 for GBP, 0 for JPY,
 * 3 for BHD.
 *
 * Read from Intl rather than a hand-maintained table. The runtime already ships
 * the ISO 4217 data, and a stale local copy is a rounding bug waiting to happen.
 */
export function minorUnitExponent(code: CurrencyCode): number {
  const cached = exponentCache.get(code)
  if (cached !== undefined) return cached

  const resolved = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
  }).resolvedOptions()

  // Intl falls back to 2 for codes it does not recognise, which matches the
  // ISO default for unlisted currencies. The option is typed as optional, so
  // default explicitly rather than assuming the runtime always populates it.
  const exponent = resolved.maximumFractionDigits ?? 2
  exponentCache.set(code, exponent)
  return exponent
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Build a Money from minor units. `money(1050n, GBP)` is £10.50. */
export function money(amount: bigint, code: CurrencyCode): Money {
  return { amount, currency: code }
}

export function zero(code: CurrencyCode): Money {
  return { amount: 0n, currency: code }
}

export function basisPoints(value: number): BasisPoints {
  if (!Number.isInteger(value)) {
    throw new InvalidMoneyError(`Basis points must be an integer, received ${String(value)}.`)
  }
  return value as BasisPoints
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency)
  }
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amount + b.amount, a.currency)
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return money(a.amount - b.amount, a.currency)
}

export function negate(a: Money): Money {
  return money(-a.amount, a.currency)
}

export function absolute(a: Money): Money {
  return money(a.amount < 0n ? -a.amount : a.amount, a.currency)
}

/** Multiply by a whole number, such as a line quantity. */
export function multiply(a: Money, factor: bigint): Money {
  return money(a.amount * factor, a.currency)
}

export function sum(values: readonly Money[], code: CurrencyCode): Money {
  return values.reduce<Money>((acc, value) => add(acc, value), zero(code))
}

/**
 * Apply a basis-point rate, rounding half away from zero.
 *
 * Half away from zero is chosen over banker's rounding because it is what
 * creators, affiliates, and tax authorities expect when they check the number
 * by hand, and disputes are settled by hand.
 *
 * Important: never compute every part of a split with this function. Rounding
 * each part independently can produce parts that do not sum to the whole.
 * Compute one part, then derive the remainder by subtraction — or use allocate.
 */
export function percentage(a: Money, rate: BasisPoints): Money {
  const numerator = a.amount * BigInt(rate)
  const quotient = numerator / BASIS_POINTS_SCALE
  const remainder = numerator % BASIS_POINTS_SCALE

  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n
  if (twiceRemainder < BASIS_POINTS_SCALE) {
    return money(quotient, a.currency)
  }

  return money(quotient + (numerator < 0n ? -1n : 1n), a.currency)
}

/**
 * Split an amount across integer ratios, losing nothing and inventing nothing.
 *
 * £100.00 split three ways is 3334 + 3333 + 3333, not 3333.33 three times.
 * Remainder minor units are handed out one at a time from the start of the
 * list, which is deterministic and therefore reproducible during reconciliation.
 *
 * The returned parts always sum exactly to the input.
 */
export function allocate(a: Money, ratios: readonly number[]): Money[] {
  if (ratios.length === 0) {
    throw new InvalidMoneyError('Cannot allocate across an empty list of ratios.')
  }
  if (ratios.some((r) => !Number.isInteger(r) || r < 0)) {
    throw new InvalidMoneyError('Allocation ratios must be non-negative integers.')
  }

  const total = ratios.reduce<bigint>((acc, r) => acc + BigInt(r), 0n)
  if (total === 0n) {
    throw new InvalidMoneyError('Allocation ratios must not sum to zero.')
  }

  // Work on the magnitude so remainder distribution is identical for a refund
  // and for the payment it reverses. Sign is reapplied at the end.
  const isNegative = a.amount < 0n
  const magnitude = isNegative ? -a.amount : a.amount

  const shares = ratios.map((r) => (magnitude * BigInt(r)) / total)
  const distributed = shares.reduce<bigint>((acc, s) => acc + s, 0n)
  let remainder = magnitude - distributed

  const result: Money[] = []
  for (let i = 0; i < shares.length; i += 1) {
    // Non-null assertion avoided: index is bounded by the loop condition, but
    // noUncheckedIndexedAccess still widens the type, so default explicitly.
    const share = shares[i] ?? 0n
    const extra = remainder > 0n && ratios[i] !== 0 ? 1n : 0n
    if (extra === 1n) remainder -= 1n
    const value = share + extra
    result.push(money(isNegative ? -value : value, a.currency))
  }

  return result
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amount === b.amount
}

/** Returns -1, 0, or 1. Throws if the currencies differ. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b)
  if (a.amount < b.amount) return -1
  if (a.amount > b.amount) return 1
  return 0
}

export function isZero(a: Money): boolean {
  return a.amount === 0n
}

export function isNegative(a: Money): boolean {
  return a.amount < 0n
}

export function isPositive(a: Money): boolean {
  return a.amount > 0n
}

export function greaterThan(a: Money, b: Money): boolean {
  return compare(a, b) === 1
}

export function lessThan(a: Money, b: Money): boolean {
  return compare(a, b) === -1
}

// ---------------------------------------------------------------------------
// Serialisation
//
// Exact string conversion in both directions. JSON has no bigint, so money
// crossing a boundary travels as { amount: "1050", currency: "GBP" }.
// ---------------------------------------------------------------------------

/** Exact decimal representation: `money(1050n, GBP)` becomes "10.50". */
export function toDecimalString(a: Money): string {
  const exponent = minorUnitExponent(a.currency)
  if (exponent === 0) return a.amount.toString()

  const negative = a.amount < 0n
  const digits = (negative ? -a.amount : a.amount).toString().padStart(exponent + 1, '0')
  const whole = digits.slice(0, digits.length - exponent)
  const fraction = digits.slice(digits.length - exponent)

  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/**
 * Parse a decimal string into exact minor units.
 *
 * Rejects more decimal places than the currency has, rather than rounding.
 * A caller submitting "10.005" for GBP has made an error we should surface,
 * not silently resolve in some direction.
 */
export function fromDecimalString(value: string, code: CurrencyCode): Money {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) {
    throw new InvalidMoneyError(`Cannot parse "${value}" as a monetary amount.`)
  }

  const [, sign, whole = '0', fraction = ''] = match
  const exponent = minorUnitExponent(code)

  if (fraction.length > exponent) {
    throw new InvalidMoneyError(
      `"${value}" has ${String(fraction.length)} decimal places but ${code} has ${String(exponent)}.`,
    )
  }

  const minorUnits = BigInt(whole + fraction.padEnd(exponent, '0'))
  return money(sign === '-' ? -minorUnits : minorUnits, code)
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Wire representation. The amount is a string because JSON cannot carry a
 * bigint, and because a JSON number would silently lose precision on a large
 * amount before any of our code sees it.
 */
export const moneySchema = z
  .object({
    amount: z.string().regex(/^-?\d+$/, 'Amount must be an integer string of minor units.'),
    currency: z.string().regex(CURRENCY_PATTERN, 'Currency must be an ISO 4217 code.'),
  })
  .transform((value): Money => money(BigInt(value.amount), value.currency as CurrencyCode))

export type MoneyWire = { amount: string; currency: string }

export function toWire(a: Money): MoneyWire {
  return { amount: a.amount.toString(), currency: a.currency }
}
