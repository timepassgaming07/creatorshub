/**
 * Server actions and public loaders for creator storefronts (Implementation Plan §4.2).
 *
 * Responsibilities:
 * 1. Admin/Creator actions: View, update theme/domain settings, publish storefronts.
 * 2. Public read loaders: Resolve storefront by subdomain or verified custom domain.
 * 3. Audit logging: Log changes to storefront domains, theme configurations, and publication.
 */
'use server'

import { randomUUID } from 'node:crypto'
import {
  requestId,
  storefrontId,
  type StorefrontRecord,
  type UpdateStorefrontInput,
  updateStorefrontInputSchema,
  userId,
  workspaceContext,
  workspaceId,
  workspaceIdSchema,
} from '@creatorhub/contracts'
import { auditLog, catalogue, storefronts, workspaceMembers, workspaces } from '@creatorhub/db'
import { can } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

export type StorefrontActionResult<T> =
  { readonly success: true; readonly data: T } | { readonly success: false; readonly error: string }

export type PublicStorefrontData = {
  readonly storefront: StorefrontRecord
  readonly products: readonly {
    readonly id: string
    readonly title: string
    readonly slug: string
    readonly description: string | null
    readonly basePrice: string
    readonly compareAtPrice: string | null
    readonly currency: string
  }[]
}

function mapStorefront(row: {
  readonly id: string
  readonly workspaceId: string
  readonly subdomain: string
  readonly customDomain: string | null
  readonly customDomainStatus: 'pending' | 'verified' | 'failed'
  readonly customDomainVerificationToken: string | null
  readonly customDomainVerifiedAt: Date | null
  readonly title: string
  readonly tagline: string | null
  readonly description: string | null
  readonly themeConfig: unknown
  readonly status: 'draft' | 'published' | 'suspended'
  readonly publishedAt: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}): StorefrontRecord {
  return {
    ...row,
    id: storefrontId(row.id),
    workspaceId: workspaceId(row.workspaceId),
    themeConfig: row.themeConfig as StorefrontRecord['themeConfig'],
  }
}

/**
 * Gets or initializes the storefront for a workspace (Creator dashboard).
 */
export async function getStorefrontForWorkspaceAction(
  workspaceIdString: string,
): Promise<StorefrontActionResult<StorefrontRecord>> {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return { success: false, error: 'Unauthorized: authentication required.' }
    }

    const wsParsed = workspaceIdSchema.safeParse(workspaceIdString)
    if (!wsParsed.success) {
      return { success: false, error: 'Invalid workspace identifier.' }
    }

    const db = getDatabase()
    const targetWsId = wsParsed.data
    const currentUserId = session.userId
    const reqId = requestId(`req-storefront-${randomUUID().slice(0, 8)}`)

    const context = workspaceContext({
      workspaceId: targetWsId,
      actorId: currentUserId,
      requestId: reqId,
    })

    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const membership = await workspaceMembers.findMemberByUserId(scope, currentUserId)
      if (!membership) {
        throw new Error('Forbidden: you are not a member of this workspace.')
      }

      let storefront = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!storefront) {
        // Initialize default storefront for workspace
        const ws = await workspaces.findCurrentWorkspace(scope)
        const defaultSubdomain = (ws?.slug ?? `store-${randomUUID().slice(0, 6)}`).toLowerCase()
        const defaultTitle = ws?.name ?? 'My Store'

        storefront = await storefronts.createStorefront(scope, {
          workspaceId: targetWsId,
          subdomain: defaultSubdomain,
          title: defaultTitle,
          themeConfig: {
            accentColor: '#4f46e5',
            fontPreset: 'sans',
            layoutPreset: 'showcase',
          },
        })

        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: currentUserId,
          action: 'storefront.create',
          targetType: 'storefront',
          targetId: storefront.id,
          metadata: { subdomain: defaultSubdomain },
        })
      }

      return mapStorefront(storefront)
    })

    return { success: true, data: result }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load storefront.'
    return { success: false, error: message }
  }
}

/**
 * Updates storefront settings, custom domain, or theme.
 */
export async function saveStorefrontAction(
  workspaceIdString: string,
  input: UpdateStorefrontInput,
): Promise<StorefrontActionResult<StorefrontRecord>> {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return { success: false, error: 'Unauthorized: authentication required.' }
    }

    const wsParsed = workspaceIdSchema.safeParse(workspaceIdString)
    if (!wsParsed.success) {
      return { success: false, error: 'Invalid workspace identifier.' }
    }

    const validated = updateStorefrontInputSchema.parse(input)
    const db = getDatabase()
    const targetWsId = wsParsed.data
    const currentUserId = session.userId
    const reqId = requestId(`req-storefront-${randomUUID().slice(0, 8)}`)

    const context = workspaceContext({
      workspaceId: targetWsId,
      actorId: currentUserId,
      requestId: reqId,
    })

    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const membership = await workspaceMembers.findMemberByUserId(scope, currentUserId)
      if (!membership || !can(membership.role, 'storefront.manage')) {
        throw new Error('Forbidden: you do not have permission to modify storefront settings.')
      }

      const existing = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!existing) {
        throw new Error('Storefront not found for this workspace.')
      }

      const updated = await storefronts.updateStorefront(
        scope,
        storefrontId(existing.id),
        validated,
      )

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: currentUserId,
        action: 'storefront.update',
        targetType: 'storefront',
        targetId: existing.id,
        metadata: {
          title: validated.title,
          customDomain: validated.customDomain,
          status: validated.status,
        },
      })

      return mapStorefront(updated)
    })

    return { success: true, data: result }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update storefront.'
    return { success: false, error: message }
  }
}

/**
 * Publishes a storefront to make it accessible to the public.
 */
export async function publishStorefrontAction(
  workspaceIdString: string,
): Promise<StorefrontActionResult<StorefrontRecord>> {
  return saveStorefrontAction(workspaceIdString, { status: 'published' })
}

/**
 * Public Data Loader: Fetches published storefront & products by subdomain.
 */
export async function getPublicStorefrontDataBySubdomain(
  subdomain: string,
  previewWorkspaceId?: string,
): Promise<PublicStorefrontData | null> {
  const db = getDatabase()

  if (previewWorkspaceId) {
    const wsParsed = workspaceIdSchema.safeParse(previewWorkspaceId)
    if (wsParsed.success) {
      const context = workspaceContext({
        workspaceId: wsParsed.data,
        actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        requestId: requestId(`req-prev-${randomUUID().slice(0, 8)}`),
      })

      return db.withWorkspace(context, async (tx) => {
        const scope = { tx, context }
        const sf = await storefronts.findStorefrontByWorkspaceId(scope)
        if (!sf) return null

        const prods = await catalogue.listProducts(scope, { status: 'published' })
        return {
          storefront: mapStorefront(sf),
          products: prods.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            description: p.description,
            basePrice: p.basePrice.toString(),
            compareAtPrice: p.compareAtPrice?.toString() ?? null,
            currency: p.currency,
          })),
        }
      })
    }
  }

  const resolved = await db.resolveStorefrontByHostname(subdomain)
  if (resolved?.status !== 'published') {
    return null
  }

  const context = workspaceContext({
    workspaceId: resolved.workspaceId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId(`req-pub-sub-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    if (!sf) return null

    const prods = await catalogue.listProducts(scope, { status: 'published' })
    return {
      storefront: mapStorefront(sf),
      products: prods.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice.toString(),
        compareAtPrice: p.compareAtPrice?.toString() ?? null,
        currency: p.currency,
      })),
    }
  })
}

/**
 * Public Data Loader: Fetches published storefront & products by custom domain.
 */
export async function getPublicStorefrontDataByCustomDomain(
  domain: string,
): Promise<PublicStorefrontData | null> {
  const db = getDatabase()
  const resolved = await db.resolveStorefrontByHostname(domain)
  if (resolved?.status !== 'published') {
    return null
  }

  const context = workspaceContext({
    workspaceId: resolved.workspaceId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId(`req-pub-dom-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    if (!sf) return null

    const prods = await catalogue.listProducts(scope, { status: 'published' })
    return {
      storefront: mapStorefront(sf),
      products: prods.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice.toString(),
        compareAtPrice: p.compareAtPrice?.toString() ?? null,
        currency: p.currency,
      })),
    }
  })
}
