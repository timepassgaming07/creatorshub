/**
 * CLI runner for database migrations.
 *
 * Usage: tsx scripts/migrate.ts
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runMigrations } from '../src/migrate.js'
import { loadDatabaseConfig } from '../src/config.js'

const MIGRATIONS_FOLDER = new URL('../migrations', import.meta.url).pathname

function loadEnvFile() {
  const rootEnvPath = resolve(process.cwd(), '.env')
  const workspaceRootEnvPath = resolve(process.cwd(), '../../.env')

  const envPath = existsSync(rootEnvPath)
    ? rootEnvPath
    : existsSync(workspaceRootEnvPath)
      ? workspaceRootEnvPath
      : null

  if (envPath) {
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (key && !process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

async function main() {
  loadEnvFile()
  const config = loadDatabaseConfig(process.env)
  // The URL carries the password, so it is never printed.
  process.stdout.write('[db:migrate] Running migrations...\n')

  const result = await runMigrations({
    migrationUrl: config.databaseMigrationUrl,
    migrationsFolder: MIGRATIONS_FOLDER,
  })

  process.stdout.write(`[db:migrate] Applied migrations in ${String(result.durationMs)}ms.\n`)
}

main().catch((err: unknown) => {
  console.error('[db:migrate] Migration error:', err)
  process.exit(1)
})
