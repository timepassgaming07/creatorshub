/**
 * UUIDv7 generator compliant with RFC 9562 and @creatorhub/contracts assertUuidV7.
 *
 * Responsibilities:
 * - Generate time-ordered UUIDv7 (48-bit millisecond timestamp + version 7 + variant 10).
 * - Satisfies contracts UUID_V7_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
 */
import { randomBytes } from 'node:crypto'

export function generateUuidV7(): string {
  const bytes = randomBytes(16)
  const now = Date.now()

  // 48-bit timestamp in milliseconds (big-endian)
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff
  bytes[1] = Math.floor(now / 0x100000000) & 0xff
  bytes[2] = Math.floor(now / 0x1000000) & 0xff
  bytes[3] = Math.floor(now / 0x10000) & 0xff
  bytes[4] = Math.floor(now / 0x100) & 0xff
  bytes[5] = now & 0xff

  // Version 7: set top 4 bits of byte 6 to 0111 (0x70)
  bytes[6] = (bytes[6]! & 0x0f) | 0x70

  // Variant RFC 9562: set top 2 bits of byte 8 to 10 (0x80)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
