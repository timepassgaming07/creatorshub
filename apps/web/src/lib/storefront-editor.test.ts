/**
 * Storefront Studio & Editor Unit Tests (Item 4.8).
 */
import { userId } from '@creatorhub/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerSession } from './server-session'

const mockGetServerSession = vi.fn<() => Promise<ServerSession | null>>()

vi.mock('./server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

const mockWithWorkspace =
  vi.fn<(_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()

vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
    resolveStorefrontById: vi.fn(),
  }),
}))

const mockFindMemberByUserId = vi.fn()
const mockFindCurrentWorkspace = vi.fn()
const mockFindStorefrontByWorkspaceId = vi.fn()
const mockCreateStorefront = vi.fn()
const mockListProducts = vi.fn()
const mockListAssetsForProduct = vi.fn()
const mockFindAssetById = vi.fn()
const mockWriteAuditLog = vi.fn()

vi.mock('@creatorhub/db', () => ({
  workspaceMembers: {
    findMemberByUserId: (...args: unknown[]) => mockFindMemberByUserId(...args) as unknown,
  },
  workspaces: {
    findCurrentWorkspace: (...args: unknown[]) => mockFindCurrentWorkspace(...args) as unknown,
  },
  storefronts: {
    findStorefrontByWorkspaceId: (...args: unknown[]) =>
      mockFindStorefrontByWorkspaceId(...args) as unknown,
    createStorefront: (...args: unknown[]) => mockCreateStorefront(...args) as unknown,
  },
  catalogue: {
    listProducts: (...args: unknown[]) => mockListProducts(...args) as unknown,
    listAssetsForProduct: (...args: unknown[]) => mockListAssetsForProduct(...args) as unknown,
    findAssetById: (...args: unknown[]) => mockFindAssetById(...args) as unknown,
  },
  auditLog: {
    writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) as unknown,
  },
}))

import { getStorefrontEditorDataAction } from './storefront-actions'

describe('Storefront Studio Data Action', () => {
  const wsId = '018f9e2b-7c5e-7a2e-8c3b-111111111111'
  const uId = '018f9e2b-7c5e-7a2e-8c3b-222222222222'
  const prodId = '018f9e2b-7c5e-7a2e-8c3b-333333333333'
  const sfId = '018f9e2b-7c5e-7a2e-8c3b-444444444444'

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue({
      userId: userId(uId),
      user: {
        id: userId(uId),
        email: 'creator@example.com',
      },
    })
  })

  it('rejects unauthenticated requests', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const result = await getStorefrontEditorDataAction(wsId)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Unauthorized')
    }
  })

  it('rejects invalid workspace identifier format', async () => {
    const result = await getStorefrontEditorDataAction('not-a-uuid')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid workspace identifier')
    }
  })

  it('returns editor data with storefront, workspace info, and catalogue products', async () => {
    mockWithWorkspace.mockImplementation((_ctx, fn) => fn({ tx: {} }))
    mockFindMemberByUserId.mockResolvedValue({
      id: 'mem-1',
      userId: uId,
      role: 'owner',
    })

    mockFindCurrentWorkspace.mockResolvedValue({
      id: wsId,
      name: 'Design Studio',
      slug: 'design-studio',
      defaultCurrency: 'INR',
    })

    mockFindStorefrontByWorkspaceId.mockResolvedValue({
      id: sfId,
      workspaceId: wsId,
      subdomain: 'design-studio',
      customDomain: 'store.designstudio.com',
      customDomainStatus: 'verified',
      customDomainVerificationToken: 'tok_abc12345678901234567890123456789',
      title: 'Design Studio Store',
      tagline: 'Premium digital templates',
      description: 'Official store',
      status: 'published',
      themeConfig: {
        accentColor: '#059669',
        fontPreset: 'serif',
        layoutPreset: 'grid',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    mockListProducts.mockResolvedValue([
      {
        id: prodId,
        title: 'Design System Pro',
        slug: 'design-system-pro',
        description: 'Complete UI system',
        basePrice: 499900n,
        compareAtPrice: 799900n,
        currency: 'INR',
        status: 'published',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const result = await getStorefrontEditorDataAction(wsId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.storefront.title).toBe('Design Studio Store')
      expect(result.data.storefront.subdomain).toBe('design-studio')
      expect(result.data.storefront.customDomain).toBe('store.designstudio.com')
      expect(result.data.workspace.name).toBe('Design Studio')
      expect(result.data.canManage).toBe(true)
      expect(result.data.products).toHaveLength(1)
      expect(result.data.products[0]?.title).toBe('Design System Pro')
      expect(result.data.products[0]?.basePrice).toBe('499900')
      expect(result.data.domainChallenge).toBeDefined()
      expect(result.data.domainChallenge?.txtRecord.host).toContain('_creatorhub-challenge')
    }
  })

  it('provisions default storefront if none exists yet', async () => {
    mockWithWorkspace.mockImplementation((_ctx, fn) => fn({ tx: {} }))
    mockFindMemberByUserId.mockResolvedValue({
      id: 'mem-1',
      userId: uId,
      role: 'admin',
    })

    mockFindCurrentWorkspace.mockResolvedValue({
      id: wsId,
      name: 'Sarah Craft',
      slug: 'sarah-craft',
      defaultCurrency: 'USD',
    })

    mockFindStorefrontByWorkspaceId.mockResolvedValue(null)
    mockCreateStorefront.mockResolvedValue({
      id: sfId,
      workspaceId: wsId,
      subdomain: 'sarah-craft',
      customDomain: null,
      customDomainStatus: null,
      customDomainVerificationToken: null,
      title: 'Sarah Craft',
      tagline: null,
      description: null,
      status: 'draft',
      themeConfig: {
        accentColor: '#4f46e5',
        fontPreset: 'sans',
        layoutPreset: 'showcase',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    mockListProducts.mockResolvedValue([])

    const result = await getStorefrontEditorDataAction(wsId)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.storefront.subdomain).toBe('sarah-craft')
      expect(result.data.canManage).toBe(true)
      expect(result.data.products).toHaveLength(0)
    }
  })
})
