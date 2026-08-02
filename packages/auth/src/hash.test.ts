import { describe, expect, it } from 'vitest'

import { argon2idPassword } from './hash.js'

/**
 * The hashing path, which is the one place a mistake means every password in
 * the system is weaker than it appears.
 *
 * These run against the real Argon2id implementation rather than a stub. A
 * mocked hash would prove the wiring and nothing about the algorithm, and the
 * algorithm is the point.
 */
describe('argon2idPassword.hash', () => {
  it('produces an argon2id hash, not argon2i or argon2d', async () => {
    const digest = await argon2idPassword.hash('correct horse battery staple')

    // The PHC string names the variant. argon2i and argon2d are the wrong
    // variants for password storage: only id resists both side-channel and
    // GPU attacks.
    expect(digest).toMatch(/^\$argon2id\$/)
  })

  it('encodes the OWASP parameters in the hash', async () => {
    const digest = await argon2idPassword.hash('correct horse battery staple')

    // 19456 KiB memory, 2 iterations, parallelism 1. These are readable in the
    // PHC string, so a future change to the constants is visible here rather
    // than silently producing weaker hashes.
    expect(digest).toContain('m=19456')
    expect(digest).toContain('t=2')
    expect(digest).toContain('p=1')
  })

  // Two users with the same password must not share a hash, or a single
  // rainbow table entry breaks both. The salt is what prevents that.
  it('salts, so the same password hashes differently every time', async () => {
    const first = await argon2idPassword.hash('same password')
    const second = await argon2idPassword.hash('same password')

    expect(first).not.toBe(second)
  })

  it('never returns the plaintext', async () => {
    const plaintext = 'a-very-distinctive-password'
    const digest = await argon2idPassword.hash(plaintext)

    expect(digest).not.toContain(plaintext)
  })
})

describe('argon2idPassword.verify', () => {
  it('accepts the correct password', async () => {
    const password = 'correct horse battery staple'
    const hash = await argon2idPassword.hash(password)

    expect(await argon2idPassword.verify({ hash, password })).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await argon2idPassword.hash('correct horse battery staple')

    expect(await argon2idPassword.verify({ hash, password: 'wrong' })).toBe(false)
  })

  it('rejects a password differing by one character', async () => {
    const hash = await argon2idPassword.hash('correct horse battery staple')

    expect(await argon2idPassword.verify({ hash, password: 'correct horse battery stapl' })).toBe(
      false,
    )
  })

  // A user with no password credential has no stored hash. Returning false
  // rather than throwing keeps sign-in's failure shape identical whether the
  // account exists, has no password, or has the wrong one.
  it('rejects an empty stored hash rather than throwing', async () => {
    expect(await argon2idPassword.verify({ hash: '', password: 'anything' })).toBe(false)
  })

  it('handles a unicode password', async () => {
    const password = 'пароль-密码-🔑'
    const hash = await argon2idPassword.hash(password)

    expect(await argon2idPassword.verify({ hash, password })).toBe(true)
  })

  it('handles a long password at the configured maximum', async () => {
    const password = 'x'.repeat(128)
    const hash = await argon2idPassword.hash(password)

    expect(await argon2idPassword.verify({ hash, password })).toBe(true)
  })
})
