/**
 * Fulfillment Actions Unit Test Suite (Slice 6 §6.4 & §6.7).
 */
import { createHash } from 'node:crypto'
import {
  assetId,
  downloadGrantId,
  entitlementId,
  productId,
  workspaceId,
} from '@creatorhub/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  consumeDownloadAction,
  getFulfillmentDetailsAction,
} from './fulfillment-actions'

const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
const entId = entitlementId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
const assId = assetId('018f9e2b-7c5e-7a2e-8c3b-000000000003')
const grtId = downloadGrantId('018f9e2b-7c5e-7a2e-8c3b-000000000004')
const prodId = productId('018f9e2b-7c5e-7a2e-8c3b-000000000005')

const rawToken = 'test-token-123456789'
const tokenHash = createHash('sha256').update(rawToken).digest('hex')

const mockGrant = {
  id: grtId,
  workspaceId: wsId,
  entitlementId: entId,
  assetId: assId,
  tokenHash,
  maxDownloads: 5,
  downloadCount: 1,
  expiresAt: new Date(Date.now() + 86400000 * 7),
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockAsset = {
  id: assId,
  workspaceId: wsId,
  storageKey: 'assets/ws1/guide.pdf',
  originalFilename: 'guide.pdf',
  mimeType: 'application/pdf',
  byteSize: 1048576n,
  checksumSha256: 'hash-guide',
  scanStatus: 'clean' as const,
  scanReason: null,
  scannedAt: new Date(),
  createdAt: new Date(),
}

const mockEntitlement = {
  id: entId,
  workspaceId: wsId,
  orderId: '018f9e2b-7c5e-7a2e-8c3b-000000000010',
  productId: prodId,
  customerEmail: 'buyer@example.com',
  status: 'active' as const,
  grantedAt: new Date(),
  revokedAt: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockDb = {
  resolveDownloadGrantByTokenHash: vi.fn(),
  withWorkspace: vi.fn(),
}

vi.mock('./db', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('@creatorhub/db', () => ({
  workspaces: {
    findCurrentWorkspace: vi.fn().mockResolvedValue({ id: '018f9e2b-7c5e-7a2e-8c3b-000000000001', name: 'Design Studio' }),
  },
  catalogue: {
    findProductById: vi.fn().mockResolvedValue({ id: '018f9e2b-7c5e-7a2e-8c3b-000000000005', title: 'Pro Figma Kit' }),
  },
  fulfillment: {
    findDownloadGrantByTokenHash: vi.fn(),
    consumeDownloadGrant: vi.fn(),
  },
}))

describe('getFulfillmentDetailsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid fulfillment details when grant is active', async () => {
    mockDb.resolveDownloadGrantByTokenHash.mockResolvedValue({
      id: grtId,
      workspaceId: wsId,
      entitlementId: entId,
      assetId: assId,
      tokenHash,
      maxDownloads: 5,
      downloadCount: 1,
      expiresAt: mockGrant.expiresAt,
    })

    mockDb.withWorkspace.mockImplementation((_context, work) =>
      work({} as never),
    )

    const dbModule = await import('@creatorhub/db')
    vi.spyOn(dbModule.fulfillment, 'findDownloadGrantByTokenHash').mockResolvedValue({
      grant: mockGrant,
      asset: mockAsset,
      entitlement: mockEntitlement,
    })

    const result = await getFulfillmentDetailsAction(rawToken)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.productTitle).toBe('Pro Figma Kit')
      expect(result.data.workspaceName).toBe('Design Studio')
      expect(result.data.originalFilename).toBe('guide.pdf')
      expect(result.data.remainingDownloads).toBe(4)
      expect(result.data.canDownload).toBe(true)
      expect(result.data.isExpired).toBe(false)
      expect(result.data.isRevoked).toBe(false)
    }
  })

  it('rejects empty or missing tokens', async () => {
    const result = await getFulfillmentDetailsAction('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_TOKEN')
    }
  })

  it('returns not found when token does not match any grant', async () => {
    mockDb.resolveDownloadGrantByTokenHash.mockResolvedValue(null)

    const result = await getFulfillmentDetailsAction('unknown-token')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
    }
  })
})

describe('consumeDownloadAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consumes download grant and returns asset storage metadata', async () => {
    mockDb.resolveDownloadGrantByTokenHash.mockResolvedValue({
      id: grtId,
      workspaceId: wsId,
      entitlementId: entId,
      assetId: assId,
      tokenHash,
      maxDownloads: 5,
      downloadCount: 1,
      expiresAt: mockGrant.expiresAt,
    })

    mockDb.withWorkspace.mockImplementation((_context, work) =>
      work({} as never),
    )

    const dbModule = await import('@creatorhub/db')
    vi.spyOn(dbModule.fulfillment, 'consumeDownloadGrant').mockResolvedValue({
      ok: true,
      grant: { ...mockGrant, downloadCount: 2 },
      asset: mockAsset,
      entitlement: mockEntitlement,
    })

    const result = await consumeDownloadAction(rawToken, {
      ipAddress: '203.0.113.195',
      userAgent: 'Mozilla/5.0 TestBrowser',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.originalFilename).toBe('guide.pdf')
      expect(result.data.storageKey).toBe('assets/ws1/guide.pdf')
      expect(result.data.mimeType).toBe('application/pdf')
    }
  })

  it('returns revoked error when parent entitlement is revoked', async () => {
    mockDb.resolveDownloadGrantByTokenHash.mockResolvedValue({
      id: grtId,
      workspaceId: wsId,
      entitlementId: entId,
      assetId: assId,
      tokenHash,
      maxDownloads: 5,
      downloadCount: 1,
      expiresAt: mockGrant.expiresAt,
    })

    mockDb.withWorkspace.mockImplementation((_context, work) =>
      work({} as never),
    )

    const dbModule = await import('@creatorhub/db')
    vi.spyOn(dbModule.fulfillment, 'consumeDownloadGrant').mockResolvedValue({
      ok: false,
      code: 'REVOKED',
      message: 'Access to this file has been revoked due to a refund or dispute.',
    })

    const result = await consumeDownloadAction(rawToken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('REVOKED')
      expect(result.error.message).toContain('revoked')
    }
  })
})
