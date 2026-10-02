/**
 * Analytics Contracts & DTOs (Slice 10 §10.1, §10.2, §10.3).
 *
 * Responsibilities:
 * 1. Timeframe filters and aggregated financial performance metrics.
 * 2. Time-series data points for charts.
 * 3. Product and affiliate performance matrix structures.
 */
import { z } from 'zod'

export const ANALYTICS_TIMEFRAMES = ['7d', '30d', '90d', 'ytd', 'all'] as const
export type AnalyticsTimeframe = (typeof ANALYTICS_TIMEFRAMES)[number]
export const analyticsTimeframeSchema = z.enum(ANALYTICS_TIMEFRAMES)

export type TimeSeriesDataPoint = {
  readonly date: string // YYYY-MM-DD
  readonly grossRevenueMinor: string
  readonly netRevenueMinor: string
  readonly refundsMinor: string
  readonly ordersCount: number
  readonly visitorsCount: number
}

export type FunnelStepDTO = {
  readonly step: 'visitors' | 'product_views' | 'checkout_initiated' | 'orders_paid'
  readonly label: string
  readonly count: number
  readonly dropoffRateBps: number
}

export type AnalyticsSummaryDTO = {
  readonly timeframe: AnalyticsTimeframe
  readonly currency: string
  readonly grossRevenueMinor: string
  readonly netRevenueMinor: string
  readonly refundsMinor: string
  readonly refundRateBps: number
  readonly taxCollectedMinor: string
  readonly affiliateExpenseMinor: string
  readonly platformFeesMinor: string
  readonly ordersCount: number
  readonly averageOrderValueMinor: string
  readonly uniqueVisitorsCount: number
  readonly storefrontPageviewsCount: number
  readonly conversionRateBps: number
  readonly timeSeries: readonly TimeSeriesDataPoint[]
  readonly funnel: readonly FunnelStepDTO[]
}

export type ProductPerformanceDTO = {
  readonly productId: string
  readonly productTitle: string
  readonly productSlug: string
  readonly unitsSold: number
  readonly grossRevenueMinor: string
  readonly netRevenueMinor: string
  readonly refundsCount: number
  readonly refundRateBps: number
  readonly conversionRateBps: number
}

export type AffiliatePerformanceDTO = {
  readonly affiliateId: string
  readonly name: string | null
  readonly email: string
  readonly clicksCount: number
  readonly conversionsCount: number
  readonly conversionRateBps: number
  readonly grossReferredSalesMinor: string
  readonly commissionsAccruedMinor: string
}
