/**
 * Buyer-side digital fulfilment: the download page and the download itself.
 *
 * Responsibilities:
 * 1. Parse a download token, open its workspace, and find the grant by hash
 *    under both isolation layers.
 * 2. Report what the buyer can download and how many downloads remain.
 * 3. Atomically consume one download and hand back a short-lived storage URL.
 *
 * Not a server-action module: these run from server components and the
 * download route only. Consuming a download is a side effect that should never
 * be callable from an arbitrary client-side action.
 */
import { createHash } from 'node:crypto'
import { productId, requestId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import { catalogue, fulfillment, storefronts, workspaces } from '@creatorhub/db'
import { isAssetDeliverable } from '@creatorhub/storage'

import { getDatabase } from './db'
import { parseDownloadToken } from './download-token'
import { auditSalt, storefrontUrl } from './env'
import { getStorageDriver } from './storage'

export type FulfillmentDetails = {
  readonly token: string
  readonly productTitle: string
  readonly productDescription: string | null
  readonly workspaceName: string
  readonly storefrontUrl: string | null
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
  readonly isPendingScan: boolean
  readonly canDownload: boolean
}

export type FulfillmentDetailsResult =
  | { readonly ok: true; readonly data: FulfillmentDetails }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'NOT_FOUND' | 'INVALID_TOKEN' | 'ERROR'
        readonly message: string
      }
    }

export type ConsumeDownloadResult =
  | {
      readonly ok: true
      readonly data: { readonly downloadUrl: string; readonly originalFilename: string }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED' | 'UNAVAILABLE' | 'ERROR'
        readonly message: string
      }
    }

function contextFor(rawWorkspaceId: string, label: string) {
  return workspaceContext({
    workspaceId: workspaceId(rawWorkspaceId),
    requestId: requestId(`req-${label}-${Date.now().toString(36)}`),
  })
}

export async function getFulfillmentDetails(token: string): Promise<FulfillmentDetailsResult> {
  const parsed = parseDownloadToken(token)
  if (!parsed) {
    return {
      ok: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'This download link is not complete. Copy the whole link from your email.',
      },
    }
  }

  try {
    const context = contextFor(parsed.workspaceId, 'dl-view')
    return await getDatabase().withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const found = await fulfillment.findDownloadGrantByTokenHash(scope, parsed.tokenHash)
      if (!found) {
        return {
          ok: false as const,
          error: {
            code: 'NOT_FOUND' as const,
            message:
              'We could not find this download. The link may have been replaced by a newer one.',
          },
        }
      }

      const { grant, asset, entitlement } = found
      const ws = await workspaces.findCurrentWorkspace(scope)
      const store = await storefronts.findStorefrontByWorkspaceId(scope)
      const product = await catalogue.findProductById(scope, productId(entitlement.productId))

      const now = Date.now()
      const isExpired = grant.expiresAt.getTime() <= now
      const isRevoked = entitlement.status !== 'active'
      const isExhausted = grant.downloadCount >= grant.maxDownloads
      const isPendingScan = !isAssetDeliverable(asset)

      return {
        ok: true as const,
        data: {
          token: token.trim(),
          productTitle: product?.title ?? asset.originalFilename,
          productDescription: product?.description ?? null,
          workspaceName: store?.title ?? ws?.name ?? 'CreatorHub',
          storefrontUrl: store?.status === 'published' ? storefrontUrl(store.subdomain) : null,
          originalFilename: asset.originalFilename,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize.toString(),
          maxDownloads: grant.maxDownloads,
          downloadCount: grant.downloadCount,
          remainingDownloads: Math.max(0, grant.maxDownloads - grant.downloadCount),
          expiresAt: grant.expiresAt.toISOString(),
          isExpired,
          isRevoked,
          isExhausted,
          isPendingScan,
          canDownload: !isExpired && !isRevoked && !isExhausted && !isPendingScan,
        },
      }
    })
  } catch (error) {
    console.error('[fulfillment] details failed', error instanceof Error ? error.message : error)
    return {
      ok: false,
      error: {
        code: 'ERROR',
        message: 'Something went wrong loading this download. Try again in a moment.',
      },
    }
  }
}

export async function consumeDownload(
  token: string,
  client: { readonly ipAddress?: string | null; readonly userAgent?: string | null } = {},
): Promise<ConsumeDownloadResult> {
  const parsed = parseDownloadToken(token)
  if (!parsed) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'This download link is not valid.' } }
  }

  const ipHash = client.ipAddress
    ? createHash('sha256').update(`${client.ipAddress}:${auditSalt()}`).digest('hex')
    : null

  try {
    const context = contextFor(parsed.workspaceId, 'dl')
    const consumed = await getDatabase().withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      // Checked before consuming, so a file still being scanned does not burn a download.
      const peek = await fulfillment.findDownloadGrantByTokenHash(scope, parsed.tokenHash)
      if (peek && !isAssetDeliverable(peek.asset)) {
        return {
          ok: false as const,
          code: 'UNAVAILABLE' as const,
          message: 'This file is still being checked for safety. Try again in a few minutes.',
        }
      }
      return fulfillment.consumeDownloadGrant(scope, {
        tokenHash: parsed.tokenHash,
        ipHash,
        userAgent: client.userAgent?.slice(0, 512) ?? null,
      })
    })

    if (!consumed.ok) {
      return { ok: false, error: { code: consumed.code, message: consumed.message } }
    }

    const presigned = await getStorageDriver().generateDownloadUrl({
      key: consumed.asset.storageKey,
      filename: consumed.asset.originalFilename,
      expiresInSeconds: 300,
    })

    return {
      ok: true,
      data: {
        downloadUrl: presigned.downloadUrl,
        originalFilename: consumed.asset.originalFilename,
      },
    }
  } catch (error) {
    console.error('[fulfillment] download failed', error instanceof Error ? error.message : error)
    return {
      ok: false,
      error: { code: 'ERROR', message: 'The download could not start. Try again in a moment.' },
    }
  }
}
