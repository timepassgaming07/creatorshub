/**
 * Referral cookie: remembers which affiliate sent a buyer to a store.
 *
 * Set by the middleware when a storefront URL carries `?ref=<code>`, read by
 * checkout. The value names the store host it was set for, so a code picked up
 * on one creator's store is never credited on another's. HttpOnly, so page
 * scripts cannot read or forge it; a buyer who edits it can at most choose
 * which affiliate gets credit, which the attribution rules (self-referral,
 * approved affiliates only, the attribution window) still bound.
 */

export const REFERRAL_COOKIE = 'ch_ref'
export const REFERRAL_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const CODE_PATTERN = /^[A-Za-z0-9_-]{2,64}$/

export function isValidReferralCode(code: string): boolean {
  return CODE_PATTERN.test(code)
}

export function formatReferralCookie(host: string, code: string, clickedAt: Date): string {
  return [host.toLowerCase(), code, clickedAt.toISOString()].map(encodeURIComponent).join('|')
}

export function readReferralCookie(
  value: string | undefined,
  host: string,
): { code: string; clickedAt: string } | null {
  if (!value) return null
  const parts = value.split('|').map((part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return ''
    }
  })
  const [cookieHost, code, clickedAt] = parts
  if (!cookieHost || !code || !clickedAt) return null
  if (cookieHost !== host.toLowerCase() || !isValidReferralCode(code)) return null
  if (Number.isNaN(Date.parse(clickedAt))) return null
  return { code, clickedAt }
}
