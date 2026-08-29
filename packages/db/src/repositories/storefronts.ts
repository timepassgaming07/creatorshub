/**
 * Storefront repository — tenant-scoped creator storefront configurations (Implementation Plan §4.1).
 *
 * Responsibilities:
 * 1. Storefront creation, updating, theme persistence, and publishing.
 * 2. Tenant isolation: Every mutation and scoped query is filtered by workspaceId.
 * 3. Subdomain and custom domain lookup for public storefront resolution.
 *
 * Invariants:
 * Multi-tenancy: One storefront per workspace root.
 * Subdomains: Case-insensitive unique identifier across the platform.
 */
import type {
  CreateStorefrontInput,
  CustomDomainStatus,
  StorefrontId,
  StorefrontTheme,
  UpdateStorefrontInput,
} from '@creatorhub/contracts'
import { eq } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import { type NewStorefrontRecord, type StorefrontRecord, storefronts } from '../schema/index.js'

export type { NewStorefrontRecord, StorefrontRecord }

/**
 * Creates a storefront record for the current workspace.
 */
export async function createStorefront(
  scope: RepositoryScope,
  input: CreateStorefrontInput,
): Promise<StorefrontRecord> {
  const [created] = await scope.tx
    .insert(storefronts)
    .values(
      insertValues<NewStorefrontRecord>(scope, {
        subdomain: input.subdomain.toLowerCase(),
        customDomain: input.customDomain?.toLowerCase() ?? null,
        title: input.title,
        tagline: input.tagline ?? null,
        description: input.description ?? null,
        themeConfig: input.themeConfig ?? ({} as StorefrontTheme),
        status: 'draft',
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create storefront for workspace '${scope.context.workspaceId}'`)
  }

  return created
}

/**
 * Updates a storefront within the current workspace.
 */
export async function updateStorefront(
  scope: RepositoryScope,
  id: StorefrontId,
  input: UpdateStorefrontInput,
): Promise<StorefrontRecord> {
  const patch: Partial<NewStorefrontRecord> = {
    updatedAt: new Date(),
  }

  if (input.title !== undefined) patch.title = input.title
  if (input.tagline !== undefined) patch.tagline = input.tagline
  if (input.description !== undefined) patch.description = input.description
  if (input.customDomain !== undefined) {
    patch.customDomain = input.customDomain ? input.customDomain.toLowerCase() : null
  }
  if (input.themeConfig !== undefined) {
    patch.themeConfig = input.themeConfig as StorefrontTheme
  }
  if (input.status !== undefined) {
    patch.status = input.status
    if (input.status === 'published') {
      patch.publishedAt = new Date()
    }
  }

  const [updated] = await scope.tx
    .update(storefronts)
    .set(patch)
    .where(scoped(scope, storefronts, eq(storefronts.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Storefront ${id} not found or not accessible to tenant.`)
  }

  return updated
}

/**
 * Finds the storefront belonging to the current workspace.
 */
export async function findStorefrontByWorkspaceId(
  scope: RepositoryScope,
): Promise<StorefrontRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(storefronts)
    .where(scoped(scope, storefronts, eq(storefronts.workspaceId, scope.context.workspaceId)))

  return row ?? null
}

/**
 * Finds a storefront by its ID within the current workspace.
 */
export async function findStorefrontById(
  scope: RepositoryScope,
  id: StorefrontId,
): Promise<StorefrontRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(storefronts)
    .where(scoped(scope, storefronts, eq(storefronts.id, id)))

  return row ?? null
}

/**
 * Finds a storefront by subdomain (scoped to current workspace context).
 */
export async function findStorefrontBySubdomain(
  scope: RepositoryScope,
  subdomain: string,
): Promise<StorefrontRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(storefronts)
    .where(scoped(scope, storefronts, eq(storefronts.subdomain, subdomain.toLowerCase())))

  return row ?? null
}

/**
 * Finds a storefront by custom domain (scoped to current workspace context).
 */
export async function findStorefrontByCustomDomain(
  scope: RepositoryScope,
  customDomain: string,
): Promise<StorefrontRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(storefronts)
    .where(scoped(scope, storefronts, eq(storefronts.customDomain, customDomain.toLowerCase())))

  return row ?? null
}

/**
 * Publishes a storefront, making it active for public storefront resolution.
 */
export async function publishStorefront(
  scope: RepositoryScope,
  id: StorefrontId,
): Promise<StorefrontRecord> {
  return updateStorefront(scope, id, {
    status: 'published',
  })
}

/**
 * Updates custom domain verification state.
 */
export async function updateCustomDomainStatus(
  scope: RepositoryScope,
  id: StorefrontId,
  status: CustomDomainStatus,
  verifiedAt?: Date | null,
): Promise<StorefrontRecord> {
  const [row] = await scope.tx
    .update(storefronts)
    .set({
      customDomainStatus: status,
      customDomainVerifiedAt: verifiedAt ?? (status === 'verified' ? new Date() : null),
      updatedAt: new Date(),
    })
    .where(scoped(scope, storefronts, eq(storefronts.id, id)))
    .returning()

  if (!row) {
    throw new Error(`Storefront ${id} not found or not accessible to tenant.`)
  }

  return row
}
