/**
 * Fulfillment Repository — Tenant-scoped digital fulfillment and entitlement persistence (Slice 6).
 *
 * Responsibilities:
 * 1. Create and manage durable entitlements independent of order status.
 * 2. Issue secure, time-limited, use-capped download grants (stored hashed with SHA-256).
 * 3. Verify and consume download grants atomically, checking parent entitlement status.
 * 4. Record tamper-evident download audit events.
 * 5. Revoke entitlements upon order refund or dispute.
 */
import type {
  AssetId,
  DownloadGrantId,
  EntitlementId,
  EntitlementStatus,
  OrderId,
  ProductId,
} from '@creatorhub/contracts'
import { desc, eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  assets,
  downloadEvents,
  downloadGrants,
  entitlements,
} from '../schema/index.js'

export type CreateEntitlementRepoInput = {
  readonly id?: EntitlementId | string
  readonly orderId: OrderId | string
  readonly productId: ProductId | string
  readonly customerEmail: string
  readonly status?: EntitlementStatus
  readonly grantedAt?: Date
  readonly metadata?: Record<string, unknown>
}

export type CreateDownloadGrantRepoInput = {
  readonly id?: DownloadGrantId | string
  readonly entitlementId: EntitlementId | string
  readonly assetId: AssetId | string
  readonly tokenHash: string
  readonly maxDownloads?: number
  readonly expiresAt: Date
}

export type ConsumeGrantResult =
  | {
      readonly ok: true
      readonly grant: typeof downloadGrants.$inferSelect
      readonly asset: typeof assets.$inferSelect
      readonly entitlement: typeof entitlements.$inferSelect
    }
  | {
      readonly ok: false
      readonly code: 'NOT_FOUND' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED'
      readonly message: string
    }

/**
 * Creates a new entitlement row.
 */
export async function createEntitlement(
  scope: RepositoryScope,
  input: CreateEntitlementRepoInput,
): Promise<typeof entitlements.$inferSelect> {
  const [created] = await scope.tx
    .insert(entitlements)
    .values(
      insertValues<typeof entitlements.$inferInsert>(scope, {
        ...(input.id ? { id: input.id } : {}),
        orderId: input.orderId,
        productId: input.productId,
        customerEmail: input.customerEmail.toLowerCase().trim(),
        status: input.status ?? 'active',
        grantedAt: input.grantedAt ?? new Date(),
        metadata: input.metadata ?? {},
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create entitlement for order '${input.orderId}'`)
  }

  return created
}

/**
 * Finds an entitlement by its primary key.
 */
export async function findEntitlementById(
  scope: RepositoryScope,
  id: EntitlementId | string,
): Promise<typeof entitlements.$inferSelect | null> {
  const [found] = await scope.tx
    .select()
    .from(entitlements)
    .where(scoped(scope, entitlements, eq(entitlements.id, id)))
    .limit(1)

  return found ?? null
}

/**
 * Finds all entitlements associated with an order.
 */
export async function findEntitlementsByOrderId(
  scope: RepositoryScope,
  orderId: OrderId | string,
): Promise<(typeof entitlements.$inferSelect)[]> {
  return scope.tx
    .select()
    .from(entitlements)
    .where(scoped(scope, entitlements, eq(entitlements.orderId, orderId)))
    .orderBy(desc(entitlements.createdAt))
}

/**
 * Finds all entitlements for a customer email address.
 */
export async function findEntitlementsByCustomerEmail(
  scope: RepositoryScope,
  customerEmail: string,
): Promise<(typeof entitlements.$inferSelect)[]> {
  return scope.tx
    .select()
    .from(entitlements)
    .where(
      scoped(
        scope,
        entitlements,
        eq(entitlements.customerEmail, customerEmail.toLowerCase().trim()),
      ),
    )
    .orderBy(desc(entitlements.createdAt))
}

/**
 * Revokes all entitlements for an order (e.g. on full refund or chargeback).
 */
export async function revokeEntitlementsByOrderId(
  scope: RepositoryScope,
  orderId: OrderId | string,
  reason = 'order_refunded',
): Promise<number> {
  const updated = await scope.tx
    .update(entitlements)
    .set({
      status: 'revoked',
      revokedAt: new Date(),
      updatedAt: new Date(),
      metadata: sql`jsonb_set(COALESCE(${entitlements.metadata}, '{}'::jsonb), '{revocationReason}', ${JSON.stringify(reason)}::jsonb)`,
    })
    .where(scoped(scope, entitlements, eq(entitlements.orderId, orderId)))
    .returning()

  return updated.length
}

/**
 * Creates a new download grant for an entitlement and digital asset.
 */
export async function createDownloadGrant(
  scope: RepositoryScope,
  input: CreateDownloadGrantRepoInput,
): Promise<typeof downloadGrants.$inferSelect> {
  const [created] = await scope.tx
    .insert(downloadGrants)
    .values(
      insertValues<typeof downloadGrants.$inferInsert>(scope, {
        ...(input.id ? { id: input.id } : {}),
        entitlementId: input.entitlementId,
        assetId: input.assetId,
        tokenHash: input.tokenHash,
        maxDownloads: input.maxDownloads ?? 5,
        downloadCount: 0,
        expiresAt: input.expiresAt,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create download grant for entitlement '${input.entitlementId}'`)
  }

  return created
}

/**
 * Finds a download grant by token hash.
 */
export async function findDownloadGrantByTokenHash(
  scope: RepositoryScope,
  tokenHash: string,
): Promise<{
  grant: typeof downloadGrants.$inferSelect
  asset: typeof assets.$inferSelect
  entitlement: typeof entitlements.$inferSelect
} | null> {
  const rows = await scope.tx
    .select({
      grant: downloadGrants,
      asset: assets,
      entitlement: entitlements,
    })
    .from(downloadGrants)
    .innerJoin(assets, eq(downloadGrants.assetId, assets.id))
    .innerJoin(entitlements, eq(downloadGrants.entitlementId, entitlements.id))
    .where(scoped(scope, downloadGrants, eq(downloadGrants.tokenHash, tokenHash)))
    .limit(1)

  return rows[0] ?? null
}

/**
 * Finds all download grants for an entitlement.
 */
export async function findDownloadGrantsByEntitlementId(
  scope: RepositoryScope,
  entitlementId: EntitlementId | string,
): Promise<(typeof downloadGrants.$inferSelect)[]> {
  return scope.tx
    .select()
    .from(downloadGrants)
    .where(scoped(scope, downloadGrants, eq(downloadGrants.entitlementId, entitlementId)))
    .orderBy(desc(downloadGrants.createdAt))
}

/**
 * Atomically validates, consumes a download credit, and records the download audit event.
 */
export async function consumeDownloadGrant(
  scope: RepositoryScope,
  input: {
    readonly tokenHash: string
    readonly ipHash?: string | null
    readonly userAgent?: string | null
    readonly now?: Date
  },
): Promise<ConsumeGrantResult> {
  const now = input.now ?? new Date()

  // 1. Fetch grant, asset, and entitlement with row lock
  const rows = await scope.tx
    .select({
      grant: downloadGrants,
      asset: assets,
      entitlement: entitlements,
    })
    .from(downloadGrants)
    .innerJoin(assets, eq(downloadGrants.assetId, assets.id))
    .innerJoin(entitlements, eq(downloadGrants.entitlementId, entitlements.id))
    .where(scoped(scope, downloadGrants, eq(downloadGrants.tokenHash, input.tokenHash)))
    .for('update')
    .limit(1)

  const found = rows[0]
  if (!found) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Download link is invalid or does not exist.',
    }
  }

  const { grant, asset, entitlement } = found

  // 2. Check entitlement status (authority)
  if (entitlement.status !== 'active') {
    return {
      ok: false,
      code: 'REVOKED',
      message: 'Access to this file has been revoked due to a refund or dispute.',
    }
  }

  // 3. Check expiration
  if (grant.expiresAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      code: 'EXPIRED',
      message: 'This download link has expired.',
    }
  }

  // 4. Check use cap
  if (grant.downloadCount >= grant.maxDownloads) {
    return {
      ok: false,
      code: 'EXHAUSTED',
      message: `Download limit of ${grant.maxDownloads.toString()} has been reached.`,
    }
  }

  // 5. Increment download count
  const [updatedGrant] = await scope.tx
    .update(downloadGrants)
    .set({
      downloadCount: grant.downloadCount + 1,
      updatedAt: now,
    })
    .where(scoped(scope, downloadGrants, eq(downloadGrants.id, grant.id)))
    .returning()

  // 6. Record download audit event
  await scope.tx.insert(downloadEvents).values(
    insertValues<typeof downloadEvents.$inferInsert>(scope, {
      downloadGrantId: grant.id,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
      downloadedAt: now,
    }),
  )

  return {
    ok: true,
    grant: updatedGrant ?? grant,
    asset,
    entitlement,
  }
}
