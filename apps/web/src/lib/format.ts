/**
 * Display formatting shared by server and client components.
 *
 * Money arrives as a minor-unit string (bigint does not cross the server
 * action boundary as a number, and must never become one). Locale is fixed per
 * currency rather than taken from the runtime, so the server and the browser
 * render the same characters and hydration never mismatches.
 */
import { currency as toCurrency, money as toMoney } from '@creatorhub/contracts'
import { formatMoney } from '@creatorhub/ui'

function localeFor(currencyCode: string): string {
  return currencyCode.toUpperCase() === 'INR' ? 'en-IN' : 'en-US'
}

export function formatAmount(
  amountMinor: string | bigint | number,
  currencyCode: string,
  options: { readonly compact?: boolean } = {},
): string {
  const amount = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor)
  const code = currencyCode.toUpperCase()
  return formatMoney(toMoney(amount, toCurrency(code)), {
    locale: localeFor(code),
    compactWholeAmounts: options.compact ?? false,
  })
}

/** Large totals for KPI tiles: ₹1.2L, $3.4K. Never used for a price someone pays. */
export function formatAmountShort(amountMinor: string | bigint, currencyCode: string): string {
  const major = Number(BigInt(amountMinor) / 100n)
  const code = currencyCode.toUpperCase()
  return new Intl.NumberFormat(localeFor(code), {
    style: 'currency',
    currency: code,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(major)
}

export function formatDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  )
}

export function formatDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso)
}

export function formatRelative(iso: string | Date, now: Date = new Date()): string {
  const then = typeof iso === 'string' ? new Date(iso) : iso
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day')
  return formatDate(then)
}

export function formatBytes(bytes: number | string): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${String(n)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = n / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'TB'}`
}

/** Parse a major-unit price the creator typed ("499", "499.50") into minor units. */
export function parsePriceToMinor(input: string): bigint | null {
  const clean = input.trim().replaceAll(',', '')
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null
  const [whole = '0', fraction = ''] = clean.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

/** Minor units back to the string a price input shows. */
export function minorToInput(amountMinor: string | bigint): string {
  const value = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor)
  const whole = value / 100n
  const fraction = value % 100n
  return fraction === 0n ? whole.toString() : `${whole.toString()}.${fraction.toString().padStart(2, '0')}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}` : (parts[0]?.slice(0, 2) ?? '')
  return letters.toUpperCase() || '?'
}
