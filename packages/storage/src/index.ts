/**
 * Storage Port and Adapters (@creatorhub/storage).
 *
 * Responsibilities:
 * Presigned upload URLs, download delivery, object inspection, malware scanning, and storage abstraction.
 */
export {
  InvalidStorageKeyError,
  LocalStorageDriver,
  type LocalStorageOptions,
  type SignedStorageRequest,
} from './adapters/local.js'
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
export { AssetNotDeliverableError, assertAssetDeliverable, isAssetDeliverable } from './guard.js'
export { detectMimeType, type MimeInspectionResult, validateMimeType } from './inspection.js'
export type {
  GenerateDownloadUrlOptions,
  GenerateUploadUrlOptions,
  PresignedDownloadResult,
  PresignedUploadResult,
  PutObjectOptions,
  StorageDriver,
  StorageObjectMetadata,
} from './port.js'
export { HeuristicMalwareScanner, type MalwareScanResult, type MalwareScanner } from './scanner.js'
export {
  AssetStorageService,
  type InitiateAssetUploadInput,
  type InitiateAssetUploadResult,
  MAX_ASSET_BYTE_SIZE,
  type VerifyUploadedAssetResult,
} from './service.js'
