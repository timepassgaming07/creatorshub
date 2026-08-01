import { describe, expect, it } from 'vitest'

import {
  findTenancyViolations,
  formatViolations,
  type CatalogueReader,
  type TenancyViolation,
} from './tenancy-check.js'

/**
 * Unit tests for the check itself, against a fake catalogue.
 *
 * The check runs against a real database in CI. These tests exist because
 * constructing each violation for real would mean writing a broken migration per
 * case, and a check whose failure paths are untested is a check that reports
 * "passed" whatever it is given.
 */

type FakeTable = {
  name: string
  workspaceId?: 'NO' | 'YES'
  rlsEnabled?: boolean
  rlsForced?: boolean
  policies?: number
}

/**
 * Answers the three queries the check makes, keyed by a fragment of each.
 * Coupled to the query text, which is the cost of not needing a database here.
 */
function fakeCatalogue(tables: FakeTable[]): CatalogueReader {
  return <T>(strings: TemplateStringsArray): Promise<T[]> => {
    const query = strings.join(' ')

    if (query.includes('relrowsecurity')) {
      return Promise.resolve(
        tables.map((table) => ({
          table_name: table.name,
          rls_enabled: table.rlsEnabled ?? true,
          rls_forced: table.rlsForced ?? true,
          policy_count: table.policies ?? 1,
        })),
      ) as Promise<T[]>
    }

    if (query.includes('information_schema.columns')) {
      return Promise.resolve(
        tables
          .filter((table) => table.workspaceId !== undefined)
          .map((table) => ({ table_name: table.name, is_nullable: table.workspaceId })),
      ) as Promise<T[]>
    }

    return Promise.resolve(tables.map((table) => ({ table_name: table.name }))) as Promise<T[]>
  }
}

const problems = (violations: TenancyViolation[]) => violations.map((v) => v.problem)

describe('findTenancyViolations', () => {
  it('passes a correctly scoped and protected table', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'NO' }]),
      { exempt: {} },
    )

    expect(violations).toEqual([])
  })

  // The failure this check exists for: a table added in a later slice with no
  // workspace_id, where every query silently returns every workspace's rows.
  it('catches a table with no workspace_id', async () => {
    const violations = await findTenancyViolations(fakeCatalogue([{ name: 'products' }]), {
      exempt: {},
    })

    expect(problems(violations)).toContain('missing-workspace-id')
  })

  it('accepts a table with no workspace_id when it is declared exempt', async () => {
    const violations = await findTenancyViolations(fakeCatalogue([{ name: 'users' }]), {
      exempt: { users: 'A person may belong to several workspaces.' },
    })

    expect(violations).toEqual([])
  })

  // A nullable workspace_id lets a row exist outside every tenant, which is a
  // quieter version of the same bug.
  it('catches a nullable workspace_id', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'YES' }]),
      { exempt: {} },
    )

    expect(problems(violations)).toContain('workspace-id-nullable')
  })

  it('allows a nullable workspace_id when declared, as audit_logs needs', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'audit_logs', workspaceId: 'YES' }]),
      { exempt: { audit_logs: 'Platform actions have no workspace.' } },
    )

    expect(violations).toEqual([])
  })

  it('catches RLS not enabled', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'NO', rlsEnabled: false }]),
      { exempt: {} },
    )

    expect(problems(violations)).toContain('rls-not-enabled')
  })

  // The subtlest of the five. ENABLE without FORCE exempts the table owner, which
  // is the migration role that runs bulk backfills.
  it('catches RLS enabled but not forced', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'NO', rlsForced: false }]),
      { exempt: {} },
    )

    expect(problems(violations)).toContain('rls-not-forced')
  })

  it('catches RLS enabled with no policy', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'NO', policies: 0 }]),
      { exempt: {} },
    )

    expect(problems(violations)).toContain('no-policy')
  })

  // A stale exemption is how a real table later inherits an excuse written for a
  // different one.
  it('catches an exemption for a table that no longer exists', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', workspaceId: 'NO' }]),
      { exempt: { deleted_table: 'Was exempt once.' } },
    )

    expect(problems(violations)).toContain('undeclared')
  })

  it('ignores the migration journal, which holds no tenant data', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: '__drizzle_migrations' }]),
      { exempt: {} },
    )

    expect(violations).toEqual([])
  })

  it('reports every problem on one table rather than stopping at the first', async () => {
    const violations = await findTenancyViolations(
      fakeCatalogue([{ name: 'products', rlsEnabled: false, rlsForced: false, policies: 0 }]),
      { exempt: {} },
    )

    expect(violations).toHaveLength(4)
  })
})

describe('formatViolations', () => {
  it('states plainly that the check passed', () => {
    expect(formatViolations([])).toContain('passed')
  })

  // A CI failure that does not say what to do next gets ignored or worked around.
  it('names the table, the problem, and the fix', () => {
    const output = formatViolations([
      {
        table: 'products',
        problem: 'rls-not-forced',
        detail: 'products has RLS enabled but not forced. Add: ALTER TABLE products FORCE...',
      },
    ])

    expect(output).toContain('products')
    expect(output).toContain('rls-not-forced')
    expect(output).toContain('ALTER TABLE')
    expect(output).toContain('0012-multi-tenancy.md')
  })

  it('counts the violations', () => {
    const output = formatViolations([
      { table: 'a', problem: 'no-policy', detail: 'x' },
      { table: 'b', problem: 'no-policy', detail: 'y' },
    ])

    expect(output).toContain('2 violation(s)')
  })
})
