/**
 * Tenancy enforcement check.
 *
 * Responsibilities: prove that every table in the database is either
 * tenant-scoped with an RLS policy, or listed as a deliberate exception with a
 * stated reason.
 * Dependencies: none beyond a query interface. No schema imports, on purpose.
 *
 * Item 1.5. It reads the live database catalogue rather than the Drizzle schema,
 * which matters: a table created by a hand-written migration, or by the auth
 * library in 1.6, never appears in `schema/index.ts` and would be invisible to a
 * check that only read TypeScript. The catalogue sees everything.
 *
 * The failure this prevents is specific and cheap to make. Someone adds a table
 * in slice 4, forgets `workspace_id`, and every query against it silently returns
 * every workspace's rows. Nothing else in the system would notice: types
 * compile, tests pass, RLS has no policy to apply. This is the only check that
 * would catch it, which is why it exists now rather than when it is needed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenancyViolation = {
  readonly table: string
  readonly problem:
    | 'missing-workspace-id'
    | 'workspace-id-nullable'
    | 'rls-not-enabled'
    | 'rls-not-forced'
    | 'no-policy'
    | 'undeclared'
  readonly detail: string
}

/** The subset of a SQL client this check needs. Keeps it independent of Drizzle. */
export type CatalogueReader = <T>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>

export type TenancyCheckOptions = {
  /** Tables that legitimately have no `workspace_id`, mapped to the reason. */
  readonly exempt: Readonly<Record<string, string>>
}

// ---------------------------------------------------------------------------
// Tables the check ignores
// ---------------------------------------------------------------------------

/**
 * Infrastructure tables owned by tooling rather than by the data model.
 *
 * `__drizzle_migrations` is the migration journal, in the `drizzle` schema. It
 * holds no tenant data and is not reachable by the application role.
 */
const INFRASTRUCTURE_TABLES = new Set(['__drizzle_migrations'])

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Inspect every table in `public` and report violations.
 *
 * Returns violations rather than throwing, so a caller can format them. The
 * script that runs this in CI turns a non-empty list into a failed build.
 */
export async function findTenancyViolations(
  sql: CatalogueReader,
  options: TenancyCheckOptions,
): Promise<TenancyViolation[]> {
  const tables = await sql<{ table_name: string }>`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      -- 'r' is an ordinary table, 'p' a partitioned one. Both carry the tenancy
      -- contract and both must be checked; omitting 'p' would let a partitioned
      -- table ship with no workspace_id and no policy at all.
      and c.relkind in ('r', 'p')
      -- A partition is excluded, because it is not a table anyone declares. It
      -- inherits its columns from the parent, which is checked, and it is created
      -- by a function rather than by a migration a reviewer reads. Checking it
      -- would report the same violation once per month forever.
      --
      -- What the parent's row does not prove is that each partition has its own
      -- privileges and policies, which is a real gap and a real bypass. That is
      -- asserted directly in audit-log.integration.test.ts, against statements
      -- that name a partition.
      and not c.relispartition
    order by c.relname
  `

  const columns = await sql<{ table_name: string; is_nullable: string }>`
    select table_name, is_nullable
    from information_schema.columns
    where table_schema = 'public' and column_name = 'workspace_id'
  `

  const security = await sql<{
    table_name: string
    rls_enabled: boolean
    rls_forced: boolean
    policy_count: number
  }>`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced,
      (select count(*)::int from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
  `

  const workspaceColumn = new Map(columns.map((row) => [row.table_name, row.is_nullable]))
  const securityByTable = new Map(security.map((row) => [row.table_name, row]))

  const violations: TenancyViolation[] = []

  for (const { table_name: table } of tables) {
    if (INFRASTRUCTURE_TABLES.has(table)) {
      continue
    }

    const nullable = workspaceColumn.get(table)
    const hasWorkspaceId = nullable !== undefined
    const isExempt = table in options.exempt

    // A table with neither the column nor an exemption is the case this check
    // exists for. Requiring the exemption to be declared means the author had to
    // think about tenancy, rather than merely not thinking about it.
    if (!hasWorkspaceId && !isExempt) {
      violations.push({
        table,
        problem: 'missing-workspace-id',
        detail:
          `${table} has no workspace_id and is not declared exempt. Add the column, or add ` +
          'the table to NON_TENANT_TABLES with the reason no single workspace owns the row.',
      })
    }

    // audit_logs is the one nullable case, because platform actions have no
    // workspace. It is exempt from this specific rule for that reason, and its
    // policy is asserted below like every other table's.
    if (hasWorkspaceId && nullable === 'YES' && !isExempt) {
      violations.push({
        table,
        problem: 'workspace-id-nullable',
        detail:
          `${table}.workspace_id is nullable, so a row can exist outside every tenant. ` +
          'Make it NOT NULL, or declare the table exempt with the reason.',
      })
    }

    const row = securityByTable.get(table)

    if (row?.rls_enabled !== true) {
      violations.push({
        table,
        problem: 'rls-not-enabled',
        detail: `${table} does not have row level security enabled. Layer 2 of ADR-0012 is absent.`,
      })
    }

    // ENABLE alone exempts the table owner, which is the migration role that runs
    // backfills. Without FORCE the policy is quietly optional for the one role
    // most likely to move data in bulk.
    if (row?.rls_forced !== true) {
      violations.push({
        table,
        problem: 'rls-not-forced',
        detail:
          `${table} has RLS enabled but not forced, so the table owner bypasses it. ` +
          `Add: ALTER TABLE ${table} FORCE ROW LEVEL SECURITY.`,
      })
    }

    if ((row?.policy_count ?? 0) === 0) {
      violations.push({
        table,
        problem: 'no-policy',
        detail:
          `${table} has RLS enabled but no policy, so it denies everything. That is safe ` +
          'but almost certainly unintended.',
      })
    }
  }

  // An exemption for a table that no longer exists is stale, and a stale
  // exemption is how a real table later inherits an excuse written for a
  // different one.
  const existing = new Set(tables.map((row) => row.table_name))
  for (const table of Object.keys(options.exempt)) {
    if (!existing.has(table)) {
      violations.push({
        table,
        problem: 'undeclared',
        detail: `${table} is declared exempt but does not exist. Remove the stale exemption.`,
      })
    }
  }

  return violations
}

/** Render violations for a terminal, grouped by table. */
export function formatViolations(violations: TenancyViolation[]): string {
  if (violations.length === 0) {
    return 'Tenancy check passed: every table is scoped and protected by a policy.'
  }

  const lines = [`Tenancy check failed with ${String(violations.length)} violation(s):`, '']

  for (const violation of violations) {
    lines.push(`  ${violation.table} [${violation.problem}]`)
    lines.push(`    ${violation.detail}`)
    lines.push('')
  }

  lines.push('See docs/adr/0012-multi-tenancy.md.')

  return lines.join('\n')
}
