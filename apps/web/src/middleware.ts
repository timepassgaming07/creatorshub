/**
 * Multi-tenant Edge Middleware (Implementation Plan §4.2 & Security §9).
 *
 * Responsibilities:
 * 1. Generate per-response CSP nonce and security headers.
 * 2. Hostname-to-workspace tenant resolution (subdomain and custom domain).
 * 3. Transparent URL rewriting for public storefront rendering.
 * 4. Preservation of CSP headers across rewritten requests and responses.
 */
import { NextResponse, type NextRequest } from 'next/server'

import { buildCsp, generateNonce } from './lib/csp'
import { resolveHostname } from './lib/hostname'

/** The response header a browser reads the policy from. */
export const CSP_HEADER = 'Content-Security-Policy'

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const csp = buildCsp({ nonce, development: process.env.NODE_ENV === 'development' })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CSP_HEADER, csp)

  const { pathname, search } = request.nextUrl
  const host = request.headers.get('host')
  const resolution = resolveHostname(host, process.env['PLATFORM_ROOT_DOMAIN'])

  // Prevent rewriting for internal framework/API paths
  const isApi = pathname.startsWith('/api/')

  let response: NextResponse

  if (resolution.type === 'subdomain' && !isApi) {
    requestHeaders.set('x-creatorhub-target', 'storefront-subdomain')
    requestHeaders.set('x-creatorhub-subdomain', resolution.subdomain)
    requestHeaders.set('x-creatorhub-pathname', pathname)

    const rewriteUrl = new URL(`/s/${resolution.subdomain}${pathname}${search}`, request.url)
    response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  } else if (resolution.type === 'custom-domain' && !isApi) {
    requestHeaders.set('x-creatorhub-target', 'storefront-custom-domain')
    requestHeaders.set('x-creatorhub-custom-domain', resolution.domain)
    requestHeaders.set('x-creatorhub-pathname', pathname)

    const rewriteUrl = new URL(`/c/${resolution.domain}${pathname}${search}`, request.url)
    response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  } else if (resolution.type === 'reserved' && !isApi) {
    const rewriteUrl = new URL('/_not-found', request.url)
    response = NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    })
  } else {
    requestHeaders.set('x-creatorhub-target', 'platform')
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  response.headers.set(CSP_HEADER, csp)
  return response
}

export const config = {
  /**
   * Match all requests except static assets and favicon.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
