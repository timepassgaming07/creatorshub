/**
 * Discount codes: amounts are parsed exactly, and only managers create them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const WS = '018f9e2b-7c5e-7a2e-8c3b-123456789abc'
const USER = '018f9e2b-7c5e-7a2e-8c3b-987654321def'

const mockAccess = vi.fn()
vi.mock('./workspace-access', () => ({
  getWorkspaceAccess: (...args: unknown[]) => mockAccess(...args) as unknown,
}))
vi.mock('./db', () => ({
  getDatabase: () => ({
    withWorkspace: (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}),
  }),
}))

const createDiscount = vi.fn()
vi.mock('@creatorhub/db', () => ({
  discounts: {
    createDiscount: (...a: unknown[]) => createDiscount(...a) as unknown,
    findDiscountById: vi.fn(),
    setDiscountActive: vi.fn(),
  },
  catalogue: { findProductById: vi.fn().mockResolvedValue({ id: 'p' }) },
  auditLog: { writeAuditLog: vi.fn().mockResolvedValue(undefined) },
}))

import { createDiscountAction } from './discount-actions'

function signedInAs(role: 'owner' | 'admin' | 'member') {
  mockAccess.mockResolvedValue({
    session: { userId: USER },
    access: {
      session: { userId: USER },
      role,
      workspace: { id: WS, name: 'S', slug: 's', currency: 'INR' },
      storefront: null,
    },
  })
}

const base = {
  code: 'launch20',
  type: 'percentage' as const,
  value: '12.5',
  maxUses: null,
  startsAt: null,
  expiresAt: null,
  minOrder: null,
  productIds: [],
}

describe('createDiscountAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createDiscount.mockImplementation((_scope: unknown, input: { code: string }) =>
      Promise.resolve({ id: '018f9e2b-7c5e-7a2e-8c3b-0000000000d1', code: input.code }),
    )
  })

  it('stores a percentage as basis points and upper-cases the code', async () => {
    signedInAs('admin')
    const result = await createDiscountAction(WS, base)
    expect(result).toEqual({ ok: true, data: { id: expect.any(String), code: 'LAUNCH20' } })
    expect(createDiscount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ discountType: 'percentage', discountValue: 1250n, currency: null }),
    )
  })

  it('stores a fixed amount in minor units of the workspace currency', async () => {
    signedInAs('owner')
    await createDiscountAction(WS, {
      ...base,
      type: 'fixed_amount',
      value: '199.99',
      minOrder: '499',
    })
    expect(createDiscount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ discountValue: 19999n, currency: 'INR', minOrderAmount: 49900n }),
    )
  })

  it('refuses more than 100 percent and a reversed date range', async () => {
    signedInAs('owner')
    expect((await createDiscountAction(WS, { ...base, value: '150' })).ok).toBe(false)
    expect(
      (
        await createDiscountAction(WS, {
          ...base,
          startsAt: '2026-11-02T00:00:00.000Z',
          expiresAt: '2026-11-01T00:00:00.000Z',
        })
      ).ok,
    ).toBe(false)
    expect(createDiscount).not.toHaveBeenCalled()
  })

  it('refuses a member', async () => {
    signedInAs('member')
    const result = await createDiscountAction(WS, base)
    expect(result.ok).toBe(false)
    expect(createDiscount).not.toHaveBeenCalled()
  })

  it('explains a code that already exists', async () => {
    signedInAs('owner')
    createDiscount.mockRejectedValue(Object.assign(new Error('dup'), { cause: { code: '23505' } }))
    const result = await createDiscountAction(WS, base)
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('already have a code called LAUNCH20'),
    })
  })
})
