import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InvalidStorageKeyError, LocalStorageDriver, type SignedStorageRequest } from './local.js'

const SECRET = 'x'.repeat(40)

function parse(url: string, signature?: string): SignedStorageRequest {
  const q = new URL(url).searchParams
  return {
    op: q.get('op') as 'put' | 'get',
    key: q.get('key') ?? '',
    expires: Number(q.get('expires')),
    contentType: q.get('ct') ?? undefined,
    contentLength: q.get('len') ?? undefined,
    filename: q.get('fn') ?? undefined,
    signature: signature ?? q.get('sig') ?? '',
  }
}

describe('LocalStorageDriver', () => {
  let root: string
  let driver: LocalStorageDriver

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ch-storage-'))
    driver = new LocalStorageDriver({ rootDir: root, baseUrl: 'https://app.test/', signingSecret: SECRET })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('round-trips an object with its content type', async () => {
    await driver.putObject('ws/a/file.pdf', new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' })
    const obj = await driver.getObject('ws/a/file.pdf')
    expect(obj?.metadata.contentType).toBe('application/pdf')
    expect(obj?.metadata.byteSize).toBe(3n)
    expect([...(obj?.data ?? [])]).toEqual([1, 2, 3])
    await driver.deleteObject('ws/a/file.pdf')
    expect(await driver.headObject('ws/a/file.pdf')).toBeNull()
  })

  it('issues upload URLs that verify, and stop verifying when any field changes', async () => {
    const { uploadUrl } = await driver.generateUploadUrl({
      key: 'ws/a/file.zip',
      contentType: 'application/zip',
      contentLength: 10n,
    })
    expect(uploadUrl.startsWith('https://app.test/api/storage?')).toBe(true)
    const request = parse(uploadUrl)
    expect(driver.verify(request)).toBe(true)
    expect(driver.verify({ ...request, contentLength: '999999' })).toBe(false)
    expect(driver.verify({ ...request, key: 'ws/b/file.zip' })).toBe(false)
    expect(driver.verify({ ...request, op: 'get' })).toBe(false)
  })

  it('rejects expired URLs', async () => {
    const { downloadUrl } = await driver.generateDownloadUrl({ key: 'ws/a/f.pdf', expiresInSeconds: 60 })
    const request = parse(downloadUrl)
    expect(driver.verify(request, new Date(Date.now() + 120_000))).toBe(false)
  })

  it('refuses keys that could escape the root directory', async () => {
    await expect(driver.putObject('../etc/passwd', 'x', { contentType: 'text/plain' })).rejects.toThrow(
      InvalidStorageKeyError,
    )
    await expect(
      driver.generateUploadUrl({ key: 'ws/../../x', contentType: 'text/plain', contentLength: 1n }),
    ).rejects.toThrow(InvalidStorageKeyError)
    expect(driver.verify({ op: 'get', key: '/abs', expires: 9e9, signature: 'x' })).toBe(false)
  })

  it('refuses a short signing secret', () => {
    expect(
      () => new LocalStorageDriver({ rootDir: root, baseUrl: 'https://a.b', signingSecret: 'short' }),
    ).toThrow()
  })
})
