/**
 * Storage Port and Adapters unit tests (Item 3.2).
 */
import { assetId, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { MemoryStorageDriver } from './adapters/memory.js'
import { S3StorageDriver } from './adapters/s3.js'
import { createStorageDriver, loadStorageConfig } from './config.js'
import { detectMimeType, validateMimeType } from './inspection.js'
import { AssetStorageService } from './service.js'

describe('MemoryStorageDriver', () => {
  it('generates presigned upload and download URLs', async () => {
    const driver = new MemoryStorageDriver()

    const upload = await driver.generateUploadUrl({
      key: 'workspaces/ws-1/assets/file.pdf',
      contentType: 'application/pdf',
      contentLength: 1024n,
      expiresInSeconds: 600,
    })

    expect(upload.uploadUrl).toContain('memory://upload/workspaces%2Fws-1%2Fassets%2Ffile.pdf')
    expect(upload.headers['content-type']).toBe('application/pdf')
    expect(upload.headers['content-length']).toBe('1024')
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now())

    const download = await driver.generateDownloadUrl({
      key: 'workspaces/ws-1/assets/file.pdf',
      filename: 'invoice.pdf',
      expiresInSeconds: 300,
    })

    expect(download.downloadUrl).toContain(
      'memory://download/workspaces%2Fws-1%2Fassets%2Ffile.pdf',
    )
    expect(download.downloadUrl).toContain('filename=invoice.pdf')
  })

  it('puts, reads, checks, and deletes objects', async () => {
    const driver = new MemoryStorageDriver()
    const textData = 'Hello CreatorHub Asset Storage'

    // 1. Initial head is null
    expect(await driver.headObject('test.txt')).toBeNull()
    expect(await driver.getObject('test.txt')).toBeNull()

    // 2. Put object
    const meta = await driver.putObject('test.txt', textData, {
      contentType: 'text/plain',
    })
    expect(meta.key).toBe('test.txt')
    expect(meta.byteSize).toBe(BigInt(textData.length))
    expect(meta.etag).toBeDefined()

    // 3. Head object
    const head = await driver.headObject('test.txt')
    expect(head?.byteSize).toBe(BigInt(textData.length))
    expect(head?.contentType).toBe('text/plain')
    expect(head?.etag).toBe(meta.etag)

    // 4. Get object
    const retrieved = await driver.getObject('test.txt')
    expect(retrieved).not.toBeNull()
    expect(new TextDecoder().decode(retrieved?.data)).toBe(textData)

    // 5. Delete object
    await driver.deleteObject('test.txt')
    expect(await driver.headObject('test.txt')).toBeNull()
    expect(await driver.getObject('test.txt')).toBeNull()
  })
})

describe('S3StorageDriver (AWS SigV4)', () => {
  it('generates compliant SigV4 upload and download URLs', async () => {
    const driver = new S3StorageDriver({
      bucket: 'my-bucket',
      region: 'ap-south-1',
      accessKeyId: 'AKIAEXAMPLE12345',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      endpoint: 'https://my-bucket.s3.ap-south-1.amazonaws.com',
    })

    // 1. Upload URL
    const upload = await driver.generateUploadUrl({
      key: 'workspaces/ws-test/assets/video.mp4',
      contentType: 'video/mp4',
      contentLength: 104857600n, // 100MB
    })

    const uploadUrl = new URL(upload.uploadUrl)
    expect(uploadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(uploadUrl.searchParams.get('X-Amz-Credential')).toContain('AKIAEXAMPLE12345')
    expect(uploadUrl.searchParams.get('X-Amz-Credential')).toContain('ap-south-1/s3/aws4_request')
    expect(uploadUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(upload.headers['content-type']).toBe('video/mp4')
    expect(upload.headers['content-length']).toBe('104857600')

    // 2. Download URL
    const download = await driver.generateDownloadUrl({
      key: 'workspaces/ws-test/assets/video.mp4',
      filename: 'creator-masterclass.mp4',
    })

    const downloadUrl = new URL(download.downloadUrl)
    expect(downloadUrl.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(downloadUrl.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="creator-masterclass.mp4"',
    )
    expect(downloadUrl.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('supports Cloudflare R2 custom endpoint', async () => {
    const driver = new S3StorageDriver({
      bucket: 'creatorhub-r2',
      region: 'auto',
      accessKeyId: 'R2ACCESSKEY',
      secretAccessKey: 'R2SECRETKEY',
      endpoint: 'https://acc123.r2.cloudflarestorage.com',
    })

    const upload = await driver.generateUploadUrl({
      key: 'covers/image.png',
      contentType: 'image/png',
      contentLength: 2048n,
    })

    expect(upload.uploadUrl).toContain(
      'https://acc123.r2.cloudflarestorage.com/creatorhub-r2/covers/image.png',
    )
    expect(upload.uploadUrl).toContain('X-Amz-Signature')
  })
})

describe('Storage Configuration and Factory', () => {
  it('defaults to memory driver when no provider is specified', () => {
    const config = loadStorageConfig({})
    expect(config.provider).toBe('memory')

    const driver = createStorageDriver(config)
    expect(driver.name).toBe('memory')
  })

  it('loads s3 configuration and creates s3 driver', () => {
    const config = loadStorageConfig({
      STORAGE_PROVIDER: 's3',
      STORAGE_BUCKET: 'prod-bucket',
      STORAGE_REGION: 'us-east-1',
      STORAGE_ACCESS_KEY_ID: 'KEYID',
      STORAGE_SECRET_ACCESS_KEY: 'SECRETKEY',
    })

    expect(config.provider).toBe('s3')
    const driver = createStorageDriver(config)
    expect(driver.name).toBe('s3')
  })
})

describe('Binary Magic Number and MIME Inspection (Item 3.3)', () => {
  it('detects PDF from magic numbers', () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    expect(detectMimeType(pdfBytes)).toBe('application/pdf')
    expect(validateMimeType(pdfBytes, 'application/pdf').valid).toBe(true)
    expect(validateMimeType(pdfBytes, 'image/png').valid).toBe(false)
  })

  it('detects PNG, JPEG, GIF, and WebP from magic numbers', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(detectMimeType(png)).toBe('image/png')
    expect(validateMimeType(png, 'image/png').valid).toBe(true)

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(detectMimeType(jpeg)).toBe('image/jpeg')
    expect(validateMimeType(jpeg, 'image/jpeg').valid).toBe(true)

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    expect(detectMimeType(gif)).toBe('image/gif')
    expect(validateMimeType(gif, 'image/gif').valid).toBe(true)

    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    expect(detectMimeType(webp)).toBe('image/webp')
    expect(validateMimeType(webp, 'image/webp').valid).toBe(true)
  })

  it('detects ZIP archive format', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
    expect(detectMimeType(zip)).toBe('application/zip')
    expect(validateMimeType(zip, 'application/zip').valid).toBe(true)
    expect(validateMimeType(zip, 'application/epub+zip').valid).toBe(true)
    expect(validateMimeType(zip, 'application/pdf').valid).toBe(false)
  })

  it('detects plain text and JSON', () => {
    const json = new TextEncoder().encode('{"title": "Book", "version": 1}')
    expect(detectMimeType(json)).toBe('application/json')
    expect(validateMimeType(json, 'application/json').valid).toBe(true)

    const text = new TextEncoder().encode('Simple plain text file contents')
    expect(detectMimeType(text)).toBe('text/plain')
    expect(validateMimeType(text, 'text/markdown').valid).toBe(true)
  })
})

describe('AssetStorageService Upload and Verification (Item 3.3)', () => {
  it('orchestrates initiate upload and verification flow', async () => {
    const driver = new MemoryStorageDriver()
    const service = new AssetStorageService(driver)

    const wsId = workspaceId('018f1234-5678-7000-8000-000000000001')
    const aId = assetId('018f1234-5678-7000-8000-000000000002')

    // 1. Initiate upload
    const initiate = await service.initiateUpload({
      workspaceId: wsId,
      assetId: aId,
      filename: 'React Masterclass Guide.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024n,
    })

    expect(initiate.storageKey).toBe(
      'workspaces/018f1234-5678-7000-8000-000000000001/assets/018f1234-5678-7000-8000-000000000002/React_Masterclass_Guide.pdf',
    )
    expect(initiate.uploadUrl).toBeDefined()
    expect(initiate.headers['content-type']).toBe('application/pdf')

    // 2. Before upload, verification fails (not found)
    const earlyVerify = await service.verifyUpload(initiate.storageKey, 1024n, 'application/pdf')
    expect(earlyVerify.verified).toBe(false)

    // 3. Upload genuine PDF bytes
    const pdfData = new Uint8Array([
      0x25,
      0x50,
      0x44,
      0x46,
      0x2d,
      0x31,
      0x2e,
      0x37,
      ...new Array(1016).fill(0),
    ])
    await driver.putObject(initiate.storageKey, pdfData, { contentType: 'application/pdf' })

    // 4. Verification succeeds
    const verifySuccess = await service.verifyUpload(initiate.storageKey, 1024n, 'application/pdf')
    expect(verifySuccess.verified).toBe(true)
    if (verifySuccess.verified) {
      expect(verifySuccess.detectedMimeType).toBe('application/pdf')
      expect(verifySuccess.byteSize).toBe(1024n)
    }

    // 5. Verification fails if declared size mismatch
    const sizeMismatch = await service.verifyUpload(initiate.storageKey, 2048n, 'application/pdf')
    expect(sizeMismatch.verified).toBe(false)

    // 6. Verification fails if binary signature does not match declared type
    const mimeMismatch = await service.verifyUpload(initiate.storageKey, 1024n, 'image/png')
    expect(mimeMismatch.verified).toBe(false)
  })
})
