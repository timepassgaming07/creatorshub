/**
 * Runtime configuration for the web app.
 *
 * Responsibilities: one place that reads deployment settings and decides which
 * adapters a deployment may use. Dependencies: none.
 *
 * The rule this file enforces: an adapter that fakes the outside world (memory
 * payments, logged email, in-process storage) never runs in production by
 * accident. Production is `NODE_ENV=production`. The end-to-end suite also runs
 * a production build, so it opts back in with `CREATORHUB_TEST_MODE=1`, which a
 * real deployment never sets and which the UI announces on every checkout.
 */

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

function read(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** True when fake adapters are allowed: development, tests, or explicit test mode. */
export function allowsTestAdapters(): boolean {
  return !isProduction() || read('CREATORHUB_TEST_MODE') === '1'
}

/** The app's public origin, without a trailing slash. */
export function appUrl(): string {
  const url = read('NEXT_PUBLIC_APP_URL') ?? read('AUTH_BASE_URL')
  if (url) return url.replace(/\/$/, '')
  if (isProduction()) {
    throw new ConfigurationError('Set NEXT_PUBLIC_APP_URL to the public origin of the app.')
  }
  return 'http://localhost:3000'
}

/** The domain storefront subdomains hang off, e.g. creatorhub.store. */
export function platformRootDomain(): string {
  return read('PLATFORM_ROOT_DOMAIN') ?? 'localhost'
}

/**
 * The public URL of a storefront. On localhost there is no wildcard DNS, so
 * stores are served from the path form `/s/<subdomain>` instead.
 */
export function storefrontUrl(subdomain: string): string {
  const root = platformRootDomain()
  if (root === 'localhost' || root.startsWith('localhost:')) {
    return `${appUrl()}/s/${subdomain}`
  }
  const protocol = appUrl().startsWith('http://') ? 'http' : 'https'
  return `${protocol}://${subdomain}.${root}`
}

const DEVELOPMENT_AUDIT_SALT = 'development-audit-ip-salt-at-least-32-chars-long'

/**
 * Salt for hashing IP addresses in audit rows. A public default would make the
 * hashes reversible by brute force over the IPv4 space, so production refuses
 * to run without a real one.
 */
export function auditSalt(): string {
  const salt = read('AUDIT_IP_SALT')
  if (salt && salt.length >= 32) return salt
  if (isProduction()) {
    throw new ConfigurationError('Set AUDIT_IP_SALT to a random value of at least 32 characters.')
  }
  return DEVELOPMENT_AUDIT_SALT
}

export const auditOptions = { currentSalt: auditSalt }

export function webhookSecret(provider: string): string | undefined {
  return read(`${provider.toUpperCase()}_WEBHOOK_SECRET`) ?? read('PAYMENT_WEBHOOK_SECRET')
}

export function envValue(name: string): string | undefined {
  return read(name)
}
