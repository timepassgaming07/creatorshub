import type { Metadata } from 'next'
import { ANALYTICS_TIMEFRAMES, type AnalyticsTimeframe } from '@creatorhub/contracts'

import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { loadAnalytics } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Analytics' }

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>
  readonly searchParams: Promise<{ range?: string }>
}) {
  const { id } = await params
  const { range } = await searchParams
  const timeframe: AnalyticsTimeframe = ANALYTICS_TIMEFRAMES.find((t) => t === range) ?? '30d'
  const data = await loadAnalytics(id, timeframe)
  return <AnalyticsView data={data} />
}
