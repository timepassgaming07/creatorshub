/**
 * Hostname resolution helper for multi-tenant storefront routing (Implementation Plan §4.2).
 *
 * Responsibilities:
 * 1. Parse incoming HTTP host header.
 * 2. Distinguish platform apex/system routes, tenant subdomains, and custom domains.
 * 3. Handle port numbers and local development environments (localhost, 127.0.0.1, .local).
 */
import { RESERVED_SUBDOMAINS } from '@creatorhub/contracts'

export type HostnameResolution =
  | { readonly type: 'platform' }
  | { readonly type: 'subdomain'; readonly subdomain: string }
  | { readonly type: 'custom-domain'; readonly domain: string }
  | { readonly type: 'reserved'; readonly subdomain: string }

const DEFAULT_ROOT_DOMAINS = ['creatorhub.com', 'creatorhub.local', 'localhost']

/**
 * Strips port and protocol from host string and normalizes to lowercase.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return ''
  // Strip protocol if present
  let clean = host.replace(/^https?:\/\//i, '')
  // Strip port if present (e.g. localhost:3000 -> localhost)
  clean = clean.split(':')[0]?.trim().toLowerCase() ?? ''
  return clean
}

/**
 * Resolves a hostname against the configured platform root domains.
 */
export function resolveHostname(
  hostHeader: string | null | undefined,
  configuredRootDomain?: string,
): HostnameResolution {
  const host = normalizeHost(hostHeader)

  if (!host || host === '127.0.0.1') {
    return { type: 'platform' }
  }

  const rootDomains = configuredRootDomain
    ? [configuredRootDomain.toLowerCase(), ...DEFAULT_ROOT_DOMAINS]
    : DEFAULT_ROOT_DOMAINS

  // Check if host exactly matches any root domain
  for (const root of rootDomains) {
    if (host === root || host === `www.${root}`) {
      return { type: 'platform' }
    }

    // Check if host is a subdomain of this root domain
    if (host.endsWith(`.${root}`)) {
      const subdomain = host.slice(0, -(root.length + 1)).toLowerCase()

      // Handle nested subdomains (e.g. a.b.creatorhub.com -> reject/reserved)
      if (subdomain.includes('.')) {
        return { type: 'reserved', subdomain }
      }

      if (RESERVED_SUBDOMAINS.includes(subdomain as (typeof RESERVED_SUBDOMAINS)[number])) {
        // App, auth, api subdomains are platform entry points
        if (['app', 'auth', 'api', 'dashboard', 'preview', 'www'].includes(subdomain)) {
          return { type: 'platform' }
        }
        return { type: 'reserved', subdomain }
      }

      return { type: 'subdomain', subdomain }
    }
  }

  // Not a platform root domain or subdomain -> Custom Domain
  return { type: 'custom-domain', domain: host }
}
