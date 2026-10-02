/**
 * AI copilot actions: quota, usage accounting, and no model call inside a
 * database transaction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const WS = '018f9e2b-7c5e-7a2e-8c3b-123456789abc'
const USER = '018f9e2b-7c5e-7a2e-8c3b-987654321def'

const mockAccess = vi.fn()
vi.mock('./workspace-access', () => ({
  getWorkspaceAccess: (...args: unknown[]) => mockAccess(...args) as unknown,
}))

let openTransactions = 0
const mockWithWorkspace = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => {
  openTransactions += 1
  try {
    return await fn({})
  } finally {
    openTransactions -= 1
  }
})
vi.mock('./db', () => ({ getDatabase: () => ({ withWorkspace: mockWithWorkspace }) }))

const generateStructured = vi.fn()
vi.mock('./ai', () => ({
  getAiGateway: () => (process.env['AI_OFF'] === '1' ? null : { generateStructured }),
}))

const usage = { getMonthlyUsageSummary: vi.fn(), recordUsage: vi.fn() }
vi.mock('@creatorhub/db', () => ({
  aiUsageRepo: {
    getMonthlyUsageSummary: (...a: unknown[]) => usage.getMonthlyUsageSummary(...a) as unknown,
    recordUsage: (...a: unknown[]) => usage.recordUsage(...a) as unknown,
  },
  analytics: {},
  auditLog: { writeAuditLog: vi.fn().mockResolvedValue(undefined) },
}))

import { generateProductCopyAction } from './ai-actions'

const input = {
  title: 'Golden Hour Presets',
  productType: 'presets',
  audience: 'wedding photographers',
} as never

function signedIn() {
  mockAccess.mockResolvedValue({
    session: { userId: USER },
    access: {
      session: { userId: USER },
      role: 'owner',
      workspace: { id: WS, name: 'S', slug: 's', currency: 'INR' },
      storefront: null,
    },
  })
}

describe('AI actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openTransactions = 0
    usage.getMonthlyUsageSummary.mockResolvedValue({ isQuotaExceeded: false })
    usage.recordUsage.mockResolvedValue(undefined)
  })
  afterEach(() => {
    delete process.env['AI_OFF']
  })

  it('refuses a signed-out caller', async () => {
    mockAccess.mockResolvedValue({ session: null, access: null })
    const result = await generateProductCopyAction(WS, input)
    expect(result.ok).toBe(false)
    expect(generateStructured).not.toHaveBeenCalled()
  })

  it('calls the model outside any transaction and records usage after', async () => {
    signedIn()
    generateStructured.mockImplementation(() => {
      expect(openTransactions).toBe(0)
      return Promise.resolve({
        ok: true,
        value: {
          data: { headline: 'Warm light, every time' },
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          promptTokens: 900,
          completionTokens: 300,
          totalTokens: 1200,
          costMicroCents: 960_000n,
        },
      })
    })
    const result = await generateProductCopyAction(WS, input)
    expect(result).toEqual({ ok: true, data: { headline: 'Warm light, every time' } })
    expect(usage.recordUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        model: 'claude-opus-5-5',
        totalTokens: 1200,
        costMicroCents: 960_000n,
      }),
    )
  })

  it('stops at the monthly quota without calling the model', async () => {
    signedIn()
    usage.getMonthlyUsageSummary.mockResolvedValue({ isQuotaExceeded: true })
    const result = await generateProductCopyAction(WS, input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('QUOTA_EXCEEDED')
    expect(generateStructured).not.toHaveBeenCalled()
  })

  it('reports a model failure without recording usage', async () => {
    signedIn()
    generateStructured.mockResolvedValue({
      ok: false,
      error: { message: 'The AI service is busy right now.' },
    })
    const result = await generateProductCopyAction(WS, input)
    expect(result).toEqual({
      ok: false,
      error: { code: 'ERROR', message: 'The AI service is busy right now.' },
    })
    expect(usage.recordUsage).not.toHaveBeenCalled()
  })

  it('says so when the copilot is not configured', async () => {
    signedIn()
    process.env['AI_OFF'] = '1'
    const result = await generateProductCopyAction(WS, input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toContain('not switched on')
  })
})
