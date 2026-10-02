/**
 * Storefront editor actions: who may change what, and the custom domain flow.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const WS = '018f9e2b-7c5e-7a2e-8c3b-123456789abc'
const USER = '018f9e2b-7c5e-7a2e-8c3b-987654321def'

const mockAccess = vi.fn()
vi.mock('./workspace-access', () => ({
  getWorkspaceAccess: (...args: unknown[]) => mockAccess(...args) as unknown,
}))

const mockWithWorkspace = vi.fn()
vi.mock('./db', () => ({
  getDatabase: () => ({ withWorkspace: mockWithWorkspace }),
}))

const mockVerifyDns = vi.fn()
vi.mock('./domain-verification', () => ({
  generateDomainVerificationToken: () => 'ch_verify_test_token',
  verifyCustomDomainDns: (...args: unknown[]) => mockVerifyDns(...args) as unknown,
}))

const store = {
  findStorefrontByWorkspaceId: vi.fn(),
  updateStorefront: vi.fn(),
  setCustomDomain: vi.fn(),
  updateCustomDomainStatus: vi.fn(),
}
const findAssetById = vi.fn()
vi.mock('@creatorhub/db', () => ({
  storefronts: {
    findStorefrontByWorkspaceId: (...a: unknown[]) =>
      store.findStorefrontByWorkspaceId(...a) as unknown,
    updateStorefront: (...a: unknown[]) => store.updateStorefront(...a) as unknown,
    setCustomDomain: (...a: unknown[]) => store.setCustomDomain(...a) as unknown,
    updateCustomDomainStatus: (...a: unknown[]) => store.updateCustomDomainStatus(...a) as unknown,
  },
  catalogue: { findAssetById: (...a: unknown[]) => findAssetById(...a) as unknown },
  auditLog: { writeAuditLog: vi.fn().mockResolvedValue(undefined) },
}))

import {
  connectCustomDomainAction,
  saveStorefrontAction,
  setStorefrontPublishedAction,
  verifyCustomDomainAction,
} from './storefront-actions'

function signedInAs(role: 'owner' | 'admin' | 'member') {
  mockAccess.mockResolvedValue({
    session: { userId: USER, user: { id: USER, email: 'a@example.com' } },
    access: {
      session: { userId: USER },
      role,
      workspace: { id: WS, name: 'Studio', slug: 'studio', currency: 'INR' },
      storefront: null,
    },
  })
}

const existingStore = {
  id: '018f9e2b-7c5e-7a2e-8c3b-00000000000a',
  status: 'draft',
  customDomain: null as string | null,
  customDomainVerificationToken: null as string | null,
}

const theme = {
  accentColor: '#e2541c',
  fontPreset: 'sans' as const,
  layoutPreset: 'showcase' as const,
  socialLinks: [{ platform: 'instagram' as const, url: 'https://instagram.com/asha' }],
  customLinks: [{ label: 'Book a call', url: 'https://cal.com/asha' }],
}

describe('storefront actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWithWorkspace.mockImplementation((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
    )
    store.findStorefrontByWorkspaceId.mockResolvedValue(existingStore)
  })

  it('refuses a signed-out caller', async () => {
    mockAccess.mockResolvedValue({ session: null, access: null })
    const result = await saveStorefrontAction(WS, { title: 'Studio', tagline: null, theme })
    expect(result.ok).toBe(false)
    expect(store.updateStorefront).not.toHaveBeenCalled()
  })

  it('refuses a member without storefront.manage', async () => {
    signedInAs('member')
    const result = await saveStorefrontAction(WS, { title: 'Studio', tagline: null, theme })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('role') })
    expect(store.updateStorefront).not.toHaveBeenCalled()
  })

  it('rejects a link that would run script, before touching the database', async () => {
    signedInAs('owner')
    const result = await saveStorefrontAction(WS, {
      title: 'Studio',
      tagline: null,
      theme: { ...theme, customLinks: [{ label: 'x', url: 'javascript:alert(1)' }] },
    })
    expect(result.ok).toBe(false)
    expect(mockWithWorkspace).not.toHaveBeenCalled()
  })

  it('saves profile and theme but never status or domain', async () => {
    signedInAs('admin')
    const result = await saveStorefrontAction(WS, { title: 'Studio', tagline: '  ', theme })
    expect(result.ok).toBe(true)
    const patch = store.updateStorefront.mock.calls[0]?.[2] as Record<string, unknown>
    expect(patch).toMatchObject({ title: 'Studio', tagline: null })
    expect(patch).not.toHaveProperty('status')
    expect(patch).not.toHaveProperty('customDomain')
  })

  it('rejects a logo that is not an image', async () => {
    signedInAs('owner')
    findAssetById.mockResolvedValue({ mimeType: 'application/zip', scanStatus: 'clean' })
    const result = await saveStorefrontAction(WS, {
      title: 'Studio',
      tagline: null,
      theme: { ...theme, logoAssetId: '018f9e2b-7c5e-7a2e-8c3b-0000000000ff' },
    })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('logo') })
  })

  it('will not publish a suspended store', async () => {
    signedInAs('owner')
    store.findStorefrontByWorkspaceId.mockResolvedValue({ ...existingStore, status: 'suspended' })
    const result = await setStorefrontPublishedAction(WS, true)
    expect(result.ok).toBe(false)
    expect(store.updateStorefront).not.toHaveBeenCalled()
  })

  it('stores the same verification token it shows the creator', async () => {
    signedInAs('owner')
    const result = await connectCustomDomainAction(WS, 'https://Shop.Example.com/')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(store.setCustomDomain).toHaveBeenCalledWith(
      expect.anything(),
      existingStore.id,
      'shop.example.com',
      'ch_verify_test_token',
    )
    expect(result.data.challenge?.txtRecord.value).toBe('ch_verify_test_token')
  })

  it('refuses a CreatorHub address as a custom domain', async () => {
    signedInAs('owner')
    vi.stubEnv('PLATFORM_ROOT_DOMAIN', 'creatorhub.store')
    const result = await connectCustomDomainAction(WS, 'someone.creatorhub.store')
    vi.unstubAllEnvs()
    expect(result.ok).toBe(false)
    expect(store.setCustomDomain).not.toHaveBeenCalled()
  })

  it('explains a domain another store already holds', async () => {
    signedInAs('owner')
    store.setCustomDomain.mockRejectedValue(
      Object.assign(new Error('insert failed'), { cause: { code: '23505' } }),
    )
    const result = await connectCustomDomainAction(WS, 'shop.example.com')
    expect(result).toEqual({ ok: false, error: expect.stringContaining('already connected') })
  })

  it('checks DNS against the stored token, outside any transaction', async () => {
    signedInAs('owner')
    const pending = {
      ...existingStore,
      customDomain: 'shop.example.com',
      customDomainVerificationToken: 'tok_1',
    }
    store.findStorefrontByWorkspaceId.mockResolvedValue(pending)
    let open = 0
    mockWithWorkspace.mockImplementation(
      async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
        open += 1
        try {
          return await fn({})
        } finally {
          open -= 1
        }
      },
    )
    mockVerifyDns.mockImplementation(() => {
      expect(open).toBe(0)
      return Promise.resolve({ verified: true, method: 'txt', verifiedAt: new Date() })
    })

    const result = await verifyCustomDomainAction(WS)
    expect(result.ok).toBe(true)
    expect(mockVerifyDns).toHaveBeenCalledWith('shop.example.com', 'tok_1', expect.anything())
    expect(store.updateCustomDomainStatus).toHaveBeenCalledWith(
      expect.anything(),
      pending.id,
      'verified',
    )
  })
})
