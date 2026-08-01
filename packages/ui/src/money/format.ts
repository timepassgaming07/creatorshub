/**
 * Money formatting and parsing for the view boundary.
 *
 * Responsibilities: turn a Money into a locale-correct string, and turn typed
 * input back into exact minor units.
 * Dependencies: @creatorhub/contracts.
 *
 * This is the *only* place money becomes a display string. Coding standards §2:
 * "Formatting only at the view boundary." A locale or rounding inconsistency in a
 * revenue figure destroys trust faster than any visual flaw, which is why this is
 * a system primitive rather than a helper someone reimplements per screen.
 *
 * Kept separate from the components so it is unit-testable without a DOM.
 */
import { minorUnitExponent, toDecimalString, type Money } from '@creatorhub/contracts'

export type FormatMoneyOptions = {
  /** BCP 47 tag. Defaults to the runtime locale. */
  readonly locale?: string
  /**
   * Show the ISO code alongside the symbol, as in "£10.50 GBP".
   * Required wherever more than one currency can appear on screen, because
   * "$10.50" is ambiguous across a dozen currencies.
   */
  readonly showCurrencyCode?: boolean
  /** Drop the fractional part when it is zero: "£10" rather than "£10.00". */
  readonly compactWholeAmounts?: boolean
}

/**
 * Format a Money for display.
 *
 * Intl.NumberFormat is given a *string*, not a number. Passing a number would
 * reintroduce float imprecision at the last possible moment, after all the care
 * taken to avoid it upstream. String input is exact at any magnitude.
 */
export function formatMoney(value: Money, options: FormatMoneyOptions = {}): string {
  const exponent = minorUnitExponent(value.currency)
  const decimal = toDecimalString(value)

  const isWhole = value.amount % 10n ** BigInt(exponent) === 0n
  const fractionDigits = options.compactWholeAmounts === true && isWhole ? 0 : exponent

  const formatter = new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })

  // Intl.NumberFormat accepts a string for arbitrary-precision input, but the
  // TypeScript lib types only describe number | bigint. The cast is to the
  // documented runtime contract, not to silence a real type error.
  const formatted = (formatter.format as (input: string) => string)(decimal)

  return options.showCurrencyCode === true ? `${formatted} ${value.currency}` : formatted
}

/**
 * The characters a user may type into a money field, for the given locale.
 *
 * Locales disagree about decimal separators: 10,50 in Germany is 10.50 in the UK.
 * Rejecting a comma outright would make the field unusable for half the world.
 */
export function decimalSeparatorFor(locale?: string): string {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1)
  return parts.find((part) => part.type === 'decimal')?.value ?? '.'
}

export type ParseResult =
  | { readonly ok: true; readonly minorUnits: bigint }
  | { readonly ok: false; readonly reason: 'empty' | 'malformed' | 'too-precise' }

/**
 * Parse typed input into exact minor units.
 *
 * Never returns a float at any point. The input string is normalised, split on
 * the decimal separator, and assembled into a bigint — so "0.1" is 10n, not
 * 0.1 rounded to something.
 *
 * Excess precision is rejected rather than rounded. Silently turning a typed
 * "10.005" into £10.01 is the kind of helpfulness that produces a support ticket
 * about a penny.
 */
export function parseMoneyInput(input: string, currencyCode: string, locale?: string): ParseResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }

  const separator = decimalSeparatorFor(locale)
  const groupSeparator = separator === ',' ? '.' : ','

  // Strip grouping, currency symbols, and whitespace; normalise the decimal mark.
  const normalised = trimmed
    .replaceAll(groupSeparator, '')
    .replaceAll(/\s/gu, '')
    .replaceAll(/[^\d\-.,]/gu, '')
    .replace(separator, '.')

  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(normalised)
  if (!match) return { ok: false, reason: 'malformed' }

  const [, sign, whole = '', fraction = ''] = match
  if (whole === '' && fraction === '') return { ok: false, reason: 'malformed' }

  const exponent = minorUnitExponent(currencyCode as Money['currency'])
  if (fraction.length > exponent) return { ok: false, reason: 'too-precise' }

  const minorUnits = BigInt((whole === '' ? '0' : whole) + fraction.padEnd(exponent, '0'))
  return { ok: true, minorUnits: sign === '-' ? -minorUnits : minorUnits }
}

/**
 * The editable string for an amount already held in state.
 *
 * Plain digits and a decimal separator, with no currency symbol — a symbol
 * inside an editable field is something the user has to delete before typing.
 */
export function toInputValue(value: Money, locale?: string): string {
  return toDecimalString(value).replace('.', decimalSeparatorFor(locale))
}
