/**
 * The buyer's download page and the download itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDownloadToken } from './download-token'

const WS = '018f9e2b-7c5e-7a2e-8c3b-000000000001'

const mockWithWorkspace = vi.fn((_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}))
vi.mock('./db', () => ({ getDatabase: () => ({ withWorkspace: mockWithWorkspace }) }))

const generateDownloadUrl = vi.fn()
vi.mock('./storage', () => ({ getStorageDriver: () => ({ generateDownloadUrl }) }))

const repo = {
  findDownloadGrantByTokenHash: vi.fn(),
  consumeDownloadGrant: vi.fn(),
}
vi.mock('@creatorhub/db', () => ({
  fulfillment: {
    findDownloadGrantByTokenHash: (...a: unknown[]) => repo.findDownloadGrantByTokenHash(...a) as unknown,
    consumeDownloadGrant: (...a: unknown[]) => repo.consumeDownloadGrant(...a) as unknown,
  },
  workspaces: { findCurrentWorkspace: () => Promise.resolve({ name: 'Priya Studio' }) },
  storefronts: { findStorefrontByWorkspaceId: () => Promise.resolve({ title: 'Priya Studio', status: 'published', subdomain: 'priya' }) },
  catalogue: { findProductById: () => Promise.resolve({ title: 'Golden Hour Presets', description: 'Twelve presets.' }) },
}))

import { consumeDownload, getFulfillmentDetails } from './fulfillment-actions'

const asset = {
  storageKey: 'ws/presets.zip',
  originalFilename: 'presets.zip',
  mimeType: 'application/zip',
  byteSize: 1024n,
  scanStatus: 'clean',
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    grant: { maxDownloads: 5, downloadCount: 1, expiresAt: new Date(Date.now() + 86_400_000), ...overrides },
    asset,
    entitlement: { productId: '018f9e2b-7c5e-7a2e-8c3b-000000000005', status: 'active' },
  }
}

describe('download page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a link that is not a download token, without touching the database', async () => {
    const result = await getFulfillmentDetails('not-a-token')
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_TOKEN' } })
    expect(mockWithWorkspace).not.toHaveBeenCalled()
  })

  it('opens the workspace named in the token and looks the grant up by hash', async () => {
    const { token, tokenHash } = createDownloadToken(WS)
    repo.findDownloadGrantByTokenHash.mockResolvedValue(grant())
    const result = await getFulfillmentDetails(token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toMatchObject({ productTitle: 'Golden Hour Presets', remainingDownloads: 4, canDownload: true })
    expect(repo.findDownloadGrantByTokenHash).toHaveBeenCalledWith(expect.anything(), tokenHash)
    expect((mockWithWorkspace.mock.calls[0]?.[0] as { workspaceId: string }).workspaceId).toBe(WS)
  })

  it('reports an expired or used-up link as not downloadable', async () => {
    const { token } = createDownloadToken(WS)
    repo.findDownloadGrantByTokenHash.mockResolvedValue(grant({ downloadCount: 5 }))
    const used = await getFulfillmentDetails(token)
    expect(used.ok && used.data.isExhausted && !used.data.canDownload).toBe(true)

    repo.findDownloadGrantByTokenHash.mockResolvedValue(grant({ expiresAt: new Date(Date.now() - 1000) }))
    const expired = await getFulfillmentDetails(token)
    expect(expired.ok && expired.data.isExpired && !expired.data.canDownload).toBe(true)
  })
})

describe('download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consumes one download and returns a short-lived storage URL', async () => {
    const { token } = createDownloadToken(WS)
    repo.findDownloadGrantByTokenHash.mockResolvedValue(grant())
    repo.consumeDownloadGrant.mockResolvedValue({ ok: true, asset })
    generateDownloadUrl.mockResolvedValue({ downloadUrl: 'https://storage.example/signed' })
    const result = await consumeDownload(token, { ipAddress: '203.0.113.9', userAgent: 'Chrome' })
    expect(result).toEqual({ ok: true, data: { downloadUrl: 'https://storage.example/signed', originalFilename: 'presets.zip' } })
    expect(generateDownloadUrl).toHaveBeenCalledWith(expect.objectContaining({ expiresInSeconds: 300 }))
    const consumeArgs = repo.consumeDownloadGrant.mock.calls[0]?.[1] as { ipHash: string }
    expect(consumeArgs.ipHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not burn a download while the file is still being scanned', async () => {
    const { token } = createDownloadToken(WS)
    repo.findDownloadGrantByTokenHash.mockResolvedValue({ ...grant(), asset: { ...asset, scanStatus: 'pending' } })
    const result = await consumeDownload(token)
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } })
    expect(repo.consumeDownloadGrant).not.toHaveBeenCalled()
  })

  it('passes on why a download was refused', async () => {
    const { token } = createDownloadToken(WS)
    repo.findDownloadGrantByTokenHash.mockResolvedValue(grant())
    repo.consumeDownloadGrant.mockResolvedValue({ ok: false, code: 'REVOKED', message: 'This order was refunded.' })
    const result = await consumeDownload(token)
    expect(result).toEqual({ ok: false, error: { code: 'REVOKED', message: 'This order was refunded.' } })
    expect(generateDownloadUrl).not.toHaveBeenCalled()
  })
})
