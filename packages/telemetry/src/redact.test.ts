import { describe, expect, it } from 'vitest'
import { REDACTED, isSensitiveKey, redact, redactString } from './redact.js'

describe('isSensitiveKey', () => {
  it.each([
    'password',
    'Password',
    'userPassword',
    'api_key',
    'apiKey',
    'API-KEY',
    'authorization',
    'stripeSecretKey',
    'sessionToken',
    'cardNumber',
    'cvv',
  ])('flags %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true)
  })

  it.each(['email', 'workspaceId', 'productName', 'amount', 'currency', 'slug'])(
    'leaves %s alone',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false)
    },
  )
})

describe('redactString', () => {
  it.each([
    ['stripe secret', 'sk_live_abcdefghijklmnop'],
    ['stripe test', 'sk_test_abcdefghijklmnop'],
    ['stripe webhook', 'whsec_abcdefghijklmnop'],
    ['anthropic', 'sk-ant-api03-abcdefghijklmnopqrst'],
    ['github', 'ghp_abcdefghijklmnopqrstuvwxyz'],
    [
      'jwt',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ],
  ])('redacts a %s key found mid-sentence', (_label, secret) => {
    const output = redactString(`connecting with ${secret} now`)
    expect(output).not.toContain(secret)
    expect(output).toContain(REDACTED)
  })

  it('redacts a bearer header value', () => {
    expect(redactString('Bearer abcdefghijklmnopqrstuvwxyz')).toBe(REDACTED)
  })

  it('redacts a private key block', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----'
    expect(redactString(key)).toBe(REDACTED)
  })

  it('leaves ordinary identifiers intact', () => {
    const value = 'order_01H8XGJWBWBAQ4 for workspace acme-studio'
    expect(redactString(value)).toBe(value)
  })

  it('is stable across repeated calls', () => {
    const input = 'key sk_live_abcdefghijklmnop here'
    expect(redactString(input)).toBe(redactString(input))
  })
})

describe('redact', () => {
  it('redacts by key name', () => {
    expect(redact({ email: 'a@b.com', password: 'hunter2' })).toEqual({
      email: 'a@b.com',
      password: REDACTED,
    })
  })

  it('redacts by value shape under an innocent key', () => {
    expect(redact({ note: 'use sk_live_abcdefghijklmnop' })).toEqual({
      note: `use ${REDACTED}`,
    })
  })

  it('recurses into nested objects and arrays', () => {
    const input = {
      workspace: { id: 'ws_1', config: { apiKey: 'abc123', region: 'eu' } },
      events: [{ token: 'xyz' }, { name: 'ok' }],
    }
    expect(redact(input)).toEqual({
      workspace: { id: 'ws_1', config: { apiKey: REDACTED, region: 'eu' } },
      events: [{ token: REDACTED }, { name: 'ok' }],
    })
  })

  it('does not mutate the input', () => {
    const input = { password: 'hunter2', nested: { token: 'abc' } }
    const copy = structuredClone(input)
    redact(input)
    expect(input).toEqual(copy)
  })

  it('redacts an error message and stack', () => {
    const error = new Error('failed with sk_live_abcdefghijklmnop')
    const output = redact(error) as { message: string }
    expect(output.message).not.toContain('sk_live_')
  })

  it('truncates rather than hanging on deep nesting', () => {
    let deep: Record<string, unknown> = { value: 'bottom' }
    for (let i = 0; i < 20; i += 1) deep = { nested: deep }
    expect(JSON.stringify(redact(deep))).toContain('[truncated]')
  })

  it('survives a cyclic structure', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic['self'] = cyclic
    expect(() => redact(cyclic)).not.toThrow()
  })

  it('passes primitives through unchanged', () => {
    expect(redact(42)).toBe(42)
    expect(redact(true)).toBe(true)
    expect(redact(null)).toBe(null)
    expect(redact(undefined)).toBe(undefined)
  })
})
