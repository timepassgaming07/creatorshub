/**
 * Asset upload lifecycle and verification service (Implementation Plan §3.3).
 *
 * Responsibilities:
 * Orchestrates presigned direct client uploads, deterministic storage path scoping,
 * and post-upload inspection (magic numbers + size validation).
 */
import type { AssetId, WorkspaceId } from '@creatorhub/contracts'

import { validateMimeType } from './inspection.js'
import type { StorageDriver } from './port.js'

export const MAX_ASSET_BYTE_SIZE = 5_368_709_120n // 5 GB

export type InitiateAssetUploadInput = {
  readonly workspaceId: WorkspaceId
  readonly assetId: AssetId
  readonly filename: string
  readonly mimeType: string
  readonly byteSize: bigint
}

export type InitiateAssetUploadResult = {
  readonly storageKey: string
  readonly uploadUrl: string
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: Date
}

export type VerifyUploadedAssetResult =
  | {
      readonly verified: true
      readonly detectedMimeType: string
      readonly byteSize: bigint
      readonly etag: string
    }
  | {
      readonly verified: false
      readonly reason: string
    }

function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)
}

export class AssetStorageService {
  constructor(private readonly driver: StorageDriver) {}

  async initiateUpload(input: InitiateAssetUploadInput): Promise<InitiateAssetUploadResult> {
    if (input.byteSize <= 0n) {
      throw new Error('Asset byte size must be greater than 0.')
    }

    if (input.byteSize > MAX_ASSET_BYTE_SIZE) {
      throw new Error(
        `Asset byte size exceeds maximum allowed size of ${MAX_ASSET_BYTE_SIZE.toString()} bytes (5 GB).`,
      )
    }

    const safeFilename = sanitizeFilename(input.filename)
    const storageKey = `workspaces/${input.workspaceId}/assets/${input.assetId}/${safeFilename}`

    const presigned = await this.driver.generateUploadUrl({
      key: storageKey,
      contentType: input.mimeType,
      contentLength: input.byteSize,
      expiresInSeconds: 900, // 15 minutes
    })

    return {
      storageKey,
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    }
  }

  async verifyUpload(
    storageKey: string,
    expectedByteSize: bigint,
    declaredMimeType: string,
  ): Promise<VerifyUploadedAssetResult> {
    // 1. Check object existence and size
    const head = await this.driver.headObject(storageKey)
    if (!head) {
      return {
        verified: false,
        reason: `Object not found at storage key '${storageKey}'.`,
      }
    }

    if (head.byteSize !== expectedByteSize) {
      return {
        verified: false,
        reason: `Uploaded object size (${head.byteSize.toString()} bytes) does not match expected size (${expectedByteSize.toString()} bytes).`,
      }
    }

    // 2. Read sample bytes to inspect binary magic numbers
    const sample = await this.driver.getObject(storageKey)
    if (!sample) {
      return {
        verified: false,
        reason: `Could not read object payload at '${storageKey}' for inspection.`,
      }
    }

    const inspection = validateMimeType(sample.data, declaredMimeType)
    if (!inspection.valid) {
      return {
        verified: false,
        reason: inspection.reason ?? 'MIME type signature inspection failed.',
      }
    }

    return {
      verified: true,
      detectedMimeType: inspection.detectedMimeType ?? declaredMimeType,
      byteSize: head.byteSize,
      etag: head.etag,
    }
  }
}
