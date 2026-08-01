import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  CurrencyMismatchError,
  InvalidMoneyError,
  add,
  allocate,
  basisPoints,
  compare,
  currency,
  equals,
  fromDecimalString,
  money,
  multiply,
  negate,
  percentage,
  subtract,
  sum,
  toDecimalString,
  toWire,
  moneySchema,
  zero,
} from './money.js'

const GBP = currency('GBP')
const USD = currency('USD')
const JPY = currency('JPY')

/** Amounts up to roughly a trillion pounds, positive and negative. */
const anyAmount = fc.bigInt({ min: -(10n ** 14n), max: 10n ** 14n })

describe('currency', () => {
  it('accepts a three-letter uppercase code', () => {
    expect(currency('GBP')).toBe('GBP')
  })

  it.each(['gbp', 'GB', 'GBPX', '', '123'])('rejects %o', (code) => {
    expect(() => currency(code)).toThrow(InvalidMoneyError)
  })
})

describe('arithmetic', () => {
  it('adds amounts of the same currency', () => {
    expect(add(money(1050n, GBP), money(250n, GBP))).toEqual(money(1300n, GBP))
  })

  it('refuses to add different currencies', () => {
    expect(() => add(money(100n, GBP), money(100n, USD))).toThrow(CurrencyMismatchError)
  })

  it('refuses to compare different currencies', () => {
    expect(() => compare(money(100n, GBP), money(100n, USD))).toThrow(CurrencyMismatchError)
  })

  it('multiplies by a quantity', () => {
    expect(multiply(money(1050n, GBP), 3n)).toEqual(money(3150n, GBP))
  })

  it('sums an empty list to zero', () => {
    expect(sum([], GBP)).toEqual(zero(GBP))
  })

  it('subtract is the inverse of add', () => {
    fc.assert(
      fc.property(anyAmount, anyAmount, (a, b) => {
        const start = money(a, GBP)
        const delta = money(b, GBP)
        expect(subtract(add(start, delta), delta)).toEqual(start)
      }),
    )
  })

  it('negate is its own inverse', () => {
    fc.assert(
      fc.property(anyAmount, (a) => {
        expect(negate(negate(money(a, GBP)))).toEqual(money(a, GBP))
      }),
    )
  })
})

describe('percentage', () => {
  it('computes a commission rate', () => {
    // 20% of £100.00 is £20.00
    expect(percentage(money(10_000n, GBP), basisPoints(2000))).toEqual(money(2000n, GBP))
  })

  it('rounds half away from zero', () => {
    // 50% of 5 minor units is 2.5, which rounds to 3
    expect(percentage(money(5n, GBP), basisPoints(5000))).toEqual(money(3n, GBP))
    expect(percentage(money(-5n, GBP), basisPoints(5000))).toEqual(money(-3n, GBP))
  })

  it('returns zero for a zero rate', () => {
    fc.assert(
      fc.property(anyAmount, (a) => {
        expect(percentage(money(a, GBP), basisPoints(0))).toEqual(zero(GBP))
      }),
    )
  })

  it('returns the whole amount for 10000 basis points', () => {
    fc.assert(
      fc.property(anyAmount, (a) => {
        expect(percentage(money(a, GBP), basisPoints(10_000))).toEqual(money(a, GBP))
      }),
    )
  })

  it('rejects a fractional rate', () => {
    expect(() => basisPoints(12.5)).toThrow(InvalidMoneyError)
  })
})

describe('allocate', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocate(money(9000n, GBP), [1, 1, 1])).toEqual([
      money(3000n, GBP),
      money(3000n, GBP),
      money(3000n, GBP),
    ])
  })

  it('distributes remainder pennies from the front', () => {
    // £100.00 three ways: 3334 + 3333 + 3333
    expect(allocate(money(10_000n, GBP), [1, 1, 1])).toEqual([
      money(3334n, GBP),
      money(3333n, GBP),
      money(3333n, GBP),
    ])
  })

  it('honours weighted ratios', () => {
    expect(allocate(money(10_000n, GBP), [7, 3])).toEqual([money(7000n, GBP), money(3000n, GBP)])
  })

  it('never allocates to a zero ratio', () => {
    const parts = allocate(money(10_001n, GBP), [1, 0, 1])
    expect(parts[1]).toEqual(zero(GBP))
  })

  it.each([
    ['empty ratios', [] as number[]],
    ['ratios summing to zero', [0, 0]],
    ['negative ratio', [1, -1]],
    ['fractional ratio', [1.5, 1]],
  ])('rejects %s', (_label, ratios) => {
    expect(() => allocate(money(100n, GBP), ratios)).toThrow(InvalidMoneyError)
  })

  it('always sums exactly to the original amount', () => {
    fc.assert(
      fc.property(
        anyAmount,
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 }),
        (amount, ratios) => {
          fc.pre(ratios.reduce((a, b) => a + b, 0) > 0)
          const parts = allocate(money(amount, GBP), ratios)
          expect(sum(parts, GBP)).toEqual(money(amount, GBP))
        },
      ),
    )
  })

  it('gives every part the sign of the original amount', () => {
    fc.assert(
      fc.property(
        anyAmount,
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 }),
        (amount, ratios) => {
          const parts = allocate(money(amount, GBP), ratios)
          for (const part of parts) {
            if (amount > 0n) expect(part.amount >= 0n).toBe(true)
            if (amount < 0n) expect(part.amount <= 0n).toBe(true)
          }
        },
      ),
    )
  })

  it('reverses exactly, so a refund undoes its payment', () => {
    fc.assert(
      fc.property(
        anyAmount,
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 8 }),
        (amount, ratios) => {
          const paid = allocate(money(amount, GBP), ratios)
          const refunded = allocate(negate(money(amount, GBP)), ratios)
          for (let i = 0; i < paid.length; i += 1) {
            expect(add(paid[i]!, refunded[i]!)).toEqual(zero(GBP))
          }
        },
      ),
    )
  })
})

describe('decimal strings', () => {
  it('formats a two-decimal currency', () => {
    expect(toDecimalString(money(1050n, GBP))).toBe('10.50')
    expect(toDecimalString(money(5n, GBP))).toBe('0.05')
    expect(toDecimalString(money(0n, GBP))).toBe('0.00')
    expect(toDecimalString(money(-1050n, GBP))).toBe('-10.50')
  })

  it('formats a zero-decimal currency', () => {
    expect(toDecimalString(money(1050n, JPY))).toBe('1050')
  })

  it('parses a decimal string', () => {
    expect(fromDecimalString('10.50', GBP)).toEqual(money(1050n, GBP))
    expect(fromDecimalString('10.5', GBP)).toEqual(money(1050n, GBP))
    expect(fromDecimalString('10', GBP)).toEqual(money(1000n, GBP))
    expect(fromDecimalString('-10.50', GBP)).toEqual(money(-1050n, GBP))
  })

  it('rejects more precision than the currency has', () => {
    expect(() => fromDecimalString('10.005', GBP)).toThrow(InvalidMoneyError)
    expect(() => fromDecimalString('10.5', JPY)).toThrow(InvalidMoneyError)
  })

  it.each(['', 'abc', '10.', '1,000.00', '£10', '1e3'])('rejects %o', (value) => {
    expect(() => fromDecimalString(value, GBP)).toThrow(InvalidMoneyError)
  })

  it('round-trips any amount', () => {
    fc.assert(
      fc.property(anyAmount, (amount) => {
        const original = money(amount, GBP)
        expect(fromDecimalString(toDecimalString(original), GBP)).toEqual(original)
      }),
    )
  })
})

describe('wire format', () => {
  it('serialises the amount as a string', () => {
    expect(toWire(money(1050n, GBP))).toEqual({ amount: '1050', currency: 'GBP' })
  })

  it('round-trips through the schema', () => {
    fc.assert(
      fc.property(anyAmount, (amount) => {
        const original = money(amount, GBP)
        expect(moneySchema.parse(toWire(original))).toEqual(original)
      }),
    )
  })

  it('rejects a non-integer amount', () => {
    expect(moneySchema.safeParse({ amount: '10.50', currency: 'GBP' }).success).toBe(false)
  })

  it('rejects a malformed currency', () => {
    expect(moneySchema.safeParse({ amount: '1050', currency: 'gbp' }).success).toBe(false)
  })
})

describe('equality', () => {
  it('treats different currencies as unequal rather than throwing', () => {
    expect(equals(money(100n, GBP), money(100n, USD))).toBe(false)
  })
})
