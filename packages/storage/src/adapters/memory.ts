/**
 * In-memory storage driver for local testing and development (Implementation Plan §3.2).
 *
 * Responsibilities:
 * Fast, deterministic, zero-dependency storage driver maintaining an in-memory object map.
 */
import { createHash } from 'node:crypto'

import type {
  GenerateDownloadUrlOptions,
  GenerateUploadUrlOptions,
  PresignedDownloadResult,
  PresignedUploadResult,
  PutObjectOptions,
  StorageDriver,
  StorageObjectMetadata,
} from '../port.js'

type StoredEntry = {
  readonly data: Uint8Array
  readonly metadata: StorageObjectMetadata
}

export class MemoryStorageDriver implements StorageDriver {
  readonly name = 'memory'
  private readonly store = new Map<string, StoredEntry>()

  generateUploadUrl(options: GenerateUploadUrlOptions): Promise<PresignedUploadResult> {
    const ttl = options.expiresInSeconds ?? 900
    const expiresAt = new Date(Date.now() + ttl * 1000)

    return Promise.resolve({
      uploadUrl: `memory://upload/${encodeURIComponent(options.key)}?expires=${expiresAt.toISOString()}`,
      headers: {
        'content-type': options.contentType,
        'content-length': options.contentLength.toString(),
      },
      storageKey: options.key,
      expiresAt,
    })
  }

  generateDownloadUrl(options: GenerateDownloadUrlOptions): Promise<PresignedDownloadResult> {
    const ttl = options.expiresInSeconds ?? 3600
    const expiresAt = new Date(Date.now() + ttl * 1000)
    const filenameParam = options.filename
      ? `&filename=${encodeURIComponent(options.filename)}`
      : ''

    return Promise.resolve({
      downloadUrl: `memory://download/${encodeURIComponent(options.key)}?expires=${expiresAt.toISOString()}${filenameParam}`,
      expiresAt,
    })
  }

  headObject(key: string): Promise<StorageObjectMetadata | null> {
    const entry = this.store.get(key)
    return Promise.resolve(entry ? entry.metadata : null)
  }

  deleteObject(key: string): Promise<void> {
    this.store.delete(key)
    return Promise.resolve()
  }

  putObject(
    key: string,
    data: Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<StorageObjectMetadata> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const etag = createHash('sha256').update(bytes).digest('hex')
    const now = new Date()

    const metadata: StorageObjectMetadata = {
      key,
      byteSize: BigInt(bytes.byteLength),
      contentType: options.contentType,
      etag,
      lastModified: now,
    }

    this.store.set(key, { data: bytes, metadata })
    return Promise.resolve(metadata)
  }

  getObject(
    key: string,
  ): Promise<{ readonly data: Uint8Array; readonly metadata: StorageObjectMetadata } | null> {
    const entry = this.store.get(key)
    if (!entry) return Promise.resolve(null)

    return Promise.resolve({
      data: entry.data,
      metadata: entry.metadata,
    })
  }

  /** Test helper to clear memory store */
  clear(): void {
    this.store.clear()
  }
}
