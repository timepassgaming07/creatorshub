/**
 * Asset deliverability guard (Implementation Plan §3.4).
 *
 * Responsibilities:
 * Enforce that an asset cannot be delivered to customers, included in published products,
 * or downloaded until its scan status is strictly 'clean'.
 */
import type { AssetScanStatus } from '@creatorhub/contracts'

export class AssetNotDeliverableError extends Error {
  constructor(
    readonly assetId: string,
    readonly status: AssetScanStatus,
    readonly reason?: string | null | undefined,
  ) {
    super(
      `Asset '${assetId}' is not deliverable: scan status is '${status}'${
        reason ? ` (${reason})` : ''
      }.`,
    )
    this.name = 'AssetNotDeliverableError'
  }
}

/**
 * Returns true if and only if the asset has been scanned and verified clean.
 */
export function isAssetDeliverable(asset: { readonly scanStatus: AssetScanStatus }): boolean {
  return asset.scanStatus === 'clean'
}

/**
 * Throws AssetNotDeliverableError if the asset is not clean.
 */
export function assertAssetDeliverable(asset: {
  readonly id: string
  readonly scanStatus: AssetScanStatus
  readonly scanReason?: string | null | undefined
}): void {
  if (!isAssetDeliverable(asset)) {
    throw new AssetNotDeliverableError(asset.id, asset.scanStatus, asset.scanReason)
  }
}
