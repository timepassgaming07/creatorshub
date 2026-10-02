import { describe, expect, it } from 'vitest'

import { formatAmount, formatBytes, initials, minorToInput, parsePriceToMinor } from './format'

describe('format', () => {
  it('formats minor units without floating point', () => {
    expect(formatAmount('49900', 'INR')).toBe('₹499.00')
    expect(formatAmount('49900', 'INR', { compact: true })).toBe('₹499')
    expect(formatAmount('12345678', 'INR')).toBe('₹1,23,456.78')
    expect(formatAmount('1999', 'USD')).toBe('$19.99')
  })

  it('parses typed prices exactly', () => {
    expect(parsePriceToMinor('499')).toBe(49900n)
    expect(parsePriceToMinor('499.5')).toBe(49950n)
    expect(parsePriceToMinor('1,299.99')).toBe(129999n)
    expect(parsePriceToMinor('0.1')).toBe(10n)
    expect(parsePriceToMinor('-1')).toBeNull()
    expect(parsePriceToMinor('1.234')).toBeNull()
    expect(parsePriceToMinor('abc')).toBeNull()
  })

  it('round-trips a price through the input form', () => {
    for (const minor of [0n, 100n, 49950n, 129999n]) {
      expect(parsePriceToMinor(minorToInput(minor))).toBe(minor)
    }
  })

  it('formats sizes and initials', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB')
    expect(initials('Asha Rao')).toBe('AR')
    expect(initials('studio')).toBe('ST')
  })
})
