/**
 * Server actions and public loaders for creator storefronts (Implementation Plan §4.2 & §4.3).
 *
 * Responsibilities:
 * 1. Admin/Creator actions: View, update theme/domain settings, publish storefronts.
 * 2. Custom domain lifecycle: Initiate verification challenge, verify DNS records, remove domains.
 * 3. Public read loaders: Resolve storefront by subdomain or verified custom domain.
 * 4. Audit logging: Log changes to storefront domains, theme configurations, and publication.
 */
'use server'

import { randomUUID } from 'node:crypto'
import {
  buildDomainChallenge,
  type CustomDomainChallenge,
  customDomainSchema,
  productId,
  type RecordStorefrontEventInput,
  recordStorefrontEventInputSchema,
  requestId,
  storefrontId,
  type StorefrontRecord,
  type StorefrontTheme,
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
import {
  generateDomainVerificationToken,
  verifyCustomDomainDns,
  type VerifyDomainOptions,
} from './domain-verification'
import { getServerSession } from './server-session'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

export type StorefrontActionResult<T> =
  { readonly success: true; readonly data: T } | { readonly success: false; readonly error: string }

export type InitiateCustomDomainResult = {
  readonly challenge: CustomDomainChallenge
  readonly storefront: StorefrontRecord
}

export type VerifyCustomDomainActionResult =
  | { readonly success: true; readonly verified: true; readonly storefront: StorefrontRecord }
  | {
      readonly success: false
      readonly verified: false
      readonly error: string
      readonly reason?: string
    }

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

export type PublicProductDetailData = {
  readonly storefront: StorefrontRecord
  readonly product: {
    readonly id: string
    readonly title: string
    readonly slug: string
    readonly description: string | null
    readonly basePrice: string
    readonly compareAtPrice: string | null
    readonly currency: string
    readonly assets: readonly {
      readonly id: string
      readonly originalFilename: string
      readonly mimeType: string
      readonly byteSize: number
      readonly role: string
    }[]
  }
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
  const rawTheme = (row.themeConfig ?? {}) as Partial<StorefrontTheme>
  const safeTheme: StorefrontTheme = {
    accentColor: rawTheme.accentColor ?? '#4f46e5',
    fontPreset: rawTheme.fontPreset ?? 'sans',
    layoutPreset: rawTheme.layoutPreset ?? 'showcase',
    heroHeadline: rawTheme.heroHeadline,
    heroSubheadline: rawTheme.heroSubheadline,
    logoAssetId: rawTheme.logoAssetId,
    bannerAssetId: rawTheme.bannerAssetId,
    bio: rawTheme.bio,
    socialLinks: Array.isArray(rawTheme.socialLinks) ? rawTheme.socialLinks : [],
    customLinks: Array.isArray(rawTheme.customLinks) ? rawTheme.customLinks : [],
  }
  return {
    ...row,
    id: storefrontId(row.id),
    workspaceId: workspaceId(row.workspaceId),
    themeConfig: safeTheme,
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

export type PublicStorefrontProduct = {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly description: string | null
  readonly basePrice: string
  readonly compareAtPrice: string | null
  readonly currency: string
}

export type StorefrontEditorData = {
  readonly storefront: StorefrontRecord
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly defaultCurrency: string
  }
  readonly products: readonly PublicStorefrontProduct[]
  readonly canManage: boolean
  readonly domainChallenge: CustomDomainChallenge | null
}

/**
 * Loads all workspace context, storefront configuration, products, and permissions for Storefront Studio.
 */
export async function getStorefrontEditorDataAction(
  workspaceIdString: string,
): Promise<StorefrontActionResult<StorefrontEditorData>> {
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
    const reqId = requestId(`req-storefront-editor-${randomUUID().slice(0, 8)}`)

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

      const canManage = can(membership.role, 'storefront.manage')
      const ws = await workspaces.findCurrentWorkspace(scope)
      if (!ws) {
        throw new Error('Workspace not found.')
      }

      let storefront = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!storefront) {
        const defaultSubdomain = ws.slug.toLowerCase()
        const defaultTitle = ws.name

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

      // Fetch products for live preview
      const dbProducts = await catalogue.listProducts(scope)
      const mappedProducts: PublicStorefrontProduct[] = dbProducts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice.toString(),
        compareAtPrice: p.compareAtPrice?.toString() ?? null,
        currency: p.currency,
      }))

      const domainChallenge =
        storefront.customDomain && storefront.customDomainVerificationToken
          ? buildDomainChallenge(storefront.customDomain, storefront.customDomainVerificationToken)
          : null

      return {
        storefront: mapStorefront(storefront),
        workspace: {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          defaultCurrency: ws.defaultCurrency,
        },
        products: mappedProducts,
        canManage,
        domainChallenge,
      }
    })

    return { success: true, data: result }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load storefront editor data.'
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
 * Initiates custom domain configuration, generating DNS challenge records (Item 4.3).
 */
export async function initiateCustomDomainAction(
  workspaceIdString: string,
  rawDomain: string,
): Promise<StorefrontActionResult<InitiateCustomDomainResult>> {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return { success: false, error: 'Unauthorized: authentication required.' }
    }

    const wsParsed = workspaceIdSchema.safeParse(workspaceIdString)
    if (!wsParsed.success) {
      return { success: false, error: 'Invalid workspace identifier.' }
    }

    const domainParsed = customDomainSchema.safeParse(rawDomain)
    if (!domainParsed.success) {
      return { success: false, error: domainParsed.error.issues[0]?.message ?? 'Invalid domain.' }
    }

    const customDomain = domainParsed.data
    const db = getDatabase()
    const targetWsId = wsParsed.data
    const currentUserId = session.userId
    const reqId = requestId(`req-dom-init-${randomUUID().slice(0, 8)}`)

    const context = workspaceContext({
      workspaceId: targetWsId,
      actorId: currentUserId,
      requestId: reqId,
    })

    const token = generateDomainVerificationToken()
    const challenge = buildDomainChallenge(customDomain, token)

    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const membership = await workspaceMembers.findMemberByUserId(scope, currentUserId)
      if (!membership || !can(membership.role, 'storefront.manage')) {
        throw new Error('Forbidden: you do not have permission to configure custom domains.')
      }

      const existing = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!existing) {
        throw new Error('Storefront not found for this workspace.')
      }

      const updated = await storefronts.updateStorefront(scope, storefrontId(existing.id), {
        customDomain,
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: currentUserId,
        action: 'storefront.domain.initiated',
        targetType: 'storefront',
        targetId: existing.id,
        metadata: {
          customDomain,
          txtHost: challenge.txtRecord.host,
        },
      })

      return {
        challenge,
        storefront: mapStorefront({
          ...updated,
          customDomainStatus: 'pending',
          customDomainVerificationToken: token,
          customDomainVerifiedAt: null,
        }),
      }
    })

    return { success: true, data: result }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to initiate custom domain configuration.'
    return { success: false, error: message }
  }
}

/**
 * Validates DNS challenge for storefront's custom domain (Item 4.3).
 */
export async function verifyCustomDomainAction(
  workspaceIdString: string,
  options?: VerifyDomainOptions,
): Promise<VerifyCustomDomainActionResult> {
  try {
    const session = await getServerSession()
    if (!session?.userId) {
      return { success: false, verified: false, error: 'Unauthorized: authentication required.' }
    }

    const wsParsed = workspaceIdSchema.safeParse(workspaceIdString)
    if (!wsParsed.success) {
      return { success: false, verified: false, error: 'Invalid workspace identifier.' }
    }

    const db = getDatabase()
    const targetWsId = wsParsed.data
    const currentUserId = session.userId
    const reqId = requestId(`req-dom-ver-${randomUUID().slice(0, 8)}`)

    const context = workspaceContext({
      workspaceId: targetWsId,
      actorId: currentUserId,
      requestId: reqId,
    })

    const verificationResult = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const membership = await workspaceMembers.findMemberByUserId(scope, currentUserId)
      if (!membership || !can(membership.role, 'storefront.manage')) {
        throw new Error('Forbidden: you do not have permission to verify custom domains.')
      }

      const sf = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!sf?.customDomain) {
        throw new Error('No custom domain is currently configured for this storefront.')
      }

      // If token is absent in row, use a deterministic or fallback token
      const token = sf.customDomainVerificationToken ?? `ch_verify_${sf.id}`

      // Run DNS challenge verification
      const check = await verifyCustomDomainDns(sf.customDomain, token, options)

      if (check.verified) {
        const updated = await storefronts.updateCustomDomainStatus(
          scope,
          storefrontId(sf.id),
          'verified',
        )

        await auditLog.writeAuditLog(scope, auditOptions, {
          actorType: 'user',
          actorId: currentUserId,
          action: 'storefront.domain.verified',
          targetType: 'storefront',
          targetId: sf.id,
          metadata: {
            customDomain: sf.customDomain,
            method: check.method,
          },
        })

        return {
          verified: true as const,
          storefront: mapStorefront(updated),
        }
      }

      const updated = await storefronts.updateCustomDomainStatus(
        scope,
        storefrontId(sf.id),
        'failed',
      )

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: currentUserId,
        action: 'storefront.domain.failed',
        targetType: 'storefront',
        targetId: sf.id,
        metadata: {
          customDomain: sf.customDomain,
          reason: check.reason,
          details: check.details,
        },
      })

      return {
        verified: false as const,
        reason: check.reason,
        details: check.details,
        storefront: mapStorefront(updated),
      }
    })

    if (verificationResult.verified) {
      return {
        success: true,
        verified: true,
        storefront: verificationResult.storefront,
      }
    }

    return {
      success: false,
      verified: false,
      error: verificationResult.details,
      reason: verificationResult.reason,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Custom domain verification failed.'
    return { success: false, verified: false, error: message }
  }
}

/**
 * Removes a custom domain and resets its verification status (Item 4.3).
 */
export async function removeCustomDomainAction(
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
    const reqId = requestId(`req-dom-rem-${randomUUID().slice(0, 8)}`)

    const context = workspaceContext({
      workspaceId: targetWsId,
      actorId: currentUserId,
      requestId: reqId,
    })

    const result = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const membership = await workspaceMembers.findMemberByUserId(scope, currentUserId)
      if (!membership || !can(membership.role, 'storefront.manage')) {
        throw new Error('Forbidden: you do not have permission to remove custom domains.')
      }

      const existing = await storefronts.findStorefrontByWorkspaceId(scope)
      if (!existing) {
        throw new Error('Storefront not found for this workspace.')
      }

      const updated = await storefronts.updateStorefront(scope, storefrontId(existing.id), {
        customDomain: null,
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: currentUserId,
        action: 'storefront.domain.removed',
        targetType: 'storefront',
        targetId: existing.id,
        metadata: {
          previousCustomDomain: existing.customDomain,
        },
      })

      return mapStorefront(updated)
    })

    return { success: true, data: result }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to remove custom domain.'
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

/**
 * Public Data Loader: Fetches product detail & storefront by subdomain and slug.
 */
export async function getPublicProductDetailBySubdomain(
  subdomain: string,
  slug: string,
  previewWorkspaceId?: string,
): Promise<PublicProductDetailData | null> {
  const db = getDatabase()

  if (previewWorkspaceId) {
    const wsParsed = workspaceIdSchema.safeParse(previewWorkspaceId)
    if (wsParsed.success) {
      const context = workspaceContext({
        workspaceId: wsParsed.data,
        actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        requestId: requestId(`req-prev-prod-${randomUUID().slice(0, 8)}`),
      })

      return db.withWorkspace(context, async (tx) => {
        const scope = { tx, context }
        const sf = await storefronts.findStorefrontByWorkspaceId(scope)
        if (!sf) return null

        const prod = await catalogue.findProductBySlug(scope, slug)
        if (!prod) return null

        const rawAssets = await catalogue.listAssetsForProduct(scope, productId(prod.id))
        return {
          storefront: mapStorefront(sf),
          product: {
            id: prod.id,
            title: prod.title,
            slug: prod.slug,
            description: prod.description,
            basePrice: prod.basePrice.toString(),
            compareAtPrice: prod.compareAtPrice?.toString() ?? null,
            currency: prod.currency,
            assets: rawAssets.map((a) => ({
              id: a.asset.id,
              originalFilename: a.asset.originalFilename,
              mimeType: a.asset.mimeType,
              byteSize: Number(a.asset.byteSize),
              role: a.productAsset.role,
            })),
          },
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
    requestId: requestId(`req-pub-prod-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    if (!sf) return null

    const prod = await catalogue.findProductBySlug(scope, slug)
    if (prod?.status !== 'published') return null

    const rawAssets = await catalogue.listAssetsForProduct(scope, productId(prod.id))
    return {
      storefront: mapStorefront(sf),
      product: {
        id: prod.id,
        title: prod.title,
        slug: prod.slug,
        description: prod.description,
        basePrice: prod.basePrice.toString(),
        compareAtPrice: prod.compareAtPrice?.toString() ?? null,
        currency: prod.currency,
        assets: rawAssets.map((a) => ({
          id: a.asset.id,
          originalFilename: a.asset.originalFilename,
          mimeType: a.asset.mimeType,
          byteSize: Number(a.asset.byteSize),
          role: a.productAsset.role,
        })),
      },
    }
  })
}

/**
 * Public Data Loader: Fetches product detail & storefront by custom domain and slug.
 */
export async function getPublicProductDetailByCustomDomain(
  domain: string,
  slug: string,
): Promise<PublicProductDetailData | null> {
  const db = getDatabase()
  const resolved = await db.resolveStorefrontByHostname(domain)
  if (resolved?.status !== 'published') {
    return null
  }

  const context = workspaceContext({
    workspaceId: resolved.workspaceId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId(`req-pub-cd-prod-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    if (!sf) return null

    const prod = await catalogue.findProductBySlug(scope, slug)
    if (prod?.status !== 'published') return null

    const rawAssets = await catalogue.listAssetsForProduct(scope, productId(prod.id))
    return {
      storefront: mapStorefront(sf),
      product: {
        id: prod.id,
        title: prod.title,
        slug: prod.slug,
        description: prod.description,
        basePrice: prod.basePrice.toString(),
        compareAtPrice: prod.compareAtPrice?.toString() ?? null,
        currency: prod.currency,
        assets: rawAssets.map((a) => ({
          id: a.asset.id,
          originalFilename: a.asset.originalFilename,
          mimeType: a.asset.mimeType,
          byteSize: Number(a.asset.byteSize),
          role: a.productAsset.role,
        })),
      },
    }
  })
}

/**
 * Ingests a privacy-respecting storefront event (page_view, product_view, checkout_started).
 */
export async function recordStorefrontEventAction(
  rawInput: RecordStorefrontEventInput,
  userAgentHeader?: string,
): Promise<StorefrontActionResult<{ readonly eventId: string }>> {
  const parsed = recordStorefrontEventInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid storefront event payload.',
    }
  }

  const {
    storefrontId: sfId,
    productId: pId,
    eventType,
    visitorSessionId,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    metadata,
  } = parsed.data

  const db = getDatabase()
  const sf = await db.resolveStorefrontById(storefrontId(sfId))
  if (!sf) {
    return { success: false, error: 'Storefront not found.' }
  }

  const context = workspaceContext({
    workspaceId: sf.workspaceId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: requestId(`req-sf-event-${randomUUID().slice(0, 8)}`),
  })

  return db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const row = await storefronts.recordStorefrontEvent(scope, {
      storefrontId: sf.id,
      productId: pId ? productId(pId) : null,
      eventType,
      visitorSessionId: visitorSessionId ?? null,
      referrer: referrer ?? null,
      userAgent: userAgentHeader?.slice(0, 500) ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
      metadata: metadata ?? {},
    })

    return {
      success: true,
      data: { eventId: row.id },
    }
  })
}
