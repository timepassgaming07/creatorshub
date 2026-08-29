/**
 * The database connection, and the only route to it.
 *
 * Responsibilities: own the pool, and expose tenant-scoped access.
 * Dependencies: postgres, drizzle-orm, contracts.
 *
 * ADR-0012 layer 1 is enforced here, structurally: the driver handle and the
 * unscoped Drizzle instance are module-private and are not re-exported from
 * `index.ts`. The package `exports` map makes a deep import unresolvable, so
 * feature code cannot obtain an unscoped client even deliberately. The point is
 * that the absence of a tenant filter is not expressible, rather than
 * discouraged.
 *
 * What callers get is `withWorkspace`, which runs their work inside a
 * transaction with the tenant set. See the comment on `setTenant` for why that
 * has to be a transaction rather than a bare connection.
 */
import type {
  StorefrontId,
  StorefrontStatus,
  WorkspaceContext,
  WorkspaceId,
} from '@creatorhub/contracts'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import type { DatabaseConfig } from './config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A handle already scoped to one workspace, inside a transaction that has the
 * tenant set. Repositories are built on this; nothing else may construct one.
 */
export type TenantTransaction = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0]

export type ResolvedStorefront = {
  readonly id: StorefrontId
  readonly workspaceId: WorkspaceId
  readonly subdomain: string
  readonly customDomain: string | null
  readonly title: string
  readonly status: StorefrontStatus
}

export type Database = {
  /** Run work inside a transaction scoped to the context's workspace. */
  withWorkspace: <T>(
    context: WorkspaceContext,
    work: (tx: TenantTransaction) => Promise<T>,
  ) => Promise<T>

  /** Resolve public storefront and workspaceId by subdomain or custom domain. */
  resolveStorefrontByHostname: (hostname: string) => Promise<ResolvedStorefront | null>

  /** Close the pool. For process shutdown and test teardown. */
  close: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Tenant scoping
// ---------------------------------------------------------------------------

/**
 * The session variable RLS policies read. Namespaced because Postgres requires
 * a dot in a custom setting name.
 */
const TENANT_SETTING = 'app.workspace_id'

/**
 * Set the tenant for the current transaction.
 *
 * Three details here are load-bearing and each has a failure mode that looks
 * like working code:
 *
 * 1. `set_config(..., true)` rather than `SET`. The third argument makes the
 *    setting transaction-local, so it is discarded at commit or rollback. A
 *    plain `SET` outlives the transaction, and on a pooled connection the next
 *    borrower inherits the previous tenant's id. That is a cross-tenant read
 *    with no bug visible at any call site.
 *
 * 2. The value is bound as a parameter, never interpolated. `SET LOCAL` cannot
 *    take a parameter, which is the practical reason `set_config` is the right
 *    call rather than a stylistic one.
 *
 * 3. It runs inside the transaction, before any caller statement. Ordering
 *    matters: a query issued before this runs sees no tenant and returns
 *    nothing, which is the safe direction but still a bug.
 */
async function setTenant(tx: TenantTransaction, context: WorkspaceContext): Promise<void> {
  await tx.execute(sql`select set_config(${TENANT_SETTING}, ${context.workspaceId}, true)`)
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Build a database handle.
 *
 * The returned object exposes no way to reach the underlying driver. That is
 * deliberate and is the whole of layer 1.
 */
export function createDatabase(config: DatabaseConfig): Database {
  const client = postgres(config.databaseUrl, {
    max: config.poolMax,
    idle_timeout: config.idleTimeout,
    connect_timeout: config.connectTimeout,

    // Postgres BIGINT arrives as a string by default, because it does not fit
    // in a JS number. Money is bigint minor units, so parse it as bigint here
    // rather than letting a `number` conversion happen anywhere downstream.
    types: {
      bigint: postgres.BigInt,
    },

    // The driver's own notices are not useful in structured logs and can carry
    // query fragments. Telemetry handles logging, with redaction.
    onnotice: () => undefined,
  })

  const db = drizzle(client)

  return {
    async withWorkspace(context, work) {
      return db.transaction(async (tx) => {
        await setTenant(tx, context)
        return work(tx)
      })
    },

    async resolveStorefrontByHostname(hostname: string) {
      const clean = hostname.trim().toLowerCase()
      const rows = await client<
        {
          id: string
          workspace_id: string
          subdomain: string
          custom_domain: string | null
          title: string
          status: string
        }[]
      >`
        SELECT id, workspace_id, subdomain, custom_domain, title, status
        FROM storefronts
        WHERE (lower(subdomain) = ${clean} OR lower(custom_domain) = ${clean})
        LIMIT 1
      `
      const row = rows[0]
      if (!row) return null

      return {
        id: row.id as StorefrontId,
        workspaceId: row.workspace_id as WorkspaceId,
        subdomain: row.subdomain,
        customDomain: row.custom_domain,
        title: row.title,
        status: row.status as StorefrontStatus,
      }
    },

    async close() {
      await client.end()
    },
  }
}
