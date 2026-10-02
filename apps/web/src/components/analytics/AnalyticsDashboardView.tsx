'use client'

/**
 * Analytics Dashboard & AI Business Intelligence View (Slice 10 §10.1, §10.2, §10.3, §10.9).
 *
 * Responsibilities:
 * 1. Visualizes ledger-derived financial metrics across multiple timeframes.
 * 2. Renders interactive SVG revenue time-series and conversion funnel.
 * 3. 1-Click AI Executive Growth Briefing powered by versioned prompt templates.
 * 4. Product and promoter performance matrices with sanitized CSV export.
 * 5. Token quota and cost accounting telemetry.
 */
import { useCallback, useState } from 'react'
import { Button, useToast } from '@creatorhub/ui'
import type {
  AffiliatePerformanceDTO,
  AnalyticsInsightsOutput,
  AnalyticsSummaryDTO,
  AnalyticsTimeframe,
  ProductPerformanceDTO,
} from '@creatorhub/contracts'

import {
  exportAnalyticsCsvAction,
  getAffiliatePerformanceAction,
  getProductPerformanceAction,
  getWorkspaceAnalyticsAction,
} from '../../lib/analytics-actions'
import { generateAnalyticsInsightsAction } from '../../lib/ai-actions'

export type AnalyticsDashboardViewProps = {
  readonly workspaceId: string
  readonly initialSummary: AnalyticsSummaryDTO
  readonly initialProducts: readonly ProductPerformanceDTO[]
  readonly initialAffiliates: readonly AffiliatePerformanceDTO[]
}

const TIMEFRAME_OPTIONS: readonly { value: AnalyticsTimeframe; label: string }[] = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' },
]

function formatCurrency(minorUnits: string | bigint, curr = 'INR'): string {
  const num = Number(minorUnits) / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: curr,
    maximumFractionDigits: 2,
  }).format(num)
}

export function AnalyticsDashboardView({
  workspaceId,
  initialSummary,
  initialProducts,
  initialAffiliates,
}: AnalyticsDashboardViewProps) {
  const toast = useToast()

  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>(initialSummary.timeframe)
  const [summary, setSummary] = useState<AnalyticsSummaryDTO>(initialSummary)
  const [productsList, setProductsList] = useState<readonly ProductPerformanceDTO[]>(initialProducts)
  const [affiliatesList, setAffiliatesList] = useState<readonly AffiliatePerformanceDTO[]>(initialAffiliates)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // AI Briefing State
  const [aiInsights, setAiInsights] = useState<AnalyticsInsightsOutput | null>(null)
  const [generatingAi, setGeneratingAi] = useState(false)

  // Performance Tab
  const [activeTab, setActiveTab] = useState<'products' | 'affiliates'>('products')

  const handleTimeframeChange = useCallback(
    async (newTf: AnalyticsTimeframe) => {
      setTimeframe(newTf)
      setLoading(true)
      try {
        const [sumRes, prodRes, affRes] = await Promise.all([
          getWorkspaceAnalyticsAction(workspaceId, newTf),
          getProductPerformanceAction(workspaceId, newTf),
          getAffiliatePerformanceAction(workspaceId, newTf),
        ])

        if (sumRes.ok) setSummary(sumRes.data)
        if (prodRes.ok) setProductsList(prodRes.data)
        if (affRes.ok) setAffiliatesList(affRes.data)
      } catch {
        toast.show({
          title: 'Error loading analytics',
          description: 'Failed to refresh analytics for the selected timeframe.',
          variant: 'critical',
        })
      } finally {
        setLoading(false)
      }
    },
    [workspaceId, toast],
  )

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const res = await exportAnalyticsCsvAction(workspaceId, timeframe)
      if (!res.ok) {
        toast.show({
          title: 'Export failed',
          description: res.error.message,
          variant: 'critical',
        })
        setExporting(false)
        return
      }

      const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.show({
        title: 'CSV exported',
        description: `Exported ${summary.timeSeries.length} daily rows.`,
        variant: 'success',
      })
    } catch {
      toast.show({
        title: 'Export error',
        description: 'An unexpected error occurred while exporting CSV.',
        variant: 'critical',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleGenerateAiBriefing = async () => {
    setGeneratingAi(true)
    try {
      const res = await generateAnalyticsInsightsAction(workspaceId, timeframe)
      if (!res.ok) {
        toast.show({
          title: 'AI Generation Failed',
          description: res.error.message,
          variant: 'critical',
        })
        setGeneratingAi(false)
        return
      }

      setAiInsights(res.data)
      toast.show({
        title: 'Executive briefing ready',
        description: 'AI analyzed your latest business metrics and strategic drivers.',
        variant: 'success',
      })
    } catch {
      toast.show({
        title: 'AI Error',
        description: 'Unable to connect to AI engine.',
        variant: 'critical',
      })
    } finally {
      setGeneratingAi(false)
    }
  }

  // Calculate chart max height
  const maxRevenue = Math.max(
    ...summary.timeSeries.map((d) => Number(d.grossRevenueMinor)),
    1000,
  )

  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* Top Header & Timeframe Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Analytics & Business Intelligence
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Ledger-derived revenue, conversion telemetry, and executive growth insights.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {TIMEFRAME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  void handleTimeframeChange(opt.value)
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  timeframe === opt.value
                    ? 'bg-neutral-900 text-white shadow-xs dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              void handleExportCsv()
            }}
            disabled={exporting}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Gross GMV */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Gross Volume (GMV)
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              Ledger verified
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {formatCurrency(summary.grossRevenueMinor, summary.currency)}
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Across {summary.ordersCount} total orders
            </p>
          </div>
        </div>

        {/* Net Creator Sales */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Net Creator Sales
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              After refunds
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {formatCurrency(summary.netRevenueMinor, summary.currency)}
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Refunds: {formatCurrency(summary.refundsMinor, summary.currency)} (
              {(summary.refundRateBps / 100).toFixed(2)}%)
            </p>
          </div>
        </div>

        {/* Average Order Value */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Average Order Value
            </span>
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              AOV
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {formatCurrency(summary.averageOrderValueMinor, summary.currency)}
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Per paying customer transaction
            </p>
          </div>
        </div>

        {/* Storefront Conversion Rate */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200/80 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Storefront Conversion
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              Funnel
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {(summary.conversionRateBps / 100).toFixed(2)}%
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {summary.uniqueVisitorsCount} unique visitors · {summary.storefrontPageviewsCount} views
            </p>
          </div>
        </div>
      </div>

      {/* AI Growth Briefing & Executive Insights */}
      <section
        aria-labelledby="ai-briefing-heading"
        className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/40 p-6 shadow-xs dark:border-violet-900/60 dark:from-violet-950/30 dark:via-neutral-900 dark:to-indigo-950/20"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-xs">
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h2 id="ai-briefing-heading" className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                AI Executive Growth Briefing
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Real-time analysis of revenue momentum, visitor funnels, and high-impact actions.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="small"
            onClick={() => {
              void handleGenerateAiBriefing()
            }}
            disabled={generatingAi}
          >
            {generatingAi ? 'Analyzing Metrics...' : aiInsights ? 'Refresh Briefing' : 'Generate Briefing'}
          </Button>
        </div>

        {aiInsights ? (
          <div className="mt-6 flex flex-col gap-5 border-t border-violet-200/60 pt-6 dark:border-violet-900/40">
            {/* Executive Summary Quote */}
            <div className="rounded-xl border border-violet-200 bg-white/80 p-4 shadow-xs dark:border-violet-800/40 dark:bg-neutral-900/80">
              <p className="text-sm font-medium leading-relaxed text-neutral-800 dark:text-neutral-200">
                "{aiInsights.executiveSummary}"
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-400">
                <span>🚀 Key Growth Driver:</span>
                <span className="font-normal text-neutral-700 dark:text-neutral-300">
                  {aiInsights.keyDriver}
                </span>
              </div>
            </div>

            {/* Strategic Recommendations */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Recommended High-Impact Actions
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {aiInsights.growthActions.map((action, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-lg border border-neutral-200 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {idx + 1}
                      </span>
                      <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                        {action}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk profile */}
            {aiInsights.riskAlert ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠️ <strong>Risk Alert:</strong> {aiInsights.riskAlert}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                <span>✓ Healthy risk profile: Refund rates and checkout abandonment are within normal ranges.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-violet-200 bg-white/40 p-6 text-center dark:border-violet-900/60 dark:bg-neutral-900/40">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Click <strong>Generate Briefing</strong> to translate your numbers into clear, plain-language business insights and strategic growth tactics.
            </p>
          </div>
        )}
      </section>

      {/* Revenue Time-Series Chart */}
      <section
        aria-labelledby="revenue-chart-heading"
        className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="revenue-chart-heading" className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Revenue & Order Trends
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Daily revenue velocity and volume over the selected period.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500" /> Gross GMV
            </span>
          </div>
        </div>

        {summary.timeSeries.length > 0 ? (
          <div className="mt-6 flex h-60 items-end gap-2 border-b border-neutral-200 pt-4 pb-2 dark:border-neutral-800">
            {summary.timeSeries.map((d) => {
              const heightPercent = Math.max(
                8,
                Math.round((Number(d.grossRevenueMinor) / maxRevenue) * 100),
              )
              return (
                <div
                  key={d.date}
                  className="group relative flex flex-1 flex-col items-center justify-end h-full"
                >
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-12 z-10 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white shadow-md group-hover:block dark:bg-neutral-100 dark:text-neutral-900">
                    <div>{d.date}</div>
                    <div>{formatCurrency(d.grossRevenueMinor, summary.currency)} ({d.ordersCount} orders)</div>
                  </div>

                  {/* Bar */}
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full max-w-[28px] rounded-t-md bg-emerald-500 transition-all hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  />
                  <span className="mt-2 text-[10px] font-mono text-neutral-400">
                    {d.date.split('-').slice(1).join('/')}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-6 flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800">
            No completed orders in this period yet.
          </div>
        )}
      </section>

      {/* Conversion Funnel */}
      <section
        aria-labelledby="funnel-heading"
        className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h2 id="funnel-heading" className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Conversion Funnel
        </h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Visitor journey progression from initial storefront landing to completed order.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
          {summary.funnel.map((step, idx) => (
            <div
              key={step.step}
              className="relative flex flex-col justify-between rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-950/40"
            >
              <div>
                <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                  Step {idx + 1}
                </span>
                <h3 className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {step.label}
                </h3>
              </div>

              <div className="mt-4">
                <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  {step.count.toLocaleString()}
                </div>
                {step.dropoffRateBps > 0 && (
                  <span className="mt-1 inline-block text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    ↓ {(step.dropoffRateBps / 100).toFixed(1)}% drop-off
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Performance Matrix Tabs */}
      <section
        aria-labelledby="performance-tables-heading"
        className="rounded-xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'products'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              Product Performance ({productsList.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('affiliates')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                activeTab === 'affiliates'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              Top Affiliates ({affiliatesList.length})
            </button>
          </div>
        </div>

        {activeTab === 'products' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-500 uppercase tracking-wider dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-2 font-medium">Product</th>
                  <th className="py-3 px-2 font-medium text-right">Units Sold</th>
                  <th className="py-3 px-2 font-medium text-right">Gross Revenue</th>
                  <th className="py-3 px-2 font-medium text-right">Refund Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {productsList.length > 0 ? (
                  productsList.map((p) => (
                    <tr key={p.productId} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-2 font-medium text-neutral-900 dark:text-neutral-100">
                        {p.productTitle}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-neutral-700 dark:text-neutral-300">
                        {p.unitsSold}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.grossRevenueMinor, summary.currency)}
                      </td>
                      <td className="py-3 px-2 text-right text-neutral-500">
                        {(p.refundRateBps / 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-neutral-400">
                      No product sales in this timeframe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 text-neutral-500 uppercase tracking-wider dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-2 font-medium">Promoter</th>
                  <th className="py-3 px-2 font-medium text-right">Clicks</th>
                  <th className="py-3 px-2 font-medium text-right">Conversions</th>
                  <th className="py-3 px-2 font-medium text-right">Referred Sales</th>
                  <th className="py-3 px-2 font-medium text-right">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {affiliatesList.length > 0 ? (
                  affiliatesList.map((a) => (
                    <tr key={a.affiliateId} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-2">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {a.name ?? a.email}
                        </div>
                        <div className="text-[11px] text-neutral-400">{a.email}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-neutral-700 dark:text-neutral-300">
                        {a.clicksCount}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-neutral-700 dark:text-neutral-300">
                        {a.conversionsCount}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-medium text-neutral-900 dark:text-neutral-100">
                        {formatCurrency(a.grossReferredSalesMinor, summary.currency)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(a.commissionsAccruedMinor, summary.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-400">
                      No active promoter referrals in this timeframe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
