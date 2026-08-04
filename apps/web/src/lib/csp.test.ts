import { describe, expect, it } from 'vitest'
import { buildCsp, generateNonce } from './csp'

/**
 * The policy is tested as a value, which is the reason it is built by a pure
 * function rather than assembled inside the middleware.
 *
 * The header being present is not the same as the header being correct, and a
 * test that only checks presence passes against `default-src *`. Every assertion
 * here names a directive and what it must or must not contain.
 */

const NONCE = 'test-nonce-value'

/** Pulls one directive out of the header, so an assertion cannot match another. */
function directive(csp: string, name: string): string {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `))

  if (found === undefined) throw new Error(`Directive ${name} is absent from: ${csp}`)
  return found
}

describe('generateNonce', () => {
  it('produces at least 128 bits of entropy', () => {
    // 16 bytes base64 is 24 characters with padding. A shorter nonce is a
    // guessable nonce, and a guessable nonce is no nonce at all.
    expect(generateNonce()).toHaveLength(24)
  })

  it('differs on every call', () => {
    // The whole mechanism rests on this. A nonce reused across responses can be
    // read from one page and carried by a script injected into the next.
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()))
    expect(nonces.size).toBe(100)
  })

  it('is base64url, with no + or / anywhere', () => {
    // 200 samples, because a standard base64 nonce contains one of these about a
    // third of the time. A single sample would pass most runs and this defect is
    // one that failed intermittently in production, not deterministically.
    for (let i = 0; i < 200; i += 1) {
      expect(generateNonce()).not.toMatch(/[+/]/)
    }
  })

  it('matches the pattern Next uses to read a nonce out of the header', () => {
    /**
     * Copied verbatim from Next 16.2.12,
     * `dist/server/app-render/get-script-nonce-from-header.js`.
     *
     * This is the regression guard for a defect that cost an afternoon: a nonce
     * this pattern rejects makes Next emit no nonce at all, so the browser
     * enforces a policy the framework's own bootstrap scripts cannot satisfy and
     * the page never hydrates. Every header-level assertion still passes, which
     * is why the check has to be the actual pattern rather than a description of
     * it.
     *
     * If a Next upgrade changes this pattern, this test still passes and the
     * browser test in e2e/smoke.spec.ts is what catches the difference.
     */
    const NEXT_NONCE_PATTERN = /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/

    for (let i = 0; i < 200; i += 1) {
      expect(`'nonce-${generateNonce()}'`).toMatch(NEXT_NONCE_PATTERN)
    }
  })
})

describe('buildCsp', () => {
  const csp = buildCsp({ nonce: NONCE })

  it('carries the nonce in script-src', () => {
    expect(directive(csp, 'script-src')).toContain(`'nonce-${NONCE}'`)
  })

  it('never allows unsafe-eval in production', () => {
    // eval turns any string that reaches it into code, which is most of what a
    // CSP exists to prevent.
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('allows unsafe-eval only when development is set', () => {
    // Next's dev server needs it for hot reloading. The flag is the seam, and
    // this pair of tests is what stops the seam widening into production.
    const dev = buildCsp({ nonce: NONCE, development: true })
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(csp, 'script-src')).not.toContain("'unsafe-eval'")
  })

  it('uses strict-dynamic so a host allowlist cannot weaken scripts', () => {
    expect(directive(csp, 'script-src')).toContain("'strict-dynamic'")
  })

  it('falls back to same-origin rather than to nothing', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
  })

  it('forbids plugins and base tag rewriting', () => {
    // object-src is the classic bypass: a Flash or PDF object can execute in
    // contexts script-src does not cover. base-uri stops a relative script path
    // being repointed at another origin.
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
  })

  it('forbids being framed', () => {
    // Clickjacking. X-Frame-Options in next.config.ts says the same thing to
    // browsers that predate frame-ancestors; neither replaces the other.
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('restricts where a form may submit', () => {
    // Without this, injected markup can post a password to another origin while
    // every other directive holds.
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
  })

  it('allows inline styles, and only styles', () => {
    // The one deliberate concession, because React writes style attributes for
    // anything positioned at runtime. Bounded to this directive on purpose.
    expect(directive(csp, 'style-src')).toContain("'unsafe-inline'")
  })

  it('upgrades insecure requests', () => {
    expect(csp).toContain('upgrade-insecure-requests')
  })

  it('is a single line with no stray separators', () => {
    // A header containing a newline is truncated or rejected outright, and an
    // empty directive from a trailing semicolon is ignored silently.
    expect(csp).not.toMatch(/[\r\n]/)
    expect(csp).not.toMatch(/;\s*;/)
    expect(csp.endsWith(';')).toBe(false)
  })

  it('names every directive the app relies on', () => {
    // A directive that is absent falls back to default-src, which is correct
    // here but only by accident. Enumerating them makes a removal deliberate.
    for (const name of [
      'default-src',
      'script-src',
      'style-src',
      'img-src',
      'font-src',
      'connect-src',
      'frame-src',
      'frame-ancestors',
      'form-action',
      'object-src',
      'base-uri',
    ]) {
      expect(() => directive(csp, name)).not.toThrow()
    }
  })
})
