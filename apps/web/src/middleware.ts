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
import {
  formatReferralCookie,
  isValidReferralCode,
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
} from './lib/referral'

/** The response header a browser reads the policy from. */
export const CSP_HEADER = 'Content-Security-Policy'

/**
 * The origin a browser uploads to directly when a bucket is configured. Only
 * that exact origin is added to connect-src, never a wildcard.
 */
function storageOrigin(): string[] {
  const provider = process.env['STORAGE_PROVIDER'] ?? process.env['STORAGE_DRIVER']
  if (provider !== 's3' && provider !== 'r2') return []
  const endpoint = process.env['STORAGE_ENDPOINT']
  const bucket = process.env['STORAGE_BUCKET']
  try {
    if (endpoint) return [new URL(endpoint).origin]
    if (bucket) {
      const region = process.env['STORAGE_REGION'] ?? 'us-east-1'
      return [`https://${bucket}.s3.${region}.amazonaws.com`]
    }
  } catch {
    // A malformed endpoint adds nothing rather than something unexpected.
  }
  return []
}

/** The storefront host a request is for, when it is a storefront request. */
function storefrontHost(
  pathname: string,
  resolution: ReturnType<typeof resolveHostname>,
): string | null {
  if (resolution.type === 'subdomain') return resolution.subdomain
  if (resolution.type === 'custom-domain') return resolution.domain
  const match = /^\/(?:s|c)\/([^/]+)/.exec(pathname)
  return match?.[1] ? decodeURIComponent(match[1]).toLowerCase() : null
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const csp = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    connectSources: storageOrigin(),
  })

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

  // An affiliate link: remember the referral for this store only.
  const ref = request.nextUrl.searchParams.get('ref')
  const refHost = ref && !isApi ? storefrontHost(pathname, resolution) : null
  if (ref && refHost && isValidReferralCode(ref)) {
    response.cookies.set(REFERRAL_COOKIE, formatReferralCookie(refHost, ref, new Date()), {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: REFERRAL_MAX_AGE_SECONDS,
    })
  }

  return response
}

export const config = {
  /**
   * Match all requests except static assets and favicon.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
