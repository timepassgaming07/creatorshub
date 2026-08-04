import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { CSP_HEADER, middleware } from './middleware'

/**
 * Middleware behaviour.
 *
 * The assertion that matters most is that the policy reaches the request as well
 * as the response. Next reads it off the request to stamp its own script tags; if
 * only the response carries it, the browser enforces a nonce that none of the
 * framework's scripts have, and the whole application is blocked while the header
 * looks perfectly correct in a network tab.
 */

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://creatorhub.com'))
}

/** Reads the nonce back out of a policy, which is where a browser reads it. */
function nonceFromCsp(csp: string | null): string {
  if (csp === null) throw new Error('No policy on the response.')
  const match = /'nonce-([^']+)'/.exec(csp)
  if (match?.[1] === undefined) throw new Error(`No nonce in policy: ${csp}`)
  return match[1]
}

describe('middleware', () => {
  it('sets a policy on the response', () => {
    const response = middleware(requestFor('/'))
    expect(response.headers.get(CSP_HEADER)).toContain("default-src 'self'")
  })

  it('gives every request a different nonce', () => {
    // Per-response is the entire mechanism. A nonce reused across responses can
    // be read from one page and replayed by a script injected into another.
    const first = nonceFromCsp(middleware(requestFor('/')).headers.get(CSP_HEADER))
    const second = nonceFromCsp(middleware(requestFor('/')).headers.get(CSP_HEADER))

    expect(first).not.toBe(second)
  })

  it('passes the policy through to the app, not only to the browser', () => {
    // The failure this catches is silent: scripts blocked in production while
    // every header looks right. Next needs the policy on the request to nonce
    // its own tags.
    const response = middleware(requestFor('/'))

    // NextResponse.next() carries forwarded request headers here, which is what
    // the framework reads downstream.
    const forwarded = response.headers.get('x-middleware-request-content-security-policy')
    const onResponse = response.headers.get(CSP_HEADER)

    expect(forwarded).not.toBeNull()
    expect(forwarded).toBe(onResponse)
  })

  it('covers the authentication routes', () => {
    // The part of the app handling credentials is not the part to leave without
    // a policy, even though these routes answer with JSON.
    const response = middleware(requestFor('/api/auth/sign-in/email'))
    expect(response.headers.get(CSP_HEADER)).toContain("default-src 'self'")
  })

  it('covers the health route', () => {
    const response = middleware(requestFor('/api/health'))
    expect(response.headers.get(CSP_HEADER)).not.toBeNull()
  })

  it('carries no unsafe-eval outside development', () => {
    // NODE_ENV is "test" here, so the development relaxation must be off. This
    // is the guard on the one seam in the policy.
    const response = middleware(requestFor('/'))
    expect(response.headers.get(CSP_HEADER)).not.toContain("'unsafe-eval'")
  })
})
