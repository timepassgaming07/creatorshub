/**
 * Per-request Content Security Policy.
 *
 * This is the only place a nonce can be generated. `next.config.ts` sets the
 * static security headers, because those apply to every response including static
 * assets and cannot be skipped by a route that forgets a helper. A nonce cannot
 * live there: it has to differ per response, and a value baked into the config is
 * the same for every visitor forever, which is the same as having no nonce.
 *
 * Pays off technical debt item 1, recorded in STATE.md, and closes the last gap
 * in security.md §9.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, generateNonce } from './lib/csp'

/** The response header a browser reads the policy from. */
export const CSP_HEADER = 'Content-Security-Policy'

export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce()
  const csp = buildCsp({ nonce, development: process.env.NODE_ENV === 'development' })

  /**
   * Set on the request as well as the response, and this is the part that is easy
   * to get wrong.
   *
   * Next parses the policy off the *request* header and stamps the nonce onto
   * every script tag it renders itself. Setting it only on the response leaves
   * the browser enforcing a nonce that none of the framework's own scripts carry,
   * which blocks the entire application while the header looks perfectly correct
   * in a network tab.
   *
   * That is also why there is no separate `x-nonce`: one value in one place,
   * parsed by the framework, rather than a second copy that can drift from the
   * policy actually being enforced.
   */
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(CSP_HEADER, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(CSP_HEADER, csp)

  return response
}

export const config = {
  /**
   * Every path except Next's own static output and the favicon.
   *
   * `_next/static` and `_next/image` are immutable build artefacts that no policy
   * needs to protect and which would otherwise pay for a nonce generation on
   * every asset request. Everything else is covered, including `/api/auth/*`:
   * Better Auth's routes return JSON rather than HTML, so the policy is close to
   * irrelevant to them, but excluding them would mean the one part of the app
   * handling credentials is the one part with no policy, and that is not a
   * sentence worth being able to write.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
