/**
 * Binary file signature inspection and MIME verification (Implementation Plan §3.3).
 *
 * Responsibilities:
 * Inspect raw initial bytes (magic numbers) of uploaded objects to verify that
 * client-declared MIME types match genuine binary file signatures, preventing
 * extension spoofing and malicious masquerading.
 */

export type MimeInspectionResult = {
  readonly valid: boolean
  readonly detectedMimeType: string | null
  readonly reason?: string | undefined
}

/**
 * Checks if byte array starts with a specific byte prefix.
 */
function matchesPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false
  }
  return true
}

/**
 * Detects binary MIME type from file header magic numbers.
 */
export function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null

  // 1. PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (matchesPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) {
    return 'application/pdf'
  }

  // 2. PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (matchesPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }

  // 3. JPEG: 0xFF 0xD8 0xFF
  if (matchesPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg'
  }

  // 4. GIF: GIF87a or GIF89a (0x47 0x49 0x46 0x38 0x37/0x39 0x61)
  if (
    matchesPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matchesPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'image/gif'
  }

  // 5. WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    matchesPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  // 6. ZIP / EPUB / DOCX / XLSX: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (matchesPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    return 'application/zip'
  }

  // 7. MP4 / MOV: ....ftyp (bytes 4..7: 0x66 0x74 0x79 0x70)
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'video/mp4'
  }

  // 8. MP3: ID3 or sync word (0xFF 0xFB/F3/F2)
  if (matchesPrefix(bytes, [0x49, 0x44, 0x33])) {
    return 'audio/mpeg'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) {
    return 'audio/mpeg'
  }

  // 9. Plain text / JSON / CSV check: valid UTF-8 without non-printable control chars
  let isPrintableUtf8 = true
  const sampleLength = Math.min(bytes.length, 1024)
  for (let i = 0; i < sampleLength; i++) {
    const b = bytes[i] ?? 0
    // Control characters other than tab (9), LF (10), CR (13)
    if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
      isPrintableUtf8 = false
      break
    }
  }

  if (isPrintableUtf8) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(0, sampleLength))
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        return 'application/json'
      }
      return 'text/plain'
    } catch {
      // not valid utf-8
    }
  }

  return null
}

/**
 * Validates whether the declared MIME type is consistent with inspected binary signatures.
 */
export function validateMimeType(
  bytes: Uint8Array,
  declaredMimeType: string,
): MimeInspectionResult {
  const normalizedDeclared = declaredMimeType.toLowerCase().trim()
  const detected = detectMimeType(bytes)

  if (!detected) {
    // If unknown binary format or generic octet-stream
    if (normalizedDeclared === 'application/octet-stream') {
      return { valid: true, detectedMimeType: 'application/octet-stream' }
    }
    return {
      valid: false,
      detectedMimeType: null,
      reason: `Could not identify a valid file signature matching declared MIME type '${declaredMimeType}'.`,
    }
  }

  // Exact match
  if (detected === normalizedDeclared) {
    return { valid: true, detectedMimeType: detected }
  }

  // Compatible container formats:
  // ZIP containers for EPUB, CBZ, etc.
  if (
    detected === 'application/zip' &&
    (normalizedDeclared === 'application/epub+zip' ||
      normalizedDeclared === 'application/x-zip-compressed' ||
      normalizedDeclared === 'application/zip')
  ) {
    return { valid: true, detectedMimeType: detected }
  }

  // Text variations: text/plain, text/csv, text/markdown, application/json
  if (
    detected === 'text/plain' &&
    (normalizedDeclared === 'text/csv' ||
      normalizedDeclared === 'text/markdown' ||
      normalizedDeclared === 'text/plain')
  ) {
    return { valid: true, detectedMimeType: detected }
  }

  if (detected === 'application/json' && normalizedDeclared === 'application/json') {
    return { valid: true, detectedMimeType: detected }
  }

  return {
    valid: false,
    detectedMimeType: detected,
    reason: `File signature is '${detected}', which does not match declared MIME type '${declaredMimeType}'.`,
  }
}
