/**
 * Storage configuration loader and schema (Implementation Plan §3.2).
 *
 * Responsibilities:
 * Validate environment variables and configure object storage drivers.
 */
import { z } from 'zod'

import { MemoryStorageDriver } from './adapters/memory.js'
import { S3StorageDriver } from './adapters/s3.js'
import type { StorageDriver } from './port.js'

export const memoryStorageConfigSchema = z.object({
  provider: z.literal('memory'),
})

export const s3StorageConfigSchema = z.object({
  provider: z.enum(['s3', 'r2']),
  bucket: z.string().min(1),
  region: z.string().min(1).default('auto'),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  endpoint: z.url().optional(),
  publicBaseUrl: z.url().optional(),
})

export const storageConfigSchema = z.discriminatedUnion('provider', [
  memoryStorageConfigSchema,
  s3StorageConfigSchema,
])

export type StorageConfig = z.infer<typeof storageConfigSchema>

export function loadStorageConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): StorageConfig {
  const provider = env['STORAGE_PROVIDER'] ?? 'memory'

  if (provider === 's3' || provider === 'r2') {
    return s3StorageConfigSchema.parse({
      provider,
      bucket: env['STORAGE_BUCKET'],
      region: env['STORAGE_REGION'] ?? (provider === 'r2' ? 'auto' : 'us-east-1'),
      accessKeyId: env['STORAGE_ACCESS_KEY_ID'],
      secretAccessKey: env['STORAGE_SECRET_ACCESS_KEY'],
      endpoint: env['STORAGE_ENDPOINT'],
      publicBaseUrl: env['STORAGE_PUBLIC_BASE_URL'],
    })
  }

  return { provider: 'memory' }
}

export function createStorageDriver(config: StorageConfig): StorageDriver {
  if (config.provider === 'memory') {
    return new MemoryStorageDriver()
  }

  return new S3StorageDriver(config)
}
