/**
 * Storefront schemas and domain contracts unit tests (Item 4.1).
 */
import { describe, expect, it } from 'vitest'

import {
  buildDomainChallenge,
  createStorefrontInputSchema,
  customDomainSchema,
  RESERVED_SUBDOMAINS,
  storefrontThemeSchema,
  subdomainSchema,
  updateStorefrontInputSchema,
} from './storefronts.js'

describe('Storefront Subdomain & Domain Validation', () => {
  it('accepts valid subdomains', () => {
    const valid = ['my-store', 'creator123', 'a-b-c', 'john-doe-shop']
    for (const sub of valid) {
      expect(subdomainSchema.parse(sub)).toBe(sub.toLowerCase())
    }
  })

  it('normalizes uppercase subdomains to lowercase', () => {
    expect(subdomainSchema.parse('My-Shop')).toBe('my-shop')
  })

  it('rejects subdomains that are too short or long', () => {
    expect(() => subdomainSchema.parse('ab')).toThrow(/at least 3 characters/i)
    expect(() => subdomainSchema.parse('a'.repeat(64))).toThrow(/not exceed 63 characters/i)
  })

  it('rejects subdomains with invalid characters or leading/trailing hyphens', () => {
    expect(() => subdomainSchema.parse('-invalid')).toThrow()
    expect(() => subdomainSchema.parse('invalid-')).toThrow()
    expect(() => subdomainSchema.parse('my_store')).toThrow()
    expect(() => subdomainSchema.parse('my.store')).toThrow()
    expect(() => subdomainSchema.parse('my store')).toThrow()
  })

  it('rejects all platform reserved subdomains', () => {
    for (const reserved of RESERVED_SUBDOMAINS) {
      expect(() => subdomainSchema.parse(reserved)).toThrow(/reserved by the platform/i)
      expect(() => subdomainSchema.parse(reserved.toUpperCase())).toThrow(
        /reserved by the platform/i,
      )
    }
  })

  it('accepts valid custom domains', () => {
    const valid = ['shop.janedoe.com', 'store.acme.co.uk', 'merch.my-brand.io']
    for (const domain of valid) {
      expect(customDomainSchema.parse(domain)).toBe(domain.toLowerCase())
    }
  })

  it('rejects malformed custom domains', () => {
    expect(() => customDomainSchema.parse('https://shop.example.com')).toThrow()
    expect(() => customDomainSchema.parse('shop.example.com/path')).toThrow()
    expect(() => customDomainSchema.parse('localhost')).toThrow()
  })
})

describe('Storefront Theme Schema', () => {
  it('parses valid theme config with defaults', () => {
    const theme = storefrontThemeSchema.parse({})
    expect(theme.accentColor).toBe('#4f46e5')
    expect(theme.fontPreset).toBe('sans')
    expect(theme.layoutPreset).toBe('showcase')
  })

  it('validates custom hex accent colors', () => {
    const theme = storefrontThemeSchema.parse({
      accentColor: '#ff0055',
      fontPreset: 'serif',
      layoutPreset: 'editorial',
      heroHeadline: 'My Custom Headline',
    })
    expect(theme.accentColor).toBe('#ff0055')
    expect(theme.fontPreset).toBe('serif')
    expect(theme.layoutPreset).toBe('editorial')
    expect(theme.heroHeadline).toBe('My Custom Headline')
  })

  it('rejects invalid hex accent colors', () => {
    expect(() => storefrontThemeSchema.parse({ accentColor: 'red' })).toThrow(/hex code/i)
    expect(() => storefrontThemeSchema.parse({ accentColor: '#12345' })).toThrow(/hex code/i)
  })
})

describe('Storefront Input Schemas', () => {
  const validWorkspaceId = '018f9e2b-7c5e-7a2e-8c3b-123456789abc'

  it('parses valid CreateStorefrontInput', () => {
    const input = createStorefrontInputSchema.parse({
      workspaceId: validWorkspaceId,
      subdomain: 'cool-creations',
      title: 'Cool Creations',
      tagline: 'Exclusive digital assets',
    })

    expect(input.workspaceId).toBe(validWorkspaceId)
    expect(input.subdomain).toBe('cool-creations')
    expect(input.title).toBe('Cool Creations')
  })

  it('parses valid UpdateStorefrontInput with nullable fields', () => {
    const input = updateStorefrontInputSchema.parse({
      title: 'Updated Store Title',
      tagline: null,
      customDomain: 'store.customdomain.org',
      status: 'published',
    })

    expect(input.title).toBe('Updated Store Title')
    expect(input.tagline).toBeNull()
    expect(input.customDomain).toBe('store.customdomain.org')
    expect(input.status).toBe('published')
  })
})

describe('buildDomainChallenge', () => {
  it('constructs correct TXT and CNAME challenge records', () => {
    const challenge = buildDomainChallenge('Shop.JaneDoe.COM', 'ch_verify_123456789abcdef')

    expect(challenge.domain).toBe('shop.janedoe.com')
    expect(challenge.verificationToken).toBe('ch_verify_123456789abcdef')
    expect(challenge.txtRecord.host).toBe('_creatorhub-challenge.shop.janedoe.com')
    expect(challenge.txtRecord.value).toBe('ch_verify_123456789abcdef')
    expect(challenge.cnameRecord.host).toBe('shop.janedoe.com')
    expect(challenge.cnameRecord.target).toBe('cname.creatorhub.com')
  })

  it('supports custom CNAME target override', () => {
    const challenge = buildDomainChallenge(
      'merch.creator.io',
      'ch_verify_token',
      'custom.creatorhub.local',
    )
    expect(challenge.cnameRecord.target).toBe('custom.creatorhub.local')
  })
})

describe('Storefront link URLs', () => {
  it('rejects links that would run script', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      'JAVASCRIPT:alert(1)',
    ]) {
      expect(() => storefrontThemeSchema.parse({ customLinks: [{ label: 'x', url }] })).toThrow()
      expect(() =>
        storefrontThemeSchema.parse({ socialLinks: [{ platform: 'website', url }] }),
      ).toThrow()
    }
  })

  it('accepts web and mail links', () => {
    const theme = storefrontThemeSchema.parse({
      socialLinks: [{ platform: 'instagram', url: 'https://instagram.com/asha' }],
      customLinks: [{ label: 'Email me', url: 'mailto:asha@example.com' }],
    })
    expect(theme.customLinks[0]?.url).toBe('mailto:asha@example.com')
  })
})
