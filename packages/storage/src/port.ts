/**
 * Storage Port interface (Implementation Plan §3.2).
 *
 * Responsibilities:
 * Abstract object storage interactions (S3, Cloudflare R2, MinIO, or in-memory)
 * behind a unified driver interface for presigned upload URLs, download delivery,
 * and asset inspection.
 *
 * Invariants:
 * 1. Byte sizes are non-negative bigints (never floating numbers).
 * 2. Upload URLs are presigned with content-type and size limits for direct client uploads.
 * 3. Download URLs carry Content-Disposition for controlled attachment downloads.
 */

export type StorageObjectMetadata = {
  readonly key: string
  readonly byteSize: bigint
  readonly contentType: string
  readonly etag: string
  readonly lastModified: Date
}

export type GenerateUploadUrlOptions = {
  readonly key: string
  readonly contentType: string
  readonly contentLength: bigint
  readonly expiresInSeconds?: number | undefined
}

export type PresignedUploadResult = {
  readonly uploadUrl: string
  readonly headers: Readonly<Record<string, string>>
  readonly storageKey: string
  readonly expiresAt: Date
}

export type GenerateDownloadUrlOptions = {
  readonly key: string
  readonly filename?: string | undefined
  readonly expiresInSeconds?: number | undefined
}

export type PresignedDownloadResult = {
  readonly downloadUrl: string
  readonly expiresAt: Date
}

export type PutObjectOptions = {
  readonly contentType: string
}

export type StorageDriver = {
  readonly name: string

  generateUploadUrl(options: GenerateUploadUrlOptions): Promise<PresignedUploadResult>

  generateDownloadUrl(options: GenerateDownloadUrlOptions): Promise<PresignedDownloadResult>

  headObject(key: string): Promise<StorageObjectMetadata | null>

  deleteObject(key: string): Promise<void>

  putObject(
    key: string,
    data: Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<StorageObjectMetadata>

  getObject(
    key: string,
  ): Promise<{ readonly data: Uint8Array; readonly metadata: StorageObjectMetadata } | null>
}
