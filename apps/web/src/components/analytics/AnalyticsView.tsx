'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Download } from 'lucide-react'
import type { AnalyticsTimeframe } from '@creatorhub/contracts'
import { Button, useToast } from '@creatorhub/ui'

import { AreaChart } from '@/components/charts/AreaChart'
import { BarList } from '@/components/charts/BarList'
import {
  Card,
  CardHeader,
  DetailList,
  EmptyState,
  PageHeader,
  Segmented,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { exportAnalyticsCsvAction } from '@/lib/analytics-actions'
import type { AnalyticsData } from '@/lib/dashboard-data'
import { downloadCsv } from '@/lib/download-csv'
import { formatAmount, formatAmountShort } from '@/lib/format'

const RANGE_LABEL: Record<AnalyticsTimeframe, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  ytd: 'this year',
  all: 'all time',
}

function pct(bps: number): string {
  return `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`
}

const SOURCE_LABEL: Record<string, string> = {
  direct: 'Direct or unknown',
  'instagram.com': 'Instagram',
  'l.instagram.com': 'Instagram',
  'youtube.com': 'YouTube',
  'm.youtube.com': 'YouTube',
  't.co': 'X (Twitter)',
  'x.com': 'X (Twitter)',
  'facebook.com': 'Facebook',
  'l.facebook.com': 'Facebook',
  'linkedin.com': 'LinkedIn',
  'google.com': 'Google',
  whatsapp: 'WhatsApp',
}

export function AnalyticsView({ data }: { readonly data: AnalyticsData }) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const { workspace } = useWorkspace()
  const [pending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)
  const { summary } = data
  const currency = summary.currency || workspace.currency
  const hasSales = summary.ordersCount > 0
  const hasTraffic = summary.uniqueVisitorsCount > 0 || summary.storefrontPageviewsCount > 0

  async function exportCsv() {
    setExporting(true)
    const result = await exportAnalyticsCsvAction(workspace.id, data.timeframe)
    setExporting(false)
    if (!result.ok) {
      toast.show({
        title: 'Export failed',
        description: 'Try again in a moment.',
        variant: 'critical',
      })
      return
    }
    downloadCsv(result.data.filename, result.data.csv)
  }

  const funnelMax = Math.max(...summary.funnel.map((s) => s.count), 1)

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`How your store is doing, ${RANGE_LABEL[data.timeframe]}.`}
        actions={
          <>
            <Segmented<AnalyticsTimeframe>
              label="Time range"
              size="small"
              value={data.timeframe}
              onChange={(value) => {
                startTransition(() => {
                  router.push(value === '30d' ? pathname : `${pathname}?range=${value}`)
                })
              }}
              options={[
                { value: '7d', label: '7D' },
                { value: '30d', label: '30D' },
                { value: '90d', label: '90D' },
                { value: 'ytd', label: 'YTD' },
                { value: 'all', label: 'All' },
              ]}
            />
            <Button
              variant="secondary"
              size="small"
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              <Download className="size-4" aria-hidden="true" />
              CSV
            </Button>
          </>
        }
      />

      <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Sales after refunds"
            value={formatAmount(summary.netRevenueMinor, currency, { compact: true })}
          />
          <Stat label="Orders" value={summary.ordersCount.toLocaleString('en-IN')} />
          <Stat label="Visitors" value={summary.uniqueVisitorsCount.toLocaleString('en-IN')} />
          <Stat label="Conversion" value={hasTraffic ? pct(summary.conversionRateBps) : '—'} />
        </div>

        {!hasSales && !hasTraffic ? (
          <EmptyState
            icon={<BarChart3 />}
            title="Nothing to chart yet"
            description="Visits and sales appear here as they happen. Share your store link, then come back."
          />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title="Sales" description="After refunds, per day" />
                <AreaChart
                  label={`Sales after refunds per day, ${RANGE_LABEL[data.timeframe]}`}
                  data={summary.timeSeries.map((p) => ({
                    date: p.date,
                    value: Number(BigInt(p.netRevenueMinor)),
                  }))}
                  formatValue={(v) => formatAmount(BigInt(Math.round(v)), currency)}
                  formatAxis={(v) => formatAmountShort(BigInt(Math.round(v)), currency)}
                />
              </Card>
              <Card>
                <CardHeader title="Visitors" description="Unique visitors to your store, per day" />
                <AreaChart
                  label={`Visitors per day, ${RANGE_LABEL[data.timeframe]}`}
                  data={summary.timeSeries.map((p) => ({ date: p.date, value: p.visitorsCount }))}
                  formatValue={(v) => `${Math.round(v).toLocaleString('en-IN')} visitors`}
                  formatAxis={(v) => Math.round(v).toLocaleString('en-IN')}
                />
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader title="Funnel" description="From a visit to a paid order" />
                <ol className="space-y-4">
                  {summary.funnel.map((step, index) => (
                    <li key={step.step}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-body">
                        <span>{step.label}</span>
                        <span className="font-medium tabular-nums">
                          {step.count.toLocaleString('en-IN')}
                          {index > 0 && step.dropoffRateBps > 0 && (
                            <span className="ml-2 text-caption font-normal text-content-tertiary">
                              −{pct(step.dropoffRateBps)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-sunken">
                        <div
                          className="h-2 rounded-full bg-accent"
                          style={{
                            width: `${Math.max(2, (step.count / funnelMax) * 100).toFixed(1)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>

              <Card>
                <CardHeader title="Traffic sources" description="Where visitors came from" />
                <BarList
                  emptyLabel="No visits recorded yet."
                  items={data.sources.map((s) => ({
                    key: s.source,
                    label: SOURCE_LABEL[s.source] ?? s.source,
                    value: s.visits,
                    display: s.visits.toLocaleString('en-IN'),
                  }))}
                />
              </Card>

              <Card>
                <CardHeader
                  title="Breakdown"
                  description={`Orders placed ${RANGE_LABEL[data.timeframe]}`}
                />
                <DetailList
                  items={[
                    {
                      label: 'Gross sales',
                      value: formatAmount(summary.grossRevenueMinor, currency),
                    },
                    { label: 'Refunds', value: `−${formatAmount(summary.refundsMinor, currency)}` },
                    {
                      label: 'GST collected',
                      value: `−${formatAmount(summary.taxCollectedMinor, currency)}`,
                    },
                    {
                      label: 'Affiliate commission',
                      value: `−${formatAmount(summary.affiliateExpenseMinor, currency)}`,
                    },
                    {
                      label: 'CreatorHub fee',
                      value: `−${formatAmount(summary.platformFeesMinor, currency)}`,
                    },
                    {
                      label: 'Average order',
                      value: formatAmount(summary.averageOrderValueMinor, currency),
                    },
                  ]}
                />
              </Card>
            </div>

            <Card padded={false}>
              <div className="p-5 pb-3 sm:p-6 sm:pb-3">
                <CardHeader className="mb-0" title="Products" description="Ranked by revenue" />
              </div>
              {data.products.length === 0 ? (
                <p className="px-6 pb-6 text-body text-content-secondary">
                  No product sales in this period.
                </p>
              ) : (
                <Table className="rounded-none border-x-0 border-b-0">
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th align="right">Sold</Th>
                      <Th align="right">Revenue</Th>
                      <Th align="right">Conversion</Th>
                      <Th align="right">Refunds</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => (
                      <tr key={p.productId}>
                        <Td className="font-medium">{p.productTitle}</Td>
                        <Td align="right" className="tabular-nums">
                          {p.unitsSold.toLocaleString('en-IN')}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {formatAmount(p.netRevenueMinor, currency)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {pct(p.conversionRateBps)}
                        </Td>
                        <Td align="right" className="text-content-secondary tabular-nums">
                          {p.refundsCount > 0
                            ? `${String(p.refundsCount)} (${pct(p.refundRateBps)})`
                            : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            {data.affiliates.length > 0 && (
              <Card padded={false}>
                <div className="p-5 pb-3 sm:p-6 sm:pb-3">
                  <CardHeader
                    className="mb-0"
                    title="Affiliates"
                    description="Who is sending you sales"
                  />
                </div>
                <Table className="rounded-none border-x-0 border-b-0">
                  <thead>
                    <tr>
                      <Th>Affiliate</Th>
                      <Th align="right">Clicks</Th>
                      <Th align="right">Sales</Th>
                      <Th align="right">Referred revenue</Th>
                      <Th align="right">Commission</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.affiliates.map((a) => (
                      <tr key={a.affiliateId}>
                        <Td className="font-medium">{a.name ?? a.email}</Td>
                        <Td align="right" className="tabular-nums">
                          {a.clicksCount.toLocaleString('en-IN')}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {a.conversionsCount.toLocaleString('en-IN')}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {formatAmount(a.grossReferredSalesMinor, currency)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {formatAmount(a.commissionsAccruedMinor, currency)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
