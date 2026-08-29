import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currency, userId } from '@creatorhub/contracts'
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

import {
  createProductAction,
  createVariantAction,
  getProductDetailDataAction,
  getProductListDataAction,
  publishProductAction,
  updateProductAction,
} from './catalogue-actions'

describe('catalogue server actions - authentication and validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(null)
    mockWithWorkspace.mockReset()
  })

  it('rejects createProductAction when unauthenticated', async () => {
    const res = await createProductAction('018f1a2b-3c4d-7e8f-9012-3456789abcde', {
      title: 'Course 1',
      slug: 'course-1',
      currency: currency('INR'),
      basePrice: 50000n,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects createProductAction on invalid workspace ID', async () => {
    mockGetServerSession.mockResolvedValue({
      userId: userId('018f1a2b-3c4d-7e8f-9012-3456789abcdf'),
      user: { id: '018f1a2b-3c4d-7e8f-9012-3456789abcdf', email: 'ada@example.com' },
    })

    const res = await createProductAction('not-a-uuid', {
      title: 'Course 1',
      slug: 'course-1',
      currency: currency('INR'),
      basePrice: 50000n,
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(400)
      expect(res.error.code).toBe('INVALID_WORKSPACE_ID')
    }
  })

  it('rejects getProductListDataAction when unauthenticated', async () => {
    const res = await getProductListDataAction('018f1a2b-3c4d-7e8f-9012-3456789abcde')

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects getProductDetailDataAction when unauthenticated', async () => {
    const res = await getProductDetailDataAction(
      '018f1a2b-3c4d-7e8f-9012-3456789abcde',
      '018f1a2b-3c4d-7e8f-9012-3456789abce1',
    )

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects updateProductAction when unauthenticated', async () => {
    const res = await updateProductAction(
      '018f1a2b-3c4d-7e8f-9012-3456789abcde',
      '018f1a2b-3c4d-7e8f-9012-3456789abce1',
      { title: 'Updated Title' },
    )

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects createVariantAction when unauthenticated', async () => {
    const res = await createVariantAction(
      '018f1a2b-3c4d-7e8f-9012-3456789abcde',
      '018f1a2b-3c4d-7e8f-9012-3456789abce1',
      { title: 'Deluxe' },
    )

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('rejects publishProductAction when unauthenticated', async () => {
    const res = await publishProductAction(
      '018f1a2b-3c4d-7e8f-9012-3456789abcde',
      '018f1a2b-3c4d-7e8f-9012-3456789abce1',
    )

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('UNAUTHENTICATED')
    }
  })
})
