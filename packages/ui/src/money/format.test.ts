import { describe, expect, it } from 'vitest'
import { currency, money } from '@creatorhub/contracts'
import { decimalSeparatorFor, formatMoney, parseMoneyInput, toInputValue } from './format.js'

const GBP = currency('GBP')
const USD = currency('USD')
const EUR = currency('EUR')
const JPY = currency('JPY')

describe('formatMoney', () => {
  it('formats with symbol and two decimals', () => {
    expect(formatMoney(money(1050n, GBP), { locale: 'en-GB' })).toBe('£10.50')
  })

  it('renders zero as an amount, never as a dash or blank', () => {
    expect(formatMoney(money(0n, GBP), { locale: 'en-GB' })).toBe('£0.00')
  })

  it('formats a negative amount for refunds', () => {
    expect(formatMoney(money(-1050n, GBP), { locale: 'en-GB' })).toBe('-£10.50')
  })

  it('respects locale symbol placement and separators', () => {
    // Intl separates the amount and symbol with a non-breaking space in de-DE.
    // Normalising it keeps the assertion about placement and separators, which is
    // what we care about, rather than about a whitespace codepoint.
    const euros = formatMoney(money(123_456n, EUR), { locale: 'de-DE' }).replaceAll(/\s/gu, ' ')
    expect(euros).toBe('1.234,56 €')
    expect(formatMoney(money(123_456n, USD), { locale: 'en-US' })).toBe('$1,234.56')
  })

  it('uses no decimals for a zero-exponent currency', () => {
    // ja-JP renders the fullwidth yen sign, so assert on the numeric part and
    // the absence of a fractional part rather than on the symbol codepoint.
    const yen = formatMoney(money(1050n, JPY), { locale: 'ja-JP' })
    expect(yen).toContain('1,050')
    expect(yen).not.toContain('.')
  })

  it('appends the ISO code when asked', () => {
    expect(formatMoney(money(1050n, GBP), { locale: 'en-GB', showCurrencyCode: true })).toBe(
      '£10.50 GBP',
    )
  })

  it('compacts whole amounts only when they are whole', () => {
    const options = { locale: 'en-GB', compactWholeAmounts: true }
    expect(formatMoney(money(1000n, GBP), options)).toBe('£10')
    expect(formatMoney(money(1050n, GBP), options)).toBe('£10.50')
  })

  it('stays exact for an amount beyond float precision', () => {
    // 2^53 minor units would lose precision as a JavaScript number. This is the
    // reason format receives a string rather than a Number conversion.
    const huge = money(9_007_199_254_740_993n, GBP)
    expect(formatMoney(huge, { locale: 'en-GB' })).toContain('90,071,992,547,409.93')
  })
})

describe('decimalSeparatorFor', () => {
  it('is a dot in en-GB and a comma in de-DE', () => {
    expect(decimalSeparatorFor('en-GB')).toBe('.')
    expect(decimalSeparatorFor('de-DE')).toBe(',')
  })
})

describe('parseMoneyInput', () => {
  it('parses plain input to minor units', () => {
    expect(parseMoneyInput('10.50', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 1050n })
    expect(parseMoneyInput('10.5', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 1050n })
    expect(parseMoneyInput('10', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 1000n })
    expect(parseMoneyInput('0.05', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 5n })
  })

  it('parses a value that a float would corrupt', () => {
    // 0.1 + 0.2 famously is not 0.3 in binary floating point. Here it is exact.
    expect(parseMoneyInput('10.10', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 1010n })
    expect(parseMoneyInput('0.29', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 29n })
  })

  it('accepts a leading decimal separator', () => {
    expect(parseMoneyInput('.5', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 50n })
  })

  it('accepts a comma decimal mark in a comma locale', () => {
    expect(parseMoneyInput('10,50', EUR, 'de-DE')).toEqual({ ok: true, minorUnits: 1050n })
  })

  it('strips grouping separators', () => {
    expect(parseMoneyInput('1,234.56', USD, 'en-US')).toEqual({ ok: true, minorUnits: 123_456n })
    expect(parseMoneyInput('1.234,56', EUR, 'de-DE')).toEqual({ ok: true, minorUnits: 123_456n })
  })

  it('strips a currency symbol the user pasted in', () => {
    expect(parseMoneyInput('£10.50', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: 1050n })
  })

  it('parses a negative amount', () => {
    expect(parseMoneyInput('-10.50', GBP, 'en-GB')).toEqual({ ok: true, minorUnits: -1050n })
  })

  it('reports empty separately from malformed', () => {
    expect(parseMoneyInput('', GBP, 'en-GB')).toEqual({ ok: false, reason: 'empty' })
    expect(parseMoneyInput('   ', GBP, 'en-GB')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects excess precision rather than rounding it', () => {
    expect(parseMoneyInput('10.005', GBP, 'en-GB')).toEqual({ ok: false, reason: 'too-precise' })
    expect(parseMoneyInput('10.5', JPY, 'ja-JP')).toEqual({ ok: false, reason: 'too-precise' })
  })

  it.each(['abc', '--5', '1.2.3'])('rejects %o as malformed', (input) => {
    expect(parseMoneyInput(input, GBP, 'en-GB').ok).toBe(false)
  })

  it('parses an amount above float-safe integer range exactly', () => {
    const result = parseMoneyInput('90071992547409.93', GBP, 'en-GB')
    expect(result).toEqual({ ok: true, minorUnits: 9_007_199_254_740_993n })
  })
})

describe('toInputValue', () => {
  it('produces an editable string with no currency symbol', () => {
    expect(toInputValue(money(1050n, GBP), 'en-GB')).toBe('10.50')
  })

  it('uses the locale decimal mark', () => {
    expect(toInputValue(money(1050n, EUR), 'de-DE')).toBe('10,50')
  })

  it('round-trips through parseMoneyInput', () => {
    for (const amount of [0n, 1n, 999n, 1050n, -1050n, 123_456_789n]) {
      const original = money(amount, GBP)
      const parsed = parseMoneyInput(toInputValue(original, 'en-GB'), GBP, 'en-GB')
      expect(parsed).toEqual({ ok: true, minorUnits: amount })
    }
  })
})
