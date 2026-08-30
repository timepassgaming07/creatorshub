/**
 * Workspace Order Detail Page (Slice 7 §7.3, §7.4).
 *
 * Route: /workspaces/[id]/orders/[orderId]
 */
import { notFound, redirect } from 'next/navigation'

import { OrderDetailView } from '../../../../../components/orders/OrderDetailView'
import { getOrderDetailsAction } from '../../../../../lib/order-actions'
import { getServerSession } from '../../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceOrderDetailPage(props: {
  params: Promise<{ id: string; orderId: string }>
}) {
  const { id, orderId } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const result = await getOrderDetailsAction(id, orderId)

  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') {
      return (
        <div className="p-8 text-center text-slate-500">
          You do not have permission to view this order.
        </div>
      )
    }
    notFound()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <OrderDetailView workspaceId={id} data={result.data} />
    </div>
  )
}
