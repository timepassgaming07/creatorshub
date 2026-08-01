import type { NextConfig } from 'next'

/**
 * Security headers are set here rather than in middleware so they apply to every
 * response including static assets, and so they cannot be skipped by a route
 * that forgets to call a helper. See docs/engineering/security.md §9.
 *
 * CSP is deliberately absent for now: a nonce-based policy with no `unsafe-inline`
 * has to be generated per request in middleware, and adding a permissive one here
 * would be worse than none — it would look like the control exists. It lands in
 * slice 1 alongside the auth surface.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Types are checked by the build and again by the `typecheck` script.
  // Lint is a separate CI step; Next 16 no longer accepts an `eslint` key here.
  typescript: { ignoreBuildErrors: false },

  // Next's config type declares headers() as returning a Promise. Nothing here
  // needs awaiting; dropping `async` would be a type error, not a simplification.
  // eslint-disable-next-line @typescript-eslint/require-await
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
