import { describe, expect, it } from 'vitest'
import {
  createDownloadGrantInputSchema,
  createEntitlementInputSchema,
  downloadEventId,
  downloadGrantId,
  downloadGrantRecordSchema,
  entitlementId,
  entitlementRecordSchema,
  orderId,
  productId,
  workspaceId,
  assetId,
} from './index.js'

describe('fulfillment contracts', () => {
  const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const ordId = orderId('018f9e2b-7c5e-7a2e-8c3b-000000000002')
  const prodId = productId('018f9e2b-7c5e-7a2e-8c3b-000000000003')
  const asstId = assetId('018f9e2b-7c5e-7a2e-8c3b-000000000004')
  const entId = entitlementId('018f9e2b-7c5e-7a2e-8c3b-000000000005')
  const grantId = downloadGrantId('018f9e2b-7c5e-7a2e-8c3b-000000000006')
  const evtId = downloadEventId('018f9e2b-7c5e-7a2e-8c3b-000000000007')

  it('validates create entitlement input correctly', () => {
    const valid = createEntitlementInputSchema.safeParse({
      workspaceId: wsId,
      orderId: ordId,
      productId: prodId,
      customerEmail: 'buyer@example.com',
      status: 'active',
    })

    expect(valid.success).toBe(true)

    const invalidEmail = createEntitlementInputSchema.safeParse({
      workspaceId: wsId,
      orderId: ordId,
      productId: prodId,
      customerEmail: 'not-an-email',
    })

    expect(invalidEmail.success).toBe(false)
  })

  it('validates entitlement record schema', () => {
    const parsed = entitlementRecordSchema.safeParse({
      id: entId,
      workspaceId: wsId,
      orderId: ordId,
      productId: prodId,
      customerEmail: 'buyer@example.com',
      status: 'active',
      grantedAt: new Date(),
      metadata: { source: 'checkout' },
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(parsed.success).toBe(true)
  })

  it('validates download grant input and record schemas with SHA-256 hash', () => {
    const tokenHash = 'a'.repeat(64)
    const valid = createDownloadGrantInputSchema.safeParse({
      workspaceId: wsId,
      entitlementId: entId,
      assetId: asstId,
      tokenHash,
      maxDownloads: 5,
      expiresAt: new Date(Date.now() + 86400000),
    })

    expect(valid.success).toBe(true)

    const invalidHash = createDownloadGrantInputSchema.safeParse({
      workspaceId: wsId,
      entitlementId: entId,
      assetId: asstId,
      tokenHash: 'short-hash',
      expiresAt: new Date(),
    })

    expect(invalidHash.success).toBe(false)

    const parsedRecord = downloadGrantRecordSchema.safeParse({
      id: grantId,
      workspaceId: wsId,
      entitlementId: entId,
      assetId: asstId,
      tokenHash,
      maxDownloads: 5,
      downloadCount: 1,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    expect(parsedRecord.success).toBe(true)
  })
})
