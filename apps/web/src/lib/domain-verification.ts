/**
 * Custom domain challenge verification service (Implementation Plan §4.3).
 *
 * Responsibilities:
 * 1. Generate cryptographically random verification tokens for custom domains.
 * 2. Abstract DNS resolution port (allowing unit test mock injection and production DNS query).
 * 3. Validate DNS challenge records (TXT record or CNAME pointing to platform).
 * 4. Return structured verification results with actionable creator feedback.
 */
import { randomBytes } from 'node:crypto'
import dns from 'node:dns/promises'
import { buildDomainChallenge, type CustomDomainVerificationResult } from '@creatorhub/contracts'

export type DnsResolverPort = {
  readonly resolveTxt: (hostname: string) => Promise<string[][]>
  readonly resolveCname: (hostname: string) => Promise<string[]>
}

export const nodeDnsResolver: DnsResolverPort = {
  async resolveTxt(hostname: string): Promise<string[][]> {
    return dns.resolveTxt(hostname)
  },
  async resolveCname(hostname: string): Promise<string[]> {
    return dns.resolveCname(hostname)
  },
}

/**
 * Generates a high-entropy custom domain verification token.
 */
export function generateDomainVerificationToken(): string {
  return `ch_verify_${randomBytes(18).toString('base64url')}`
}

export type VerifyDomainOptions = {
  readonly resolver?: DnsResolverPort
  readonly cnameTarget?: string
}

/**
 * Verifies domain ownership via DNS TXT challenge or direct platform CNAME record.
 */
export async function verifyCustomDomainDns(
  domain: string,
  expectedToken: string,
  options: VerifyDomainOptions = {},
): Promise<CustomDomainVerificationResult> {
  const resolver = options.resolver ?? nodeDnsResolver
  const challenge = buildDomainChallenge(domain, expectedToken, options.cnameTarget)

  let txtLookupError: string | null = null
  let cnameLookupError: string | null = null

  // 1. Primary: Try DNS TXT challenge on _creatorhub-challenge.<domain>
  try {
    const txtRecords = await resolver.resolveTxt(challenge.txtRecord.host)
    const flatTxt = txtRecords.flat().map((chunk) => chunk.trim())
    if (flatTxt.includes(expectedToken.trim())) {
      return {
        verified: true,
        method: 'txt',
        verifiedAt: new Date(),
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    txtLookupError = msg
  }

  // 2. Secondary: Try CNAME challenge on <domain>
  try {
    const cnameRecords = await resolver.resolveCname(challenge.cnameRecord.host)
    const targetNormalized = challenge.cnameRecord.target.toLowerCase().replace(/\.$/, '')
    const matches = cnameRecords.some(
      (r) => r.toLowerCase().replace(/\.$/, '') === targetNormalized,
    )
    if (matches) {
      return {
        verified: true,
        method: 'cname',
        verifiedAt: new Date(),
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    cnameLookupError = msg
  }

  // Diagnosis details for creator guidance
  const details = [
    `DNS TXT challenge on '${challenge.txtRecord.host}' failed: ${txtLookupError ?? 'Record value did not match expected token.'}`,
    `CNAME challenge on '${challenge.cnameRecord.host}' failed: ${cnameLookupError ?? `CNAME does not point to '${challenge.cnameRecord.target}'.`}`,
  ].join(' | ')

  const isDnsFailure =
    txtLookupError?.includes('ENOTFOUND') && cnameLookupError?.includes('ENOTFOUND')

  return {
    verified: false,
    reason: isDnsFailure ? 'dns_lookup_failed' : 'token_mismatch',
    details,
  }
}
