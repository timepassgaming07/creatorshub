/**
 * Server Actions for Digital Fulfillment & Asset Downloads (Slice 6).
 *
 * Responsibilities:
 * 1. Resolve download grant by SHA-256 token hash and establish tenant-scoped context.
 * 2. Validate entitlement state (active), expiration date, and download use caps.
 * 3. Atomically consume a download credit, record the download audit event, and return the secure delivery stream or presigned URL.
 */
'use server'

import { createHash } from 'node:crypto'
import {
  orderId,
  productId,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import {
  catalogue,
  fulfillment,
  orders,
  workspaces,
  type ConsumeGrantResult,
} from '@creatorhub/db'

import { getDatabase } from './db'
import { getStorageDriver } from './storage'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'

export type FulfillmentDetailsResult =
  | {
      readonly ok: true
      readonly data: {
        readonly token: string
        readonly productTitle: string
        readonly workspaceName: string
        readonly originalFilename: string
        readonly mimeType: string
        readonly byteSize: string
        readonly maxDownloads: number
        readonly downloadCount: number
        readonly remainingDownloads: number
        readonly expiresAt: string
        readonly isExpired: boolean
        readonly isRevoked: boolean
        readonly isExhausted: boolean
        readonly canDownload: boolean
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'NOT_FOUND' | 'INVALID_TOKEN' | 'ERROR'
        readonly message: string
      }
    }

export type InitiateDownloadResult =
  | {
      readonly ok: true
      readonly data: {
        readonly downloadUrl?: string | undefined
        readonly originalFilename: string
        readonly mimeType: string
        readonly byteSize: string
        readonly storageKey: string
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED' | 'ERROR'
        readonly message: string
      }
    }

/**
 * Retrieves public download portal details for a given raw download token.
 */
export async function getFulfillmentDetailsAction(
  token: string,
): Promise<FulfillmentDetailsResult> {
  try {
    if (!token || token.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'INVALID_TOKEN', message: 'Download token is required.' },
      }
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex')
    const db = getDatabase()
    const resolved = await db.resolveDownloadGrantByTokenHash(tokenHash)

    if (!resolved) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'This download link does not exist or has expired.',
        },
      }
    }

    const context = workspaceContext({
      workspaceId: resolved.workspaceId,
      actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
      requestId: requestId(`req-view-${resolved.id.slice(0, 8)}`),
    })

    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const grantDetails = await fulfillment.findDownloadGrantByTokenHash(scope, tokenHash)

      if (!grantDetails) {
        return {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Download link details could not be found.',
          },
        }
      }

      const { grant, asset, entitlement } = grantDetails
      const ws = await workspaces.findCurrentWorkspace(scope)
      const prod = await catalogue.findProductById(scope, productId(entitlement.productId))

      const now = new Date()
      const isExpired = grant.expiresAt.getTime() <= now.getTime()
      const isRevoked = entitlement.status !== 'active'
      const isExhausted = grant.downloadCount >= grant.maxDownloads
      const remainingDownloads = Math.max(0, grant.maxDownloads - grant.downloadCount)
      const canDownload = !isExpired && !isRevoked && !isExhausted

      return {
        ok: true,
        data: {
          token: token.trim(),
          productTitle: prod?.title ?? asset.originalFilename,
          workspaceName: ws?.name ?? 'CreatorHub',
          originalFilename: asset.originalFilename,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize.toString(),
          maxDownloads: grant.maxDownloads,
          downloadCount: grant.downloadCount,
          remainingDownloads,
          expiresAt: grant.expiresAt.toISOString(),
          isExpired,
          isRevoked,
          isExhausted,
          canDownload,
        },
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve download details'
    return {
      ok: false,
      error: { code: 'ERROR', message },
    }
  }
}

/**
 * Atomically consumes a download grant and provides the asset storage delivery target.
 */
export async function consumeDownloadAction(
  token: string,
  options: {
    readonly ipAddress?: string | null | undefined
    readonly userAgent?: string | null | undefined
  } = {},
): Promise<InitiateDownloadResult> {
  try {
    if (!token || token.trim().length === 0) {
      return {
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Download token is required.' },
      }
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex')
    const db = getDatabase()
    const resolved = await db.resolveDownloadGrantByTokenHash(tokenHash)

    if (!resolved) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Download link is invalid or does not exist.',
        },
      }
    }

    const ipHash = options.ipAddress
      ? createHash('sha256')
          .update(options.ipAddress + AUDIT_SALT)
          .digest('hex')
      : null

    const context = workspaceContext({
      workspaceId: resolved.workspaceId,
      actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
      requestId: requestId(`req-dl-${resolved.id.slice(0, 8)}`),
    })

    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      const consumeResult: ConsumeGrantResult = await fulfillment.consumeDownloadGrant(scope, {
        tokenHash,
        ipHash,
        userAgent: options.userAgent ?? null,
      })

      if (!consumeResult.ok) {
        return {
          ok: false,
          error: {
            code: consumeResult.code,
            message: consumeResult.message,
          },
        }
      }

      const { asset } = consumeResult
      const storageDriver = getStorageDriver()

      // Generate presigned download URL if supported by storage driver (e.g. S3 / R2)
      let downloadUrl: string | undefined = undefined
      try {
        const presigned = await storageDriver.generateDownloadUrl({
          key: asset.storageKey,
          expiresInSeconds: 300, // 5 minutes presigned URL
          filename: asset.originalFilename,
        })
        downloadUrl = presigned.downloadUrl
      } catch {
        // Driver might be MemoryStorageDriver or local buffer driver
      }

      return {
        ok: true,
        data: {
          downloadUrl,
          originalFilename: asset.originalFilename,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize.toString(),
          storageKey: asset.storageKey,
        },
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed'
    return {
      ok: false,
      error: { code: 'ERROR', message },
    }
  }
}
