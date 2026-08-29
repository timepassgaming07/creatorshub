/**
 * Web App Storage Service Singleton.
 *
 * Responsibilities:
 * - Initialize StorageDriver (Memory in dev/test, S3 in prod) via @creatorhub/storage
 * - Provide singleton access to AssetStorageService and HeuristicMalwareScanner
 */
import {
  AssetStorageService,
  HeuristicMalwareScanner,
  createStorageDriver,
  loadStorageConfig,
  type StorageDriver,
} from '@creatorhub/storage'

let storageDriverInstance: StorageDriver | null = null
let assetStorageServiceInstance: AssetStorageService | null = null
let malwareScannerInstance: HeuristicMalwareScanner | null = null

export function getStorageDriver(): StorageDriver {
  storageDriverInstance ??= createStorageDriver(loadStorageConfig(process.env))
  return storageDriverInstance
}

export function getStorageService(): AssetStorageService {
  assetStorageServiceInstance ??= new AssetStorageService(getStorageDriver())
  return assetStorageServiceInstance
}

export function getMalwareScanner(): HeuristicMalwareScanner {
  malwareScannerInstance ??= new HeuristicMalwareScanner()
  return malwareScannerInstance
}
