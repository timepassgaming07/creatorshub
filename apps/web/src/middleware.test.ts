import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { CSP_HEADER, middleware } from './middleware.js'

function requestFor(path: string, host = 'creatorhub.com'): NextRequest {
  const req = new NextRequest(new URL(path, `https://${host}`))
  req.headers.set('host', host)
  return req
}

/** Reads the nonce back out of a policy, which is where a browser reads it. */
function nonceFromCsp(csp: string | null): string {
  if (csp === null) throw new Error('No policy on the response.')
  const match = /'nonce-([^']+)'/.exec(csp)
  if (match?.[1] === undefined) throw new Error(`No policy nonce: ${csp}`)
  return match[1]
}

describe('Middleware — Security & CSP', () => {
  it('sets a policy on the response', () => {
    const response = middleware(requestFor('/'))
    expect(response.headers.get(CSP_HEADER)).toContain("default-src 'self'")
  })

  it('gives every request a different nonce', () => {
    const first = nonceFromCsp(middleware(requestFor('/')).headers.get(CSP_HEADER))
    const second = nonceFromCsp(middleware(requestFor('/')).headers.get(CSP_HEADER))
    expect(first).not.toBe(second)
  })

  it('passes the policy through to the app request headers', () => {
    const response = middleware(requestFor('/'))
    const forwarded = response.headers.get('x-middleware-request-content-security-policy')
    const onResponse = response.headers.get(CSP_HEADER)
    expect(forwarded).not.toBeNull()
    expect(forwarded).toBe(onResponse)
  })

  it('covers the authentication and health routes', () => {
    const authRes = middleware(requestFor('/api/auth/sign-in/email'))
    expect(authRes.headers.get(CSP_HEADER)).toContain("default-src 'self'")

    const healthRes = middleware(requestFor('/api/health'))
    expect(healthRes.headers.get(CSP_HEADER)).not.toBeNull()
  })

  it('carries no unsafe-eval outside development', () => {
    const response = middleware(requestFor('/'))
    expect(response.headers.get(CSP_HEADER)).not.toContain("'unsafe-eval'")
  })
})

describe('Middleware — Hostname to Workspace Resolution (Item 4.2)', () => {
  it('routes platform apex domain requests directly without rewrite', () => {
    const response = middleware(requestFor('/sign-in', 'creatorhub.com'))
    expect(response.headers.get('x-middleware-request-x-creatorhub-target')).toBe('platform')
    // No rewrite header for normal next() response
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('rewrites creator subdomain requests to /s/[subdomain]', () => {
    const response = middleware(requestFor('/products/book', 'alice.creatorhub.com'))
    expect(response.headers.get('x-middleware-request-x-creatorhub-target')).toBe(
      'storefront-subdomain',
    )
    expect(response.headers.get('x-middleware-request-x-creatorhub-subdomain')).toBe('alice')
    expect(response.headers.get('x-middleware-request-x-creatorhub-pathname')).toBe(
      '/products/book',
    )

    const rewrite = response.headers.get('x-middleware-rewrite')
    expect(rewrite).toContain('/s/alice/products/book')
  })

  it('rewrites custom domain requests to /c/[domain]', () => {
    const response = middleware(requestFor('/', 'shop.janedoe.com'))
    expect(response.headers.get('x-middleware-request-x-creatorhub-target')).toBe(
      'storefront-custom-domain',
    )
    expect(response.headers.get('x-middleware-request-x-creatorhub-custom-domain')).toBe(
      'shop.janedoe.com',
    )

    const rewrite = response.headers.get('x-middleware-rewrite')
    expect(rewrite).toContain('/c/shop.janedoe.com')
  })

  it('rewrites reserved subdomains to /_not-found', () => {
    const response = middleware(requestFor('/', 'admin.creatorhub.com'))
    const rewrite = response.headers.get('x-middleware-rewrite')
    expect(rewrite).toContain('/_not-found')
  })

  it('does not rewrite API routes on subdomains', () => {
    const response = middleware(requestFor('/api/health', 'alice.creatorhub.com'))
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })
})
