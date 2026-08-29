/**
 * S3 and Cloudflare R2 storage driver (Implementation Plan §3.2).
 *
 * Responsibilities:
 * Computes standard AWS Signature Version 4 (SigV4) presigned upload and download URLs
 * and provides REST client methods for S3/R2 object storage without heavyweight external dependencies.
 */
import { createHmac, createHash } from 'node:crypto'

import type {
  GenerateDownloadUrlOptions,
  GenerateUploadUrlOptions,
  PresignedDownloadResult,
  PresignedUploadResult,
  PutObjectOptions,
  StorageDriver,
  StorageObjectMetadata,
} from '../port.js'

export type S3StorageOptions = {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint?: string | undefined // e.g. "https://<account_id>.r2.cloudflarestorage.com"
  readonly publicBaseUrl?: string | undefined // e.g. CDN domain
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function sha256Hex(data: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

export class S3StorageDriver implements StorageDriver {
  readonly name = 's3'
  private readonly bucket: string
  private readonly region: string
  private readonly accessKeyId: string
  private readonly secretAccessKey: string
  private readonly endpoint: string
  private readonly publicBaseUrl?: string | undefined

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket
    this.region = options.region || 'auto'
    this.accessKeyId = options.accessKeyId
    this.secretAccessKey = options.secretAccessKey
    this.endpoint = options.endpoint
      ? options.endpoint.replace(/\/+$/, '')
      : `https://${options.bucket}.s3.${options.region}.amazonaws.com`
    this.publicBaseUrl = options.publicBaseUrl?.replace(/\/+$/, '')
  }

  private getUrlForKey(key: string): URL {
    const cleanKey = key.replace(/^\/+/, '')
    if (this.endpoint.includes(this.bucket)) {
      return new URL(`${this.endpoint}/${cleanKey}`)
    }
    return new URL(`${this.endpoint}/${this.bucket}/${cleanKey}`)
  }

  private signUrl(
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
    url: URL,
    expiresInSeconds: number,
    extraQueryParams?: Record<string, string>,
  ): { signedUrl: string; expiresAt: Date } {
    const now = new Date()
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
    const dateStamp = amzDate.slice(0, 8)
    const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`
    const credential = `${this.accessKeyId}/${credentialScope}`

    const searchParams = url.searchParams
    searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256')
    searchParams.set('X-Amz-Credential', credential)
    searchParams.set('X-Amz-Date', amzDate)
    searchParams.set('X-Amz-Expires', expiresInSeconds.toString())
    searchParams.set('X-Amz-SignedHeaders', 'host')

    if (extraQueryParams) {
      for (const [k, v] of Object.entries(extraQueryParams)) {
        searchParams.set(k, v)
      }
    }

    // Sort query params alphabetically
    searchParams.sort()

    const canonicalUri = url.pathname
    const canonicalQueryString = searchParams.toString()
    const canonicalHeaders = `host:${url.host}\n`
    const signedHeaders = 'host'
    const payloadHash = 'UNSIGNED-PAYLOAD'

    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`

    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`
    const signingKey = getSigningKey(this.secretAccessKey, dateStamp, this.region, 's3')
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

    searchParams.set('X-Amz-Signature', signature)

    return { signedUrl: url.toString(), expiresAt }
  }

  generateUploadUrl(options: GenerateUploadUrlOptions): Promise<PresignedUploadResult> {
    const ttl = options.expiresInSeconds ?? 900
    const url = this.getUrlForKey(options.key)

    const { signedUrl, expiresAt } = this.signUrl('PUT', url, ttl)

    return Promise.resolve({
      uploadUrl: signedUrl,
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
    const url = this.getUrlForKey(options.key)

    const extraParams: Record<string, string> = {}
    if (options.filename) {
      extraParams['response-content-disposition'] =
        `attachment; filename="${encodeURIComponent(options.filename)}"`
    }

    const { signedUrl, expiresAt } = this.signUrl('GET', url, ttl, extraParams)

    return Promise.resolve({
      downloadUrl: signedUrl,
      expiresAt,
    })
  }

  async headObject(key: string): Promise<StorageObjectMetadata | null> {
    const url = this.getUrlForKey(key)
    const { signedUrl } = this.signUrl('HEAD', url, 60)

    const response = await fetch(signedUrl, { method: 'HEAD' })
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`S3 HEAD failed for key '${key}' with status ${response.status.toString()}`)
    }

    const contentLength = response.headers.get('content-length')
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const etag = (response.headers.get('etag') ?? '').replace(/"/g, '')
    const lastModifiedHeader = response.headers.get('last-modified')
    const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : new Date()

    return {
      key,
      byteSize: contentLength ? BigInt(contentLength) : 0n,
      contentType,
      etag,
      lastModified,
    }
  }

  async deleteObject(key: string): Promise<void> {
    const url = this.getUrlForKey(key)
    const { signedUrl } = this.signUrl('DELETE', url, 60)

    const response = await fetch(signedUrl, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE failed for key '${key}' with status ${response.status.toString()}`)
    }
  }

  async putObject(
    key: string,
    data: Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<StorageObjectMetadata> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const url = this.getUrlForKey(key)
    const { signedUrl } = this.signUrl('PUT', url, 60)

    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'content-type': options.contentType,
        'content-length': bytes.byteLength.toString(),
      },
      body: Buffer.from(bytes),
    })

    if (!response.ok) {
      throw new Error(`S3 PUT failed for key '${key}' with status ${response.status.toString()}`)
    }

    const etag = (response.headers.get('etag') ?? sha256Hex(bytes)).replace(/"/g, '')
    return {
      key,
      byteSize: BigInt(bytes.byteLength),
      contentType: options.contentType,
      etag,
      lastModified: new Date(),
    }
  }

  async getObject(
    key: string,
  ): Promise<{ readonly data: Uint8Array; readonly metadata: StorageObjectMetadata } | null> {
    const url = this.getUrlForKey(key)
    const { signedUrl } = this.signUrl('GET', url, 60)

    const response = await fetch(signedUrl)
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`S3 GET failed for key '${key}' with status ${response.status.toString()}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)
    const contentLength = response.headers.get('content-length')
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const etag = (response.headers.get('etag') ?? sha256Hex(data)).replace(/"/g, '')
    const lastModifiedHeader = response.headers.get('last-modified')
    const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : new Date()

    return {
      data,
      metadata: {
        key,
        byteSize: contentLength ? BigInt(contentLength) : BigInt(data.byteLength),
        contentType,
        etag,
        lastModified,
      },
    }
  }
}
