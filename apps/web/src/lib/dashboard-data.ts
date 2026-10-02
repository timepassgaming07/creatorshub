/**
 * Server-side data for dashboard screens.
 *
 * Not a server-action module: these run while a server component renders.
 * Each opens the workspace as the signed-in member, checks the permission the
 * screen needs, and reads under both isolation layers.
 */
import { notFound, redirect } from 'next/navigation'
import {
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type AnalyticsSummaryDTO,
  type AnalyticsTimeframe,
  type WorkspaceContext,
} from '@creatorhub/contracts'
import {
  analytics,
  beneficiaryAccountsRepo,
  catalogue,
  orders,
  storefronts,
  workspaces,
  type RepositoryScope,
} from '@creatorhub/db'
import { authorise, type Permission, type WorkspaceRole } from '@creatorhub/domain'

import { getDatabase } from './db'
import { getWorkspaceAccess, type WorkspaceAccess } from './workspace-access'

export type MemberScope = RepositoryScope & { readonly access: WorkspaceAccess }

/**
 * Run `work` as the signed-in member of the workspace. Redirects to sign-in
 * when signed out, answers 404 for non-members and missing permissions.
 */
export async function asMember<T>(
  rawWorkspaceId: string,
  permission: Permission | null,
  work: (scope: MemberScope) => Promise<T>,
): Promise<T> {
  const { session, access } = await getWorkspaceAccess(rawWorkspaceId)
  if (!session) redirect(`/sign-in?redirect=${encodeURIComponent(`/workspaces/${rawWorkspaceId}`)}`)
  if (!access) notFound()

  const wsId = toWorkspaceId(access.workspace.id)
  if (permission) {
    const decision = authorise(
      { userId: session.userId, workspaceId: wsId, role: access.role as WorkspaceRole },
      wsId,
      permission,
    )
    if (!decision.ok) notFound()
  }

  const context: WorkspaceContext = workspaceContext({
    workspaceId: wsId,
    actorId: session.userId,
    requestId: requestId(`req-view-${Date.now().toString(36)}`),
  })
  return getDatabase().withWorkspace(context, (tx) => work({ tx, context, access }))
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export type HomeData = {
  readonly summary: AnalyticsSummaryDTO
  readonly previousGrossMinor: string
  readonly recentOrders: readonly {
    readonly id: string
    readonly customerName: string | null
    readonly customerEmail: string
    readonly total: string
    readonly currency: string
    readonly status: string
    readonly createdAt: string
  }[]
  readonly checklist: {
    readonly hasProduct: boolean
    readonly hasPublishedProduct: boolean
    readonly hasDeliverable: boolean
    readonly storeCustomized: boolean
    readonly storePublished: boolean
    readonly gstRegistered: boolean
    readonly hasPayoutAccount: boolean
  }
}

export async function loadHome(rawWorkspaceId: string, timeframe: AnalyticsTimeframe = '30d'): Promise<HomeData> {
  return asMember(rawWorkspaceId, 'workspace.view', async (scope) => {
    const summary = await analytics.getWorkspaceAnalyticsSummary(scope, { timeframe })

    // The window before this one, for a trend arrow.
    const previousStart = new Date(Date.now() - 60 * 86_400_000)
    const previousEnd = new Date(Date.now() - 30 * 86_400_000)
    const previous = await orders.listOrders(scope, {
      status: 'paid',
      fromDate: previousStart,
      toDate: previousEnd,
      limit: 1000,
    })
    const previousGross = previous.reduce((sum, o) => sum + o.totalAmount, 0n)

    const recent = await orders.listOrders(scope, { limit: 6 })
    const products = await catalogue.listProducts(scope)
    let hasDeliverable = false
    for (const product of products) {
      const files = await catalogue.listAssetsForProduct(scope, product.id as never)
      if (files.some((f) => f.productAsset.role === 'deliverable')) {
        hasDeliverable = true
        break
      }
    }
    const store = await storefronts.findStorefrontByWorkspaceId(scope)
    const ws = await workspaces.findCurrentWorkspace(scope)
    const accounts = await beneficiaryAccountsRepo.listBeneficiaryAccounts(scope)

    const theme = store?.themeConfig
    return {
      summary,
      previousGrossMinor: previousGross.toString(),
      recentOrders: recent.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        total: o.totalAmount.toString(),
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
      checklist: {
        hasProduct: products.length > 0,
        hasPublishedProduct: products.some((p) => p.status === 'published'),
        hasDeliverable,
        storeCustomized:
          Boolean(theme?.bio) ||
          Boolean(theme?.heroHeadline) ||
          Boolean(store?.tagline) ||
          (theme?.socialLinks.length ?? 0) > 0 ||
          (theme?.customLinks.length ?? 0) > 0,
        storePublished: store?.status === 'published',
        gstRegistered: ws?.taxSettings.gstRegistered ?? false,
        hasPayoutAccount: accounts.length > 0,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ProductRow = {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly status: string
  readonly visibility: string
  readonly price: string
  readonly currency: string
  readonly coverUrl: string | null
  readonly fileCount: number
  readonly unitsSold: number
  readonly revenueMinor: string
  readonly updatedAt: string
}

export async function loadProducts(rawWorkspaceId: string): Promise<readonly ProductRow[]> {
  return asMember(rawWorkspaceId, 'product.view', async (scope) => {
    const products = await catalogue.listProducts(scope)
    const performance = await analytics.listProductPerformance(scope, { timeframe: 'all' })
    const byId = new Map(performance.map((p) => [p.productId, p]))
    const rows: ProductRow[] = []
    for (const product of products) {
      const files = await catalogue.listAssetsForProduct(scope, product.id as never)
      const cover = files.find((f) => f.productAsset.role === 'cover_image')
      const perf = byId.get(product.id)
      rows.push({
        id: product.id,
        title: product.title,
        slug: product.slug,
        status: product.status,
        visibility: product.visibility,
        price: product.basePrice.toString(),
        currency: product.currency,
        coverUrl: cover ? `/api/media/${scope.context.workspaceId}/${cover.asset.id}` : null,
        fileCount: files.filter((f) => f.productAsset.role === 'deliverable').length,
        unitsSold: perf?.unitsSold ?? 0,
        revenueMinor: perf?.grossRevenueMinor ?? '0',
        updatedAt: product.updatedAt.toISOString(),
      })
    }
    return rows
  })
}

export type ProductFile = {
  readonly assetId: string
  readonly role: string
  readonly filename: string
  readonly mimeType: string
  readonly byteSize: string
  readonly scanStatus: string
  readonly previewUrl: string | null
}

export type ProductEditorData = {
  readonly product: {
    readonly id: string
    readonly title: string
    readonly slug: string
    readonly description: string | null
    readonly status: string
    readonly visibility: string
    readonly currency: string
    readonly price: string
    readonly compareAtPrice: string | null
  }
  readonly variants: readonly {
    readonly id: string
    readonly title: string
    readonly price: string | null
    readonly isActive: boolean
  }[]
  readonly files: readonly ProductFile[]
  readonly storeUrl: string | null
  readonly storeStatus: string | null
}

export async function loadProductEditor(
  rawWorkspaceId: string,
  rawProductId: string,
): Promise<ProductEditorData> {
  return asMember(rawWorkspaceId, 'product.view', async (scope) => {
    if (!/^[0-9a-f-]{36}$/i.test(rawProductId)) notFound()
    const product = await catalogue.findProductById(scope, rawProductId as never)
    if (!product) notFound()
    const variants = await catalogue.listVariantsForProduct(scope, product.id as never)
    const files = await catalogue.listAssetsForProduct(scope, product.id as never)
    const store = scope.access.storefront
    return {
      product: {
        id: product.id,
        title: product.title,
        slug: product.slug,
        description: product.description,
        status: product.status,
        visibility: product.visibility,
        currency: product.currency,
        price: product.basePrice.toString(),
        compareAtPrice: product.compareAtPrice?.toString() ?? null,
      },
      variants: variants
        .sort((a, b) => a.position - b.position)
        .map((v) => ({
          id: v.id,
          title: v.title,
          price: v.priceOverride?.toString() ?? null,
          isActive: v.isActive,
        })),
      files: files.map((f) => ({
        assetId: f.asset.id,
        role: f.productAsset.role,
        filename: f.asset.originalFilename,
        mimeType: f.asset.mimeType,
        byteSize: f.asset.byteSize.toString(),
        scanStatus: f.asset.scanStatus,
        previewUrl: f.asset.mimeType.startsWith('image/')
          ? `/api/media/${scope.context.workspaceId}/${f.asset.id}`
          : null,
      })),
      storeUrl: store?.url ?? null,
      storeStatus: store?.status ?? null,
    }
  })
}
