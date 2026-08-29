/**
 * Malware scanning port and heuristic scanner (Implementation Plan §3.4).
 *
 * Responsibilities:
 * Scan binary objects for known malware signatures (including industry standard EICAR string)
 * before marking assets as clean and deliverable.
 */

export type MalwareScanResult =
  | {
      readonly clean: true
    }
  | {
      readonly clean: false
      readonly threatName: string
    }

export type MalwareScanner = {
  readonly name: string
  scanBuffer(data: Uint8Array): Promise<MalwareScanResult>
}

/**
 * Standard EICAR Anti-Virus test string (ASCII bytes).
 * Used worldwide to test antivirus pipeline handling without deploying real malware.
 */
const EICAR_TEST_BYTES = new TextEncoder().encode(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
)

function containsSubsequence(source: Uint8Array, target: Uint8Array): boolean {
  if (target.length > source.length) return false

  for (let i = 0; i <= source.length - target.length; i++) {
    let match = true
    for (let j = 0; j < target.length; j++) {
      if (source[i + j] !== target[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }

  return false
}

export class HeuristicMalwareScanner implements MalwareScanner {
  readonly name = 'heuristic'

  scanBuffer(data: Uint8Array): Promise<MalwareScanResult> {
    // 1. Check for standard EICAR test signature
    if (containsSubsequence(data, EICAR_TEST_BYTES)) {
      return Promise.resolve({
        clean: false,
        threatName: 'EICAR-Standard-AV-Test-Signature',
      })
    }

    // 2. Check for suspicious double-extension Windows executable signatures (MZ header in image/text)
    if (data.length >= 2 && data[0] === 0x4d && data[1] === 0x5a) {
      // MZ DOS/PE Executable Header
      const sampleText = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, 512))
      if (sampleText.includes('This program cannot be run in DOS mode')) {
        return Promise.resolve({
          clean: false,
          threatName: 'Win32.SuspiciousPE.Header',
        })
      }
    }

    return Promise.resolve({ clean: true })
  }
}
