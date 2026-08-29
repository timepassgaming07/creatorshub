/**
 * Domain challenge verification service unit tests (Item 4.3).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  type DnsResolverPort,
  generateDomainVerificationToken,
  verifyCustomDomainDns,
} from './domain-verification'

describe('generateDomainVerificationToken', () => {
  it('generates a secure token prefixed with ch_verify_', () => {
    const token1 = generateDomainVerificationToken()
    const token2 = generateDomainVerificationToken()

    expect(token1.startsWith('ch_verify_')).toBe(true)
    expect(token2.startsWith('ch_verify_')).toBe(true)
    expect(token1).not.toBe(token2)
    expect(token1.length).toBeGreaterThanOrEqual(24)
  })
})

describe('verifyCustomDomainDns', () => {
  const domain = 'shop.janedoe.com'
  const token = 'ch_verify_abc123xyz456'

  it('verifies successfully via matching DNS TXT record', async () => {
    const resolveTxt = vi.fn<DnsResolverPort['resolveTxt']>().mockResolvedValue([[token]])
    const resolveCname = vi
      .fn<DnsResolverPort['resolveCname']>()
      .mockRejectedValue(new Error('not queried'))
    const mockResolver: DnsResolverPort = {
      resolveTxt: async (h) => resolveTxt(h),
      resolveCname: async (h) => resolveCname(h),
    }

    const result = await verifyCustomDomainDns(domain, token, { resolver: mockResolver })
    expect(result.verified).toBe(true)
    if (result.verified) {
      expect(result.method).toBe('txt')
      expect(result.verifiedAt).toBeInstanceOf(Date)
    }

    expect(resolveTxt).toHaveBeenCalledWith('_creatorhub-challenge.shop.janedoe.com')
  })

  it('verifies successfully via CNAME record fallback when TXT is absent', async () => {
    const mockResolver: DnsResolverPort = {
      resolveTxt: async () => Promise.reject(new Error('ENOTFOUND')),
      resolveCname: async () => Promise.resolve(['cname.creatorhub.com.']),
    }

    const result = await verifyCustomDomainDns(domain, token, { resolver: mockResolver })
    expect(result.verified).toBe(true)
    if (result.verified) {
      expect(result.method).toBe('cname')
      expect(result.verifiedAt).toBeInstanceOf(Date)
    }
  })

  it('fails verification when neither TXT token matches nor CNAME points to platform', async () => {
    const mockResolver: DnsResolverPort = {
      resolveTxt: async () => Promise.resolve([['wrong-token']]),
      resolveCname: async () => Promise.resolve(['unrelated.server.net']),
    }

    const result = await verifyCustomDomainDns(domain, token, { resolver: mockResolver })
    expect(result.verified).toBe(false)
    if (!result.verified) {
      expect(result.reason).toBe('token_mismatch')
      expect(result.details).toContain('_creatorhub-challenge.shop.janedoe.com')
    }
  })

  it('reports dns_lookup_failed when both DNS lookups return ENOTFOUND', async () => {
    const mockResolver: DnsResolverPort = {
      resolveTxt: async () => Promise.reject(new Error('queryTxt ENOTFOUND')),
      resolveCname: async () => Promise.reject(new Error('queryCname ENOTFOUND')),
    }

    const result = await verifyCustomDomainDns(domain, token, { resolver: mockResolver })
    expect(result.verified).toBe(false)
    if (!result.verified) {
      expect(result.reason).toBe('dns_lookup_failed')
    }
  })
})
