/**
 * Storage Port and Adapters unit tests (Item 3.2).
 */
import { describe, expect, it } from 'vitest'

import { MemoryStorageDriver } from './adapters/memory.js'
import { S3StorageDriver } from './adapters/s3.js'
import { createStorageDriver, loadStorageConfig } from './config.js'

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
