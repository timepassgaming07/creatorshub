/**
 * Analytics Repository (Slice 10 §10.1, §10.2, §10.3).
 *
 * Responsibilities:
 * 1. Derives financial performance metrics strictly from ledger and transactional order records.
 * 2. Aggregates storefront telemetry events into visitor counts and conversion funnel steps.
 * 3. Builds time-series data points for visual revenue and order charts.
 * 4. Itemizes product and affiliate performance tables with CSV export support.
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type {
  AffiliatePerformanceDTO,
  AnalyticsSummaryDTO,
  AnalyticsTimeframe,
  FunnelStepDTO,
  ProductPerformanceDTO,
  TimeSeriesDataPoint,
} from '@creatorhub/contracts'

import { scoped, type RepositoryScope } from '../repository.js'
import {
  affiliateClicks,
  affiliates,
  commissions,
  ledgerAccounts,
  ledgerEntries,
  orderItems,
  orders,
  products,
  refunds,
  storefrontEvents,
  workspaces,
} from '../schema/index.js'

function calculateNetSales(grossSalesMinor: bigint, refundsMinor: bigint): bigint {
  if (refundsMinor >= grossSalesMinor) return 0n
  return grossSalesMinor - refundsMinor
}

function calculateRefundRateBps(grossSalesMinor: bigint, refundsMinor: bigint): number {
  if (grossSalesMinor <= 0n || refundsMinor <= 0n) return 0
  if (refundsMinor >= grossSalesMinor) return 10000
  return Number((refundsMinor * 10000n) / grossSalesMinor)
}

function calculateConversionRateBps(visitorsCount: number, ordersCount: number): number {
  if (visitorsCount <= 0 || ordersCount <= 0) return 0
  if (ordersCount >= visitorsCount) return 10000
  return Math.round((ordersCount / visitorsCount) * 10000)
}

function calculateAverageOrderValue(grossSalesMinor: bigint, ordersCount: number): bigint {
  if (ordersCount <= 0 || grossSalesMinor <= 0n) return 0n
  return grossSalesMinor / BigInt(ordersCount)
}

function calculateDropoffRateBps(previousStepCount: number, currentStepCount: number): number {
  if (previousStepCount <= 0) return 0
  if (currentStepCount >= previousStepCount) return 0
  return Math.round(((previousStepCount - currentStepCount) / previousStepCount) * 10000)
}

function resolveTimeframeStartDate(timeframe: AnalyticsTimeframe = '30d'): Date {
  const now = new Date()
  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case 'ytd':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
    case 'all':
    default:
      return new Date(0)
  }
}

/** Orders that were paid, including ones refunded since. */
const SOLD_STATUSES = ['paid', 'partially_refunded', 'refunded'] as const

/** One day per point from `from` to today, so a quiet day plots as zero. */
function eachDay(from: Date, to: Date): string[] {
  const days: string[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  while (cursor.getTime() <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

/**
 * The store's numbers for a period, all from recorded data: orders, refunds,
 * commissions, the platform fee as posted to the ledger, and storefront
 * events. Nothing is estimated; an empty store reads as zeros.
 */
export async function getWorkspaceAnalyticsSummary(
  scope: RepositoryScope,
  options: { readonly timeframe?: AnalyticsTimeframe } = {},
): Promise<AnalyticsSummaryDTO> {
  const timeframe = options.timeframe ?? '30d'
  const startDate = resolveTimeframeStartDate(timeframe)
  const sold = and(inArray(orders.status, [...SOLD_STATUSES]), gte(orders.createdAt, startDate))
  const day = (column: unknown) => sql<string>`to_char(date_trunc('day', ${column} at time zone 'UTC'), 'YYYY-MM-DD')`

  const [[orderAgg], [refundAgg], [commAgg], [feeAgg], [telemetry], [ws], orderDays, refundDays, visitorDays] =
    await Promise.all([
      scope.tx
        .select({
          gross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
          tax: sql<string>`coalesce(sum(${orders.taxAmount}), 0)::text`,
          count: sql<number>`count(*)::int`,
          first: sql<Date | null>`min(${orders.createdAt})`,
        })
        .from(orders)
        .where(scoped(scope, orders, sold)),
      scope.tx
        .select({ total: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
        .from(refunds)
        .where(scoped(scope, refunds, eq(refunds.status, 'succeeded'), gte(refunds.createdAt, startDate))),
      scope.tx
        .select({ total: sql<string>`coalesce(sum(${commissions.netAmount}), 0)::text` })
        .from(commissions)
        .where(scoped(scope, commissions, gte(commissions.createdAt, startDate))),
      scope.tx
        .select({
          total: sql<string>`coalesce(sum(case when ${ledgerEntries.direction} = 'credit' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)::text`,
        })
        .from(ledgerEntries)
        .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
        .where(
          scoped(
            scope,
            ledgerEntries,
            eq(ledgerAccounts.kind, 'platform_revenue'),
            gte(ledgerEntries.createdAt, startDate),
          ),
        ),
      scope.tx
        .select({
          visitors: sql<number>`count(distinct ${storefrontEvents.visitorSessionId})::int`,
          pageviews: sql<number>`count(case when ${storefrontEvents.eventType} = 'page_view' then 1 end)::int`,
          productViewers: sql<number>`count(distinct case when ${storefrontEvents.eventType} = 'product_view' then ${storefrontEvents.visitorSessionId} end)::int`,
          checkoutStarters: sql<number>`count(distinct case when ${storefrontEvents.eventType} = 'checkout_started' then ${storefrontEvents.visitorSessionId} end)::int`,
          first: sql<Date | null>`min(${storefrontEvents.createdAt})`,
        })
        .from(storefrontEvents)
        .where(scoped(scope, storefrontEvents, gte(storefrontEvents.createdAt, startDate))),
      scope.tx
        .select({ currency: workspaces.defaultCurrency })
        .from(workspaces)
        .where(eq(workspaces.id, scope.context.workspaceId))
        .limit(1),
      scope.tx
        .select({
          date: day(orders.createdAt),
          gross: sql<string>`coalesce(sum(${orders.totalAmount}), 0)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(scoped(scope, orders, sold))
        .groupBy(day(orders.createdAt)),
      scope.tx
        .select({ date: day(refunds.createdAt), total: sql<string>`coalesce(sum(${refunds.amount}), 0)::text` })
        .from(refunds)
        .where(scoped(scope, refunds, eq(refunds.status, 'succeeded'), gte(refunds.createdAt, startDate)))
        .groupBy(day(refunds.createdAt)),
      scope.tx
        .select({
          date: day(storefrontEvents.createdAt),
          visitors: sql<number>`count(distinct ${storefrontEvents.visitorSessionId})::int`,
        })
        .from(storefrontEvents)
        .where(scoped(scope, storefrontEvents, gte(storefrontEvents.createdAt, startDate)))
        .groupBy(day(storefrontEvents.createdAt)),
    ])

  const grossRevenueMinor = BigInt(orderAgg?.gross ?? '0')
  const taxCollectedMinor = BigInt(orderAgg?.tax ?? '0')
  const ordersCount = orderAgg?.count ?? 0
  const refundsMinor = BigInt(refundAgg?.total ?? '0')
  const affiliateExpenseMinor = BigInt(commAgg?.total ?? '0')
  const feeTotal = BigInt(feeAgg?.total ?? '0')
  const platformFeesMinor = feeTotal > 0n ? feeTotal : 0n
  const uniqueVisitorsCount = telemetry?.visitors ?? 0
  const productViewers = telemetry?.productViewers ?? 0
  const checkoutStarters = telemetry?.checkoutStarters ?? 0

  const funnel: FunnelStepDTO[] = [
    {
      step: 'visitors',
      label: 'Visited the store',
      count: uniqueVisitorsCount,
      dropoffRateBps: 0,
    },
    {
      step: 'product_views',
      label: 'Opened a product',
      count: productViewers,
      dropoffRateBps: calculateDropoffRateBps(uniqueVisitorsCount, productViewers),
    },
    {
      step: 'checkout_initiated',
      label: 'Started checkout',
      count: checkoutStarters,
      dropoffRateBps: calculateDropoffRateBps(productViewers, checkoutStarters),
    },
    {
      step: 'orders_paid',
      label: 'Paid',
      count: ordersCount,
      dropoffRateBps: calculateDropoffRateBps(checkoutStarters, ordersCount),
    },
  ]

  // The chart starts at the period start, or at the first activity for "all".
  const firstActivity = [orderAgg?.first, telemetry?.first]
    .filter((d): d is Date => d instanceof Date || typeof d === 'string')
    .map((d) => new Date(d))
    .sort((x, y) => x.getTime() - y.getTime())[0]
  const chartStart = timeframe === 'all' ? (firstActivity ?? new Date()) : startDate
  const salesBy = new Map(orderDays.map((r) => [r.date, r]))
  const refundsBy = new Map(refundDays.map((r) => [r.date, BigInt(r.total)]))
  const visitorsBy = new Map(visitorDays.map((r) => [r.date, r.visitors]))
  const timeSeries: TimeSeriesDataPoint[] = eachDay(chartStart, new Date()).map((date) => {
    const gross = BigInt(salesBy.get(date)?.gross ?? '0')
    const refunded = refundsBy.get(date) ?? 0n
    return {
      date,
      grossRevenueMinor: gross.toString(),
      netRevenueMinor: (gross - refunded).toString(),
      refundsMinor: refunded.toString(),
      ordersCount: salesBy.get(date)?.count ?? 0,
      visitorsCount: visitorsBy.get(date) ?? 0,
    }
  })

  return {
    timeframe,
    currency: ws?.currency ?? 'INR',
    grossRevenueMinor: grossRevenueMinor.toString(),
    netRevenueMinor: calculateNetSales(grossRevenueMinor, refundsMinor).toString(),
    refundsMinor: refundsMinor.toString(),
    refundRateBps: calculateRefundRateBps(grossRevenueMinor, refundsMinor),
    taxCollectedMinor: taxCollectedMinor.toString(),
    affiliateExpenseMinor: affiliateExpenseMinor.toString(),
    platformFeesMinor: platformFeesMinor.toString(),
    ordersCount,
    averageOrderValueMinor: calculateAverageOrderValue(grossRevenueMinor, ordersCount).toString(),
    uniqueVisitorsCount,
    storefrontPageviewsCount: telemetry?.pageviews ?? 0,
    conversionRateBps: Math.min(10000, calculateConversionRateBps(uniqueVisitorsCount, ordersCount)),
    timeSeries,
    funnel,
  }
}

/**
 * Sales per product in the period, from paid orders (including ones later
 * refunded, whose refunds are subtracted). Conversion is buyers over the
 * visitors who opened the product page.
 */
export async function listProductPerformance(
  scope: RepositoryScope,
  options: { readonly timeframe?: AnalyticsTimeframe } = {},
): Promise<readonly ProductPerformanceDTO[]> {
  const startDate = resolveTimeframeStartDate(options.timeframe ?? '30d')

  const refundTotals = scope.tx
    .select({
      orderId: refunds.orderId,
      refunded: sql<string>`sum(${refunds.amount})`.as('refunded'),
    })
    .from(refunds)
    .where(scoped(scope, refunds, eq(refunds.status, 'succeeded')))
    .groupBy(refunds.orderId)
    .as('refund_totals')

  const itemValue = sql`(${orderItems.subtotalAmount} - ${orderItems.discountAmount})`
  const [catalogue, sales, views] = await Promise.all([
    scope.tx
      .select({ id: products.id, title: products.title, slug: products.slug, status: products.status })
      .from(products)
      .where(scoped(scope, products)),
    scope.tx
      .select({
        productId: orderItems.productId,
        units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
        gross: sql<string>`coalesce(sum(${itemValue}), 0)::text`,
        refundedValue: sql<string>`coalesce(sum(${itemValue} * coalesce(${refundTotals.refunded}, 0) / nullif(${orders.totalAmount}, 0)), 0)::bigint::text`,
        refundedOrders: sql<number>`count(distinct case when coalesce(${refundTotals.refunded}, 0) > 0 then ${orders.id} end)::int`,
        orders: sql<number>`count(distinct ${orders.id})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(refundTotals, eq(refundTotals.orderId, orders.id))
      .where(
        scoped(
          scope,
          orderItems,
          inArray(orders.status, ['paid', 'partially_refunded', 'refunded']),
          gte(orders.createdAt, startDate),
        ),
      )
      .groupBy(orderItems.productId),
    scope.tx
      .select({
        productId: storefrontEvents.productId,
        visitors: sql<number>`count(distinct coalesce(${storefrontEvents.visitorSessionId}, ${storefrontEvents.id}::text))::int`,
      })
      .from(storefrontEvents)
      .where(
        scoped(
          scope,
          storefrontEvents,
          eq(storefrontEvents.eventType, 'product_view'),
          gte(storefrontEvents.createdAt, startDate),
        ),
      )
      .groupBy(storefrontEvents.productId),
  ])

  const salesBy = new Map(sales.map((r) => [r.productId, r]))
  const viewsBy = new Map(views.map((r) => [r.productId, r.visitors]))

  return catalogue
    .filter((p) => p.status !== 'archived' || salesBy.has(p.id))
    .map((p) => {
      const row = salesBy.get(p.id)
      const gross = BigInt(row?.gross ?? '0')
      const refunded = BigInt(row?.refundedValue ?? '0')
      const units = row?.units ?? 0
      const viewers = viewsBy.get(p.id) ?? 0
      return {
        productId: p.id,
        productTitle: p.title,
        productSlug: p.slug,
        unitsSold: units,
        grossRevenueMinor: gross.toString(),
        netRevenueMinor: calculateNetSales(gross, refunded).toString(),
        refundsCount: row?.refundedOrders ?? 0,
        refundRateBps: row && row.orders > 0 ? Math.round((row.refundedOrders * 10000) / row.orders) : 0,
        conversionRateBps: viewers > 0 ? Math.min(10000, Math.round(((row?.orders ?? 0) * 10000) / viewers)) : 0,
      }
    })
    .sort((a, b) => {
      const diff = BigInt(b.netRevenueMinor) - BigInt(a.netRevenueMinor)
      return diff === 0n ? b.unitsSold - a.unitsSold : diff > 0n ? 1 : -1
    })
}

/**
 * Affiliate results in the period: human clicks on their links, and the
 * commissions their referred sales earned.
 */
export async function listAffiliatePerformance(
  scope: RepositoryScope,
  options: { readonly timeframe?: AnalyticsTimeframe } = {},
): Promise<readonly AffiliatePerformanceDTO[]> {
  const startDate = resolveTimeframeStartDate(options.timeframe ?? '30d')

  const [people, clicks, earned] = await Promise.all([
    scope.tx
      .select({ id: affiliates.id, name: affiliates.name, email: affiliates.email })
      .from(affiliates)
      .where(scoped(scope, affiliates)),
    scope.tx
      .select({ affiliateId: affiliateClicks.affiliateId, clicks: sql<number>`count(*)::int` })
      .from(affiliateClicks)
      .where(
        scoped(
          scope,
          affiliateClicks,
          eq(affiliateClicks.isBot, false),
          gte(affiliateClicks.clickedAt, startDate),
        ),
      )
      .groupBy(affiliateClicks.affiliateId),
    scope.tx
      .select({
        affiliateId: commissions.affiliateId,
        conversions: sql<number>`count(*)::int`,
        sales: sql<string>`coalesce(sum(${commissions.grossSaleAmount}), 0)::text`,
        earned: sql<string>`coalesce(sum(${commissions.netAmount}), 0)::text`,
      })
      .from(commissions)
      .where(scoped(scope, commissions, gte(commissions.createdAt, startDate)))
      .groupBy(commissions.affiliateId),
  ])

  const clicksBy = new Map(clicks.map((r) => [r.affiliateId, r.clicks]))
  const earnedBy = new Map(earned.map((r) => [r.affiliateId, r]))

  return people
    .map((a) => {
      const c = clicksBy.get(a.id) ?? 0
      const e = earnedBy.get(a.id)
      const conversions = e?.conversions ?? 0
      return {
        affiliateId: a.id,
        name: a.name,
        email: a.email,
        clicksCount: c,
        conversionsCount: conversions,
        conversionRateBps: calculateConversionRateBps(c, conversions),
        grossReferredSalesMinor: e?.sales ?? '0',
        commissionsAccruedMinor: e?.earned ?? '0',
      }
    })
    .sort((x, y) => {
      const diff = BigInt(y.commissionsAccruedMinor) - BigInt(x.commissionsAccruedMinor)
      return diff === 0n ? y.clicksCount - x.clicksCount : diff > 0n ? 1 : -1
    })
}

/**
 * Where store visits come from: the utm_source when the link carried one,
 * otherwise the referring site's host, otherwise "Direct".
 */
export async function listTrafficSources(
  scope: RepositoryScope,
  options: { readonly timeframe?: AnalyticsTimeframe; readonly limit?: number } = {},
): Promise<readonly { readonly source: string; readonly visits: number }[]> {
  const startDate = resolveTimeframeStartDate(options.timeframe ?? '30d')
  const source = sql<string>`coalesce(
    nullif(lower(${storefrontEvents.utmSource}), ''),
    nullif(regexp_replace(lower(substring(${storefrontEvents.referrer} from '^https?://([^/:?#]+)')), '^www\\.', ''), ''),
    'direct'
  )`
  const rows = await scope.tx
    .select({ source, visits: sql<number>`count(*)::int` })
    .from(storefrontEvents)
    .where(
      scoped(
        scope,
        storefrontEvents,
        eq(storefrontEvents.eventType, 'page_view'),
        gte(storefrontEvents.createdAt, startDate),
      ),
    )
    .groupBy(source)
    .orderBy(desc(sql`count(*)`))
    .limit(options.limit ?? 8)
  return rows
}
