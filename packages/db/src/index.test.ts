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
      'AuditSaltMissingError',
      'CrossTenantWriteError',
      'DatabaseConfigError',
      'MigrationError',
      'assertSameWorkspace',
      'auditLog',
      'catalogue',
      'createDatabase',
      'discounts',
      'disputes',
      'idempotency',
      'insertValues',
      'jobs',
      'ledger',
      'loadDatabaseConfig',
      'orders',
      'outbox',
      'payments',
      'reconciliation',
      'refunds',
      'runMigrations',
      'scoped',
      'storefronts',
      'webhooks',
      'workspaceMembers',
      'workspaces',
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

  // Repositories are reachable, but only as namespaces whose every function
  // takes a RepositoryScope. There is no exported way to build one of those
  // outside withWorkspace, so a repository cannot be driven unscoped.
  it('exposes repositories only as scoped namespaces', () => {
    expect(typeof publicApi.workspaceMembers.listMembers).toBe('function')
    expect(typeof publicApi.auditLog.writeAuditLog).toBe('function')
    expect(typeof publicApi.workspaces.findCurrentWorkspace).toBe('function')
  })
})
