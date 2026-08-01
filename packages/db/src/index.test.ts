import { describe, expect, it } from 'vitest'

import * as publicApi from './index.js'

/**
 * Guards ADR-0012 layer 1: feature code cannot obtain an unscoped client.
 *
 * The rule is enforced by what `index.ts` omits, and an omission is invisible.
 * Nothing stops a later change from adding a convenient `getClient()` and every
 * test still passing, at which point the tenant predicate becomes optional
 * again. This test fails when that happens.
 *
 * CLAUDE.md 5b: verify the enforcement, not just the rule.
 */
describe('public surface', () => {
  const exported = Object.keys(publicApi).sort()

  it('is exactly the intended set', () => {
    expect(exported).toEqual([
      'DatabaseConfigError',
      'MigrationError',
      'createDatabase',
      'loadDatabaseConfig',
      'runMigrations',
    ])
  })

  // Names that would indicate a raw handle escaped. A driver reachable from
  // outside this package is a query with no tenant filter waiting to be written.
  it.each(['client', 'db', 'drizzle', 'getClient', 'getDb', 'pool', 'postgres', 'sql', 'unsafe'])(
    'does not export %s',
    (name) => {
      expect(exported).not.toContain(name)
    },
  )

  // The harness starts Docker containers. Nothing in a production bundle should
  // be able to reach it, and an accidental re-export would put Testcontainers on
  // the runtime dependency path.
  it.each(['startTestDatabase', 'POSTGRES_IMAGE'])('does not export the test helper %s', (name) => {
    expect(exported).not.toContain(name)
  })

  it('exposes tenant-scoped access as the only way in', () => {
    expect(typeof publicApi.createDatabase).toBe('function')
  })
})
