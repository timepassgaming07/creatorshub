/**
 * Storage Driver & Asset Service for Web Application.
 *
 * Configures the StorageDriver (Memory / S3 / R2), AssetStorageService, and MalwareScanner.
 */
import {
  AssetStorageService,
  createStorageDriver,
  HeuristicMalwareScanner,
  loadStorageConfig,
  type MalwareScanner,
  type StorageDriver,
} from '@creatorhub/storage'

let globalStorageDriver: StorageDriver | null = null
let globalAssetService: AssetStorageService | null = null
let globalMalwareScanner: MalwareScanner | null = null

export function getStorageDriver(): StorageDriver {
  if (!globalStorageDriver) {
    const config = loadStorageConfig({
      STORAGE_DRIVER: (process.env['STORAGE_DRIVER'] as 'memory' | 's3') ?? 'memory',
      S3_BUCKET: process.env['S3_BUCKET'],
      S3_REGION: process.env['S3_REGION'],
      S3_ACCESS_KEY_ID: process.env['S3_ACCESS_KEY_ID'],
      S3_SECRET_ACCESS_KEY: process.env['S3_SECRET_ACCESS_KEY'],
      S3_ENDPOINT: process.env['S3_ENDPOINT'],
    })
    globalStorageDriver = createStorageDriver(config)
  }
  return globalStorageDriver
}

export function getAssetStorageService(): AssetStorageService {
  if (!globalAssetService) {
    const driver = getStorageDriver()
    globalAssetService = new AssetStorageService(driver)
  }
  return globalAssetService
}

export const getStorageService = getAssetStorageService

export function getMalwareScanner(): MalwareScanner {
  if (!globalMalwareScanner) {
    globalMalwareScanner = new HeuristicMalwareScanner()
  }
  return globalMalwareScanner
}
