/**
 * Storefront schemas and domain contracts unit tests (Item 4.1).
 */
import { describe, expect, it } from 'vitest'

import {
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
