import { describe, expect, it } from 'vitest'
import {
  UNEXPECTED,
  all,
  err,
  flatMap,
  isErr,
  isOk,
  map,
  mapError,
  ok,
  unwrapOr,
  type DomainError,
  type Result,
} from './result.js'

const declined: DomainError = {
  code: 'payment.declined',
  title: 'Your bank declined this card',
  detail: 'The payment was not authorised.',
  action: 'Try a different card, or contact your bank.',
}

describe('construction and guards', () => {
  it('narrows a success', () => {
    const result: Result<number> = ok(42)
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
    if (isOk(result)) expect(result.value).toBe(42)
  })

  it('narrows a failure', () => {
    const result: Result<number> = err(declined)
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.code).toBe('payment.declined')
  })
})

describe('map', () => {
  it('transforms a success', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6))
  })

  it('leaves a failure untouched and does not run the function', () => {
    let called = false
    const result = map(err<DomainError>(declined), (n: number) => {
      called = true
      return n
    })
    expect(result).toEqual(err(declined))
    expect(called).toBe(false)
  })
})

describe('flatMap', () => {
  it('chains successes', () => {
    expect(flatMap(ok(2), (n) => ok(n + 1))).toEqual(ok(3))
  })

  it('propagates a failure from the chained operation', () => {
    expect(flatMap(ok(2), () => err(declined))).toEqual(err(declined))
  })

  it('short-circuits on an existing failure', () => {
    let called = false
    flatMap(err<DomainError>(declined), (n: number) => {
      called = true
      return ok(n)
    })
    expect(called).toBe(false)
  })
})

describe('mapError', () => {
  it('transforms a failure', () => {
    const result = mapError(err<DomainError>(declined), (e) => e.code)
    expect(result).toEqual(err('payment.declined'))
  })

  it('leaves a success untouched', () => {
    expect(mapError(ok(1), () => 'unused')).toEqual(ok(1))
  })
})

describe('unwrapOr', () => {
  it('returns the value on success', () => {
    expect(unwrapOr(ok(5), 0)).toBe(5)
  })

  it('returns the fallback on failure', () => {
    expect(unwrapOr(err<DomainError>(declined), 0)).toBe(0)
  })
})

describe('all', () => {
  it('collects successes in order', () => {
    expect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]))
  })

  it('returns the first failure', () => {
    const second: DomainError = { ...declined, code: 'second' }
    expect(all([ok(1), err(declined), err(second)])).toEqual(err(declined))
  })

  it('treats an empty list as success', () => {
    expect(all([])).toEqual(ok([]))
  })
})

describe('DomainError shape', () => {
  it('requires all three user-facing fields', () => {
    // The manifesto requires every user-facing error to say what happened, why,
    // and what to do next. Missing any of them should not compile, so this test
    // asserts the fallback error itself is complete.
    expect(UNEXPECTED.title).not.toBe('')
    expect(UNEXPECTED.detail).not.toBe('')
    expect(UNEXPECTED.action).not.toBe('')
  })
})
