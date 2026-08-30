/**
 * Workspace Orders List Page (Slice 7 §7.3).
 *
 * Route: /workspaces/[id]/orders
 */
import { notFound, redirect } from 'next/navigation'

import { OrderListView } from '../../../../components/orders/OrderListView'
import { listOrdersAction } from '../../../../lib/order-actions'
import { getServerSession } from '../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceOrdersPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const result = await listOrdersAction(id)

  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') {
      return (
        <div className="p-8 text-center text-slate-500">
          You do not have permission to view orders in this workspace.
        </div>
      )
    }
    notFound()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <OrderListView
        workspaceId={id}
        initialOrders={result.data.orders}
        initialTotalCount={result.data.totalCount}
        initialSummary={result.data.summary}
      />
    </div>
  )
}
