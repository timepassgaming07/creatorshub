/**
 * Server-side data for dashboard screens.
 *
 * Not a server-action module: these run while a server component renders.
 * Each opens the workspace as the signed-in member, checks the permission the
 * screen needs, and reads under both isolation layers.
 */
import { notFound, redirect } from 'next/navigation'
import {
  buildDomainChallenge,
  discountId,
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type AnalyticsSummaryDTO,
  type AnalyticsTimeframe,
  type CurrencyCode,
  type CustomDomainChallenge,
  type WorkspaceContext,
  type WorkspaceTaxSettings,
} from '@creatorhub/contracts'
import {
  affiliates,
  analytics,
  beneficiaryAccountsRepo,
  catalogue,
  commissions,
  discounts,
  orders,
  payoutsRepo,
  storefronts,
  workspaceMembers,
  workspaces,
  type RepositoryScope,
} from '@creatorhub/db'
import { authorise, type Permission, type WorkspaceRole } from '@creatorhub/domain'

import { referralUrl } from './affiliate-portal'
import { getAuthPool } from './auth'
import { getDatabase } from './db'
import { customDomainTarget } from './env'
import { cardFor, storeRecord, type PublicProductCard, type PublicStore } from './storefront-public'
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

export async function loadHome(
  rawWorkspaceId: string,
  timeframe: AnalyticsTimeframe = '30d',
): Promise<HomeData> {
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

// ---------------------------------------------------------------------------
// Storefront editor
// ---------------------------------------------------------------------------

export type StorefrontEditorData = {
  readonly store: PublicStore
  readonly products: readonly PublicProductCard[]
  readonly status: 'draft' | 'published' | 'suspended'
  readonly domain: {
    readonly domain: string | null
    readonly status: 'pending' | 'verified' | 'failed'
    readonly challenge: CustomDomainChallenge | null
  }
}

export async function loadStorefrontEditor(
  rawWorkspaceId: string,
): Promise<StorefrontEditorData | null> {
  return asMember(rawWorkspaceId, 'storefront.manage', async (scope) => {
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    const store = await storeRecord(scope, false)
    if (!sf || !store) return null
    const listed = (await catalogue.listProducts(scope, { status: 'published' })).filter(
      (p) => p.visibility === 'public',
    )
    const products: PublicProductCard[] = []
    for (const product of listed) products.push(await cardFor(scope, product))
    return {
      store,
      products,
      status: sf.status,
      domain: {
        domain: sf.customDomain,
        status: sf.customDomainStatus,
        challenge:
          sf.customDomain && sf.customDomainVerificationToken
            ? buildDomainChallenge(
                sf.customDomain,
                sf.customDomainVerificationToken,
                customDomainTarget(),
              )
            : null,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export type DiscountRow = {
  readonly id: string
  readonly code: string
  readonly type: 'percentage' | 'fixed_amount'
  readonly value: string
  readonly currency: string | null
  readonly maxUses: number | null
  readonly usesCount: number
  readonly startsAt: string | null
  readonly expiresAt: string | null
  readonly minOrderAmount: string | null
  readonly isActive: boolean
  readonly productTitles: readonly string[]
  readonly createdAt: string
}

export type DiscountsData = {
  readonly discounts: readonly DiscountRow[]
  readonly products: readonly { readonly id: string; readonly title: string }[]
}

export async function loadDiscounts(rawWorkspaceId: string): Promise<DiscountsData> {
  return asMember(rawWorkspaceId, 'discount.manage', async (scope) => {
    const allProducts = (await catalogue.listProducts(scope)).filter((p) => p.status !== 'archived')
    const titles = new Map(allProducts.map((p) => [p.id, p.title]))
    const rows = await discounts.listDiscounts(scope)
    const result: DiscountRow[] = []
    for (const d of rows) {
      const productIds = await discounts.listApplicableProductIdsForDiscount(
        scope,
        discountId(d.id),
      )
      result.push({
        id: d.id,
        code: d.code,
        type: d.discountType,
        value: d.discountValue.toString(),
        currency: d.currency,
        maxUses: d.maxUses,
        usesCount: d.usesCount,
        startsAt: d.startsAt?.toISOString() ?? null,
        expiresAt: d.expiresAt?.toISOString() ?? null,
        minOrderAmount: d.minOrderAmount?.toString() ?? null,
        isActive: d.isActive,
        productTitles: productIds.map((id) => titles.get(id) ?? 'Removed product'),
        createdAt: d.createdAt.toISOString(),
      })
    }
    return { discounts: result, products: allProducts.map((p) => ({ id: p.id, title: p.title })) }
  })
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type SettingsMember = {
  readonly userId: string
  readonly name: string
  readonly email: string
  readonly role: WorkspaceRole
  readonly joinedAt: string
}

export type SettingsData = {
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly currency: string
    readonly platformFeeBps: number
  }
  readonly taxSettings: WorkspaceTaxSettings
  readonly members: readonly SettingsMember[]
  readonly currentUserId: string
  readonly role: WorkspaceRole
}

export async function loadSettings(rawWorkspaceId: string): Promise<SettingsData> {
  const loaded = await asMember(rawWorkspaceId, 'workspace.view', async (scope) => {
    const ws = await workspaces.findCurrentWorkspace(scope)
    if (!ws) notFound()
    const members = await workspaceMembers.listMembers(scope)
    return { ws, members, access: scope.access }
  })

  // Names and emails live in the auth database, read with its own role.
  const rows = await getAuthPool()
    .query<{ id: string; email: string; name: string | null }>(
      'SELECT id, email, name FROM users WHERE id = ANY($1)',
      [loaded.members.map((m) => m.userId)],
    )
    .then((result) => result.rows)
  const users = new Map(rows.map((u) => [u.id, u]))
  const order: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2 }

  return {
    workspace: {
      id: loaded.ws.id,
      name: loaded.ws.name,
      slug: loaded.ws.slug,
      currency: loaded.ws.defaultCurrency,
      platformFeeBps: loaded.ws.platformFeeBps,
    },
    taxSettings: loaded.ws.taxSettings,
    members: loaded.members
      .map((m) => ({
        userId: m.userId,
        name:
          users.get(m.userId)?.name ?? users.get(m.userId)?.email.split('@')[0] ?? 'Invited member',
        email: users.get(m.userId)?.email ?? '',
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      }))
      .sort((a, b) => order[a.role] - order[b.role] || a.joinedAt.localeCompare(b.joinedAt)),
    currentUserId: loaded.access.session.userId,
    role: loaded.access.role as WorkspaceRole,
  }
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

export type AffiliateRowData = {
  readonly id: string
  readonly name: string | null
  readonly email: string
  readonly status: string
  readonly code: string | null
  readonly referralUrl: string | null
  readonly commissionBps: number
  readonly isCustomRate: boolean
  readonly clicks: number
  readonly conversions: number
  readonly saleTotal: string
  readonly held: string
  readonly payable: string
  readonly paid: string
  readonly hasPayoutAccount: boolean
}

export type AffiliatesData = {
  readonly program: {
    readonly isActive: boolean
    readonly commissionBps: number
    readonly cookieWindowDays: number
  }
  readonly affiliates: readonly AffiliateRowData[]
  readonly totals: {
    readonly clicks: number
    readonly conversions: number
    readonly referredSales: string
    readonly commissionOwed: string
  }
  readonly recent: readonly {
    readonly id: string
    readonly affiliateName: string
    readonly orderId: string
    readonly saleAmount: string
    readonly amount: string
    readonly status: string
    readonly heldUntil: string
    readonly createdAt: string
  }[]
}

export async function loadAffiliates(rawWorkspaceId: string): Promise<AffiliatesData> {
  return asMember(rawWorkspaceId, 'affiliate.view', async (scope) => {
    await commissions.releaseHeldCommissions(scope, new Date())
    const [program, rows, links, { items: comms }] = await Promise.all([
      affiliates.getAffiliateProgram(scope),
      affiliates.listAffiliates(scope, { limit: 500 }),
      affiliates.listAffiliateLinks(scope),
      commissions.listWorkspaceCommissions(scope),
    ])
    const defaultBps = program?.defaultCommissionBps ?? 2000
    const subdomain = scope.access.storefront?.subdomain

    const byAffiliate = new Map<
      string,
      { held: bigint; payable: bigint; paid: bigint; sales: bigint }
    >()
    for (const c of comms) {
      const agg = byAffiliate.get(c.affiliateId) ?? { held: 0n, payable: 0n, paid: 0n, sales: 0n }
      if (c.status === 'held') agg.held += c.netAmount
      if (c.status === 'vested') agg.payable += c.netAmount
      if (c.status === 'paid') agg.paid += c.netAmount
      if (c.status !== 'clawed_back') agg.sales += c.grossSaleAmount
      byAffiliate.set(c.affiliateId, agg)
    }
    const names = new Map(rows.map((a) => [a.id, a.name ?? a.email]))

    const list: AffiliateRowData[] = rows.map((a) => {
      const link = links.find((l) => l.affiliateId === a.id)
      const agg = byAffiliate.get(a.id) ?? { held: 0n, payable: 0n, paid: 0n, sales: 0n }
      return {
        id: a.id,
        name: a.name,
        email: a.email,
        status: a.status,
        code: link?.code ?? null,
        referralUrl: link && subdomain ? referralUrl(subdomain, link.code) : null,
        commissionBps: a.customCommissionBps ?? defaultBps,
        isCustomRate: a.customCommissionBps !== null,
        clicks: link?.clicksCount ?? 0,
        conversions: link?.conversionsCount ?? a.totalConversions,
        saleTotal: agg.sales.toString(),
        held: agg.held.toString(),
        payable: agg.payable.toString(),
        paid: agg.paid.toString(),
        hasPayoutAccount:
          Object.keys((a.payoutAccount as Record<string, unknown> | null) ?? {}).length > 0,
      }
    })

    let owed = 0n
    let sales = 0n
    for (const agg of byAffiliate.values()) {
      owed += agg.held + agg.payable
      sales += agg.sales
    }

    return {
      program: {
        isActive: program?.isActive ?? false,
        commissionBps: defaultBps,
        cookieWindowDays: program?.cookieWindowDays ?? 30,
      },
      affiliates: list,
      totals: {
        clicks: list.reduce((sum, a) => sum + a.clicks, 0),
        conversions: list.reduce((sum, a) => sum + a.conversions, 0),
        referredSales: sales.toString(),
        commissionOwed: owed.toString(),
      },
      recent: comms.slice(0, 25).map((c) => ({
        id: c.id,
        affiliateName: names.get(c.affiliateId) ?? 'Affiliate',
        orderId: c.orderId,
        saleAmount: c.grossSaleAmount.toString(),
        amount: c.netAmount.toString(),
        status: c.status,
        heldUntil: c.heldUntil.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    }
  })
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export type PayoutAccountRow = {
  readonly id: string
  readonly holder: string
  readonly kind: 'vpa' | 'bank_account'
  readonly display: string
  readonly isDefault: boolean
  readonly createdAt: string
}

export type PayoutRow = {
  readonly id: string
  readonly amount: string
  readonly status: string
  readonly account: string
  readonly requestedBy: string
  readonly requestedAt: string
  readonly approvedAt: string | null
  readonly completedAt: string | null
  readonly reference: string | null
  readonly failureReason: string | null
}

export type PayoutsData = {
  readonly currency: string
  readonly balance: {
    readonly available: string
    readonly pending: string
    readonly inTransit: string
    readonly settled: string
    readonly minimum: string
  }
  readonly accounts: readonly PayoutAccountRow[]
  readonly payouts: readonly PayoutRow[]
  readonly currentUserId: string
  readonly role: WorkspaceRole
  readonly memberCount: number
  readonly emailVerified: boolean
}

export async function loadPayouts(rawWorkspaceId: string): Promise<PayoutsData> {
  return asMember(rawWorkspaceId, 'payout.view', async (scope) => {
    const currencyCode = scope.access.workspace.currency as CurrencyCode
    const [balance, accounts, list, members] = await Promise.all([
      payoutsRepo.getPayoutBalanceOverview(scope, currencyCode),
      beneficiaryAccountsRepo.listBeneficiaryAccounts(scope, { payeeType: 'workspace' }),
      payoutsRepo.listPayouts(scope, { limit: 50, offset: 0 }),
      workspaceMembers.listMembers(scope),
    ])
    const describe = (a: {
      accountType: string
      vpa: string | null
      maskedAccountNumber: string | null
    }) =>
      a.accountType === 'vpa' ? (a.vpa ?? 'UPI') : `Bank ${a.maskedAccountNumber ?? ''}`.trim()
    return {
      currency: currencyCode,
      balance: {
        available: balance.availableBalanceMinor,
        pending: balance.pendingApprovalMinor,
        inTransit: balance.inTransitBalanceMinor,
        settled: balance.lifetimeSettledMinor,
        minimum: balance.minimumPayoutMinor,
      },
      accounts: accounts.map((a) => ({
        id: a.id,
        holder: a.accountHolderName,
        kind: a.accountType as 'vpa' | 'bank_account',
        display: describe(a),
        isDefault: a.isDefault,
        createdAt: a.createdAt.toISOString(),
      })),
      payouts: list.map((p) => ({
        id: p.id,
        amount: p.amount.toString(),
        status: p.status,
        account: p.beneficiary ? describe(p.beneficiary) : 'Removed account',
        requestedBy: p.requestedBy,
        requestedAt: p.createdAt.toISOString(),
        approvedAt: p.approvedAt?.toISOString() ?? null,
        completedAt: p.completedAt?.toISOString() ?? null,
        reference: p.providerPayoutId,
        failureReason: p.failureReason,
      })),
      currentUserId: scope.access.session.userId,
      role: scope.access.role as WorkspaceRole,
      memberCount: members.length,
      emailVerified: scope.access.session.user.emailVerified ?? false,
    }
  })
}
