/**
 * Storage driver, asset service, and malware scanner for the web app.
 *
 * STORAGE_PROVIDER selects the driver: `s3` or `r2` for a multi-instance
 * deployment, `local` for development or a single server with a persistent
 * disk. `memory` cannot accept browser uploads and is refused in production.
 */
import {
  AssetStorageService,
  createStorageDriver,
  HeuristicMalwareScanner,
  LocalStorageDriver,
  loadStorageConfig,
  type MalwareScanner,
  type StorageDriver,
} from '@creatorhub/storage'

import { allowsTestAdapters, ConfigurationError, envValue } from './env'

const globalForStorage = globalThis as unknown as {
  storageDriver?: StorageDriver
  assetService?: AssetStorageService
  malwareScanner?: MalwareScanner
}

export function getStorageDriver(): StorageDriver {
  if (globalForStorage.storageDriver) return globalForStorage.storageDriver

  const provider = envValue('STORAGE_PROVIDER') ?? envValue('STORAGE_DRIVER') ?? 'local'
  if (provider === 'memory' && !allowsTestAdapters()) {
    throw new ConfigurationError('STORAGE_PROVIDER=memory loses every file on restart. Use s3, r2, or local.')
  }

  globalForStorage.storageDriver = createStorageDriver(
    loadStorageConfig({ ...process.env, STORAGE_PROVIDER: provider }),
  )
  return globalForStorage.storageDriver
}

/** The local driver, when that is what is configured; the storage route needs it to verify URLs. */
export function getLocalStorageDriver(): LocalStorageDriver | null {
  const driver = getStorageDriver()
  return driver instanceof LocalStorageDriver ? driver : null
}

export function getAssetStorageService(): AssetStorageService {
  globalForStorage.assetService ??= new AssetStorageService(getStorageDriver())
  return globalForStorage.assetService
}

export const getStorageService = getAssetStorageService

export function getMalwareScanner(): MalwareScanner {
  globalForStorage.malwareScanner ??= new HeuristicMalwareScanner()
  return globalForStorage.malwareScanner
}
