/**
 * Workspace Analytics & AI Intelligence Page (Slice 10 §10.1, §10.2, §10.9).
 *
 * Route: /workspaces/[id]/analytics
 */
import { notFound, redirect } from 'next/navigation'

import { AnalyticsDashboardView } from '../../../../components/analytics/AnalyticsDashboardView'
import {
  getAffiliatePerformanceAction,
  getProductPerformanceAction,
  getWorkspaceAnalyticsAction,
} from '../../../../lib/analytics-actions'
import { getServerSession } from '../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceAnalyticsPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const [summaryRes, prodRes, affRes] = await Promise.all([
    getWorkspaceAnalyticsAction(id, '30d'),
    getProductPerformanceAction(id, '30d'),
    getAffiliatePerformanceAction(id, '30d'),
  ])

  if (!summaryRes.ok) {
    if (summaryRes.error.code === 'FORBIDDEN') {
      return (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          You do not have permission to view analytics in this workspace.
        </div>
      )
    }
    notFound()
  }

  return (
    <AnalyticsDashboardView
      workspaceId={id}
      initialSummary={summaryRes.data}
      initialProducts={prodRes.ok ? prodRes.data : []}
      initialAffiliates={affRes.ok ? affRes.data : []}
    />
  )
}
