/**
 * Storage Port and Adapters (@creatorhub/storage).
 *
 * Responsibilities:
 * Presigned upload URLs, download delivery, object inspection, and storage abstraction.
 */
export { MemoryStorageDriver } from './adapters/memory.js'
export { S3StorageDriver, type S3StorageOptions } from './adapters/s3.js'
export {
  createStorageDriver,
  loadStorageConfig,
  memoryStorageConfigSchema,
  s3StorageConfigSchema,
  storageConfigSchema,
  type StorageConfig,
} from './config.js'
export type {
  GenerateDownloadUrlOptions,
  GenerateUploadUrlOptions,
  PresignedDownloadResult,
  PresignedUploadResult,
  PutObjectOptions,
  StorageDriver,
  StorageObjectMetadata,
} from './port.js'
