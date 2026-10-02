/**
 * Local-disk storage driver with signed upload and download URLs.
 *
 * Responsibilities:
 * - Store objects under a root directory, one file per object plus a JSON
 *   sidecar for its content type.
 * - Issue time-limited, HMAC-signed URLs that the web app's storage route
 *   verifies before accepting bytes or serving them.
 *
 * Why it exists: the memory driver returned `memory://` URLs, which a browser
 * cannot PUT to, so uploads could never work without S3. This driver gives
 * local development and a single-server deployment the same presigned flow as
 * S3: the browser uploads directly to a URL it was handed, and nothing else.
 *
 * It is not for a multi-instance deployment, where each instance would see a
 * different disk. Use S3 or R2 there.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import type {
  GenerateDownloadUrlOptions,
  GenerateUploadUrlOptions,
  PresignedDownloadResult,
  PresignedUploadResult,
  PutObjectOptions,
  StorageDriver,
  StorageObjectMetadata,
} from '../port.js'

export type LocalStorageOptions = {
  /** Directory objects are written under. Created on first write. */
  readonly rootDir: string
  /** The app's public origin, e.g. https://app.creatorhub.online. */
  readonly baseUrl: string
  /** At least 32 characters. Signs every URL this driver issues. */
  readonly signingSecret: string
  /** Path the web app serves the storage route on. */
  readonly routePath?: string | undefined
}

export type SignedStorageRequest = {
  readonly op: 'put' | 'get'
  readonly key: string
  readonly expires: number
  /** For uploads: the exact content type and length the URL was issued for. */
  readonly contentType?: string | undefined
  readonly contentLength?: string | undefined
  /** For downloads: the filename to suggest in Content-Disposition. */
  readonly filename?: string | undefined
  readonly signature: string
}

type Sidecar = { readonly contentType: string; readonly lastModified: string }

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/

export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key.slice(0, 80))}`)
    this.name = 'InvalidStorageKeyError'
  }
}

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local'

  private readonly rootDir: string
  private readonly baseUrl: string
  private readonly secret: string
  private readonly routePath: string

  constructor(options: LocalStorageOptions) {
    if (options.signingSecret.length < 32) {
      throw new Error('LocalStorageDriver needs a signing secret of at least 32 characters.')
    }
    this.rootDir = resolve(options.rootDir)
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.secret = options.signingSecret
    this.routePath = options.routePath ?? '/api/storage'
  }

  // -------------------------------------------------------------------------
  // Signing
  // -------------------------------------------------------------------------

  private sign(request: Omit<SignedStorageRequest, 'signature'>): string {
    // Every field that changes what the URL permits is in the signed string,
    // so a holder cannot widen an upload's size or swap the key.
    const canonical = [
      request.op,
      request.key,
      String(request.expires),
      request.contentType ?? '',
      request.contentLength ?? '',
      request.filename ?? '',
    ].join('\n')
    return createHmac('sha256', this.secret).update(canonical).digest('hex')
  }

  /**
   * Verify a request the storage route received. Returns false for an expired
   * URL, a tampered field, or a key that could escape the root directory.
   */
  verify(request: SignedStorageRequest, now: Date = new Date()): boolean {
    if (!this.isValidKey(request.key)) return false
    if (!Number.isFinite(request.expires) || request.expires * 1000 < now.getTime()) return false
    const expected = Buffer.from(this.sign(request))
    const received = Buffer.from(request.signature)
    return expected.length === received.length && timingSafeEqual(expected, received)
  }

  private url(params: Record<string, string>): string {
    return `${this.baseUrl}${this.routePath}?${new URLSearchParams(params).toString()}`
  }

  // -------------------------------------------------------------------------
  // StorageDriver
  // -------------------------------------------------------------------------

  generateUploadUrl(options: GenerateUploadUrlOptions): Promise<PresignedUploadResult> {
    if (!this.isValidKey(options.key))
      return Promise.reject(new InvalidStorageKeyError(options.key))
    const ttl = options.expiresInSeconds ?? 900
    const expires = Math.floor(Date.now() / 1000) + ttl
    const request = {
      op: 'put' as const,
      key: options.key,
      expires,
      contentType: options.contentType,
      contentLength: options.contentLength.toString(),
    }

    return Promise.resolve({
      uploadUrl: this.url({
        op: 'put',
        key: options.key,
        expires: String(expires),
        ct: options.contentType,
        len: request.contentLength,
        sig: this.sign(request),
      }),
      headers: { 'content-type': options.contentType },
      storageKey: options.key,
      expiresAt: new Date(expires * 1000),
    })
  }

  generateDownloadUrl(options: GenerateDownloadUrlOptions): Promise<PresignedDownloadResult> {
    if (!this.isValidKey(options.key))
      return Promise.reject(new InvalidStorageKeyError(options.key))
    const ttl = options.expiresInSeconds ?? 300
    const expires = Math.floor(Date.now() / 1000) + ttl
    const request = {
      op: 'get' as const,
      key: options.key,
      expires,
      filename: options.filename,
    }

    return Promise.resolve({
      downloadUrl: this.url({
        op: 'get',
        key: options.key,
        expires: String(expires),
        ...(options.filename ? { fn: options.filename } : {}),
        sig: this.sign(request),
      }),
      expiresAt: new Date(expires * 1000),
    })
  }

  async headObject(key: string): Promise<StorageObjectMetadata | null> {
    const path = this.pathFor(key)
    try {
      const [info, sidecarRaw] = await Promise.all([
        stat(path),
        readFile(`${path}.meta.json`, 'utf8'),
      ])
      const sidecar = JSON.parse(sidecarRaw) as Sidecar
      return {
        key,
        byteSize: BigInt(info.size),
        contentType: sidecar.contentType,
        etag: `${info.size.toString(16)}-${info.mtimeMs.toString(16)}`,
        lastModified: new Date(sidecar.lastModified),
      }
    } catch {
      return null
    }
  }

  async deleteObject(key: string): Promise<void> {
    const path = this.pathFor(key)
    await rm(path, { force: true })
    await rm(`${path}.meta.json`, { force: true })
  }

  async putObject(
    key: string,
    data: Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<StorageObjectMetadata> {
    const path = this.pathFor(key)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const lastModified = new Date()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
    const sidecar: Sidecar = {
      contentType: options.contentType,
      lastModified: lastModified.toISOString(),
    }
    await writeFile(`${path}.meta.json`, JSON.stringify(sidecar))

    return {
      key,
      byteSize: BigInt(bytes.byteLength),
      contentType: options.contentType,
      etag: createHash('sha256').update(bytes).digest('hex'),
      lastModified,
    }
  }

  async getObject(
    key: string,
  ): Promise<{ readonly data: Uint8Array; readonly metadata: StorageObjectMetadata } | null> {
    const metadata = await this.headObject(key)
    if (!metadata) return null
    const data = await readFile(this.pathFor(key))
    return { data: new Uint8Array(data), metadata }
  }

  // -------------------------------------------------------------------------
  // Paths
  // -------------------------------------------------------------------------

  private isValidKey(key: string): boolean {
    return KEY_PATTERN.test(key) && !key.includes('..')
  }

  /** Resolve a key under the root, refusing anything that would leave it. */
  private pathFor(key: string): string {
    if (!this.isValidKey(key)) throw new InvalidStorageKeyError(key)
    const path = resolve(join(this.rootDir, key))
    if (!path.startsWith(this.rootDir + sep)) {
      throw new InvalidStorageKeyError(key)
    }
    return path
  }
}
