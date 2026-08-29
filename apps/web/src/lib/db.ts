/**
 * Database client singleton for the web application.
 *
 * Responsibilities: instantiate tenant-scoped database handle.
 * Dependencies: @creatorhub/db.
 *
 * Connects as `creatorhub_app` subject to RLS policies.
 */
import { createDatabase, loadDatabaseConfig, type Database } from '@creatorhub/db'

const globalForDb = globalThis as unknown as {
  db?: Database
}

export function getDatabase(): Database {
  if (!globalForDb.db) {
    const config = loadDatabaseConfig(process.env)
    globalForDb.db = createDatabase(config)
  }

  return globalForDb.db
}
