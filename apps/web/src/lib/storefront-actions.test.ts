/**
 * Storefront server actions unit tests (Item 4.2).
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
const mockWithSystemScope = vi.fn<(_fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()

vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
    withSystemScope: mockWithSystemScope,
    resolveStorefrontByHostname: vi.fn().mockResolvedValue(null),
    schema: {
      storefronts: {
        subdomain: 'subdomain',
        customDomain: 'custom_domain',
      },
      sql: (strings: TemplateStringsArray, ...args: unknown[]) => ({ strings, args }),
    },
  }),
}))

const mockFindMemberByUserId = vi.fn()
const mockFindStorefrontByWorkspaceId = vi.fn()
const mockCreateStorefront = vi.fn()
const mockUpdateStorefront = vi.fn()
const mockWriteAuditLog = vi.fn()
const mockFindCurrentWorkspace = vi.fn()

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
    updateStorefront: (...args: unknown[]) => mockUpdateStorefront(...args) as unknown,
  },
  auditLog: {
    writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args) as unknown,
  },
  catalogue: {
    listProducts: vi.fn().mockResolvedValue([]),
  },
}))

import {
  getStorefrontForWorkspaceAction,
  publishStorefrontAction,
  saveStorefrontAction,
} from './storefront-actions'

describe('Storefront Server Actions', () => {
  const validWorkspaceId = '018f9e2b-7c5e-7a2e-8c3b-123456789abc'
  const validUserId = userId('018f9e2b-7c5e-7a2e-8c3b-987654321def')

  beforeEach(() => {
    mockGetServerSession.mockReset()
    mockWithWorkspace.mockReset()
    mockWithSystemScope.mockReset()
    mockFindMemberByUserId.mockReset()
    mockFindStorefrontByWorkspaceId.mockReset()
    mockCreateStorefront.mockReset()
    mockUpdateStorefront.mockReset()
    mockWriteAuditLog.mockReset()
    mockFindCurrentWorkspace.mockReset()
  })

  it('rejects getStorefrontForWorkspaceAction when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await getStorefrontForWorkspaceAction(validWorkspaceId)
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/unauthorized/i)
    }
  })

  it('rejects saveStorefrontAction when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await saveStorefrontAction(validWorkspaceId, {
      title: 'Updated Store',
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error).toMatch(/unauthorized/i)
    }
  })

  it('rejects saveStorefrontAction with invalid inputs', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: validUserId,
      user: { id: validUserId, email: 'test@example.com' },
    })

    const res = await saveStorefrontAction(validWorkspaceId, {
      title: '', // Title cannot be empty
    })
    expect(res.success).toBe(false)
  })

  it('handles successful storefront fetch', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: validUserId,
      user: { id: validUserId, email: 'test@example.com' },
    })

    const mockStorefront = {
      id: '018f9e2b-7c5e-7a2e-8c3b-111111111111',
      workspaceId: validWorkspaceId,
      subdomain: 'my-store',
      customDomain: null,
      customDomainStatus: 'pending' as const,
      customDomainVerificationToken: null,
      customDomainVerifiedAt: null,
      title: 'My Store',
      tagline: null,
      description: null,
      themeConfig: {
        accentColor: '#4f46e5',
        fontPreset: 'sans' as const,
        layoutPreset: 'showcase' as const,
      },
      status: 'draft' as const,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockWithWorkspace.mockImplementation(async (_context, fn) => {
      mockFindMemberByUserId.mockResolvedValue({ role: 'owner' })
      mockFindStorefrontByWorkspaceId.mockResolvedValue(mockStorefront)
      const res = await fn({})
      return res
    })

    const res = await getStorefrontForWorkspaceAction(validWorkspaceId)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.title).toBe('My Store')
    }
  })

  it('rejects publishStorefrontAction when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const res = await publishStorefrontAction(validWorkspaceId)
    expect(res.success).toBe(false)
  })
})
