import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userId } from '@creatorhub/contracts'
import type { ServerSession } from './server-session'

const mockGetServerSession = vi.fn<() => Promise<ServerSession | null>>()

vi.mock('./server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

const mockWithWorkspace = vi.fn()
vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: mockWithWorkspace,
  }),
}))

vi.mock('./storage', () => ({
  getStorageDriver: () => ({
    getObject: vi.fn().mockResolvedValue({ data: Buffer.from('mock data') }),
  }),
  getStorageService: () => ({
    initiateUpload: vi.fn().mockResolvedValue({
      storageKey: 'workspaces/w1/assets/a1/file.pdf',
      uploadUrl: 'http://storage.local/upload',
      headers: {},
      expiresAt: new Date(),
    }),
    verifyUpload: vi.fn().mockResolvedValue({
      verified: true,
      detectedMimeType: 'application/pdf',
      byteSize: 1024n,
      etag: 'etag-1',
    }),
  }),
  getMalwareScanner: () => ({
    scanBuffer: vi.fn().mockResolvedValue({ clean: true }),
  }),
}))

import {
  completeAssetUploadAction,
  initiateAssetUploadAction,
  listWorkspaceAssetsAction,
} from './asset-actions'

describe('asset server actions - authentication and validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockReset()
  })

  it('rejects initiateAssetUploadAction when unauthenticated', async () => {
    const res = await initiateAssetUploadAction('018f1a2b-3c4d-7e8f-9012-3456789abcde', {
      filename: 'course.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects initiateAssetUploadAction on invalid workspace ID', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: userId('018f1a2b-3c4d-7e8f-9012-3456789abcdf'),
      user: { id: '018f1a2b-3c4d-7e8f-9012-3456789abcdf', email: 'ada@example.com' },
    })

    const res = await initiateAssetUploadAction('invalid-id', {
      filename: 'course.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(400)
      expect(res.error.code).toBe('INVALID_WORKSPACE_ID')
    }
  })

  it('rejects completeAssetUploadAction when unauthenticated', async () => {
    const res = await completeAssetUploadAction(
      '018f1a2b-3c4d-7e8f-9012-3456789abcde',
      '018f1a2b-3c4d-7e8f-9012-3456789abce1',
      1024,
      'application/pdf',
    )

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects listWorkspaceAssetsAction when unauthenticated', async () => {
    const res = await listWorkspaceAssetsAction('018f1a2b-3c4d-7e8f-9012-3456789abcde')

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })
})
