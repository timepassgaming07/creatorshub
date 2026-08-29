/**
 * Hostname resolution unit tests (Item 4.2).
 */
import { describe, expect, it } from 'vitest'

import { normalizeHost, resolveHostname } from './hostname'

describe('Hostname Normalization', () => {
  it('strips ports and protocols and converts to lowercase', () => {
    expect(normalizeHost('https://CreatorHub.com:3000')).toBe('creatorhub.com')
    expect(normalizeHost('JANE.creatorhub.local:8080')).toBe('jane.creatorhub.local')
    expect(normalizeHost('SHOP.example.com')).toBe('shop.example.com')
    expect(normalizeHost('')).toBe('')
    expect(normalizeHost(null)).toBe('')
  })
})

describe('Hostname Resolution', () => {
  it('resolves platform root domains and localhost', () => {
    expect(resolveHostname('creatorhub.com')).toEqual({ type: 'platform' })
    expect(resolveHostname('www.creatorhub.com')).toEqual({ type: 'platform' })
    expect(resolveHostname('localhost:3000')).toEqual({ type: 'platform' })
    expect(resolveHostname('127.0.0.1:3000')).toEqual({ type: 'platform' })
    expect(resolveHostname('creatorhub.local:3000')).toEqual({ type: 'platform' })
  })

  it('resolves platform system subdomains', () => {
    expect(resolveHostname('app.creatorhub.com')).toEqual({ type: 'platform' })
    expect(resolveHostname('auth.creatorhub.com')).toEqual({ type: 'platform' })
    expect(resolveHostname('api.creatorhub.com')).toEqual({ type: 'platform' })
    expect(resolveHostname('dashboard.creatorhub.local:3000')).toEqual({ type: 'platform' })
  })

  it('resolves valid creator subdomains', () => {
    expect(resolveHostname('jane.creatorhub.com')).toEqual({
      type: 'subdomain',
      subdomain: 'jane',
    })
    expect(resolveHostname('my-cool-store.creatorhub.local:3000')).toEqual({
      type: 'subdomain',
      subdomain: 'my-cool-store',
    })
    expect(resolveHostname('ALICE.localhost:3000')).toEqual({
      type: 'subdomain',
      subdomain: 'alice',
    })
  })

  it('identifies reserved platform subdomains that are not app entry points', () => {
    expect(resolveHostname('admin.creatorhub.com')).toEqual({
      type: 'reserved',
      subdomain: 'admin',
    })
    expect(resolveHostname('billing.creatorhub.com')).toEqual({
      type: 'reserved',
      subdomain: 'billing',
    })
    expect(resolveHostname('payments.creatorhub.com')).toEqual({
      type: 'reserved',
      subdomain: 'payments',
    })
  })

  it('identifies nested subdomains as reserved', () => {
    expect(resolveHostname('a.b.creatorhub.com')).toEqual({
      type: 'reserved',
      subdomain: 'a.b',
    })
  })

  it('resolves custom domains', () => {
    expect(resolveHostname('shop.janedoe.com')).toEqual({
      type: 'custom-domain',
      domain: 'shop.janedoe.com',
    })
    expect(resolveHostname('store.acme.org:443')).toEqual({
      type: 'custom-domain',
      domain: 'store.acme.org',
    })
  })
})
