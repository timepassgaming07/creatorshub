import { describe, expect, it } from 'vitest'

import { DatabaseConfigError, loadDatabaseConfig } from './config.js'

const VALID = {
  DATABASE_URL: 'postgres://creatorhub_app:pw@localhost:5432/creatorhub',
  DATABASE_MIGRATION_URL: 'postgres://creatorhub_migrator:pw@localhost:5432/creatorhub',
}

describe('loadDatabaseConfig', () => {
  it('reads both connection strings', () => {
    const config = loadDatabaseConfig(VALID)

    expect(config.databaseUrl).toBe(VALID.DATABASE_URL)
    expect(config.databaseMigrationUrl).toBe(VALID.DATABASE_MIGRATION_URL)
  })

  it('applies pool defaults so a deployment need not set them', () => {
    const config = loadDatabaseConfig(VALID)

    expect(config.poolMax).toBe(10)
    expect(config.idleTimeout).toBe(30)
    expect(config.connectTimeout).toBe(10)
  })

  it('accepts the postgresql:// spelling', () => {
    const config = loadDatabaseConfig({
      ...VALID,
      DATABASE_URL: 'postgresql://app@localhost:5432/db',
    })

    expect(config.databaseUrl).toBe('postgresql://app@localhost:5432/db')
  })

  // security.md requires a missing secret to fail at boot, not at first query.
  // A connection string discovered absent mid-checkout is an outage; discovered
  // at startup it is a failed deploy.
  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      loadDatabaseConfig({ DATABASE_MIGRATION_URL: VALID.DATABASE_MIGRATION_URL }),
    ).toThrow(DatabaseConfigError)
  })

  it('throws when DATABASE_MIGRATION_URL is missing', () => {
    expect(() => loadDatabaseConfig({ DATABASE_URL: VALID.DATABASE_URL })).toThrow(
      DatabaseConfigError,
    )
  })

  it('names the offending variables so the failure is actionable', () => {
    expect(() => loadDatabaseConfig({})).toThrow(
      /databaseUrl.*databaseMigrationUrl|databaseMigrationUrl.*databaseUrl/s,
    )
  })

  it('tells the reader what to do next', () => {
    expect(() => loadDatabaseConfig({})).toThrow(/\.env\.example/)
  })

  // A URL that is not Postgres is a connection to something we did not intend.
  it.each([
    ['mysql', 'mysql://localhost:3306/db'],
    ['http', 'http://localhost:5432/db'],
    ['empty', ''],
    ['bare host', 'localhost:5432'],
  ])('rejects a %s URL', (_label, url) => {
    expect(() => loadDatabaseConfig({ ...VALID, DATABASE_URL: url })).toThrow(DatabaseConfigError)
  })

  // The message is the least controlled place a password can land. It reaches
  // logs, error trackers, and sometimes a screenshot in a ticket.
  it('does not echo the connection string back', () => {
    const secret = 'postgres://user:sup3rs3cr3t@host:5432/db'

    try {
      loadDatabaseConfig({ ...VALID, DATABASE_URL: secret.replace('postgres://', 'mysql://') })
      expect.unreachable('expected a DatabaseConfigError')
    } catch (error) {
      expect((error as Error).message).not.toContain('sup3rs3cr3t')
    }
  })

  describe('pool sizing', () => {
    it('coerces numeric strings, since environment variables are strings', () => {
      const config = loadDatabaseConfig({ ...VALID, DATABASE_POOL_MAX: '25' })

      expect(config.poolMax).toBe(25)
    })

    it.each([
      ['zero', '0'],
      ['negative', '-1'],
      ['fractional', '2.5'],
      ['not a number', 'many'],
      ['above the cap', '1000'],
    ])('rejects %s', (_label, value) => {
      expect(() => loadDatabaseConfig({ ...VALID, DATABASE_POOL_MAX: value })).toThrow(
        DatabaseConfigError,
      )
    })

    it('allows a zero idle timeout, which means never reap', () => {
      expect(loadDatabaseConfig({ ...VALID, DATABASE_IDLE_TIMEOUT: '0' }).idleTimeout).toBe(0)
    })

    // A zero connect timeout would wait forever, turning a database outage into
    // a hung request rather than a fast failure.
    it('rejects a zero connect timeout', () => {
      expect(() => loadDatabaseConfig({ ...VALID, DATABASE_CONNECT_TIMEOUT: '0' })).toThrow(
        DatabaseConfigError,
      )
    })
  })
})
