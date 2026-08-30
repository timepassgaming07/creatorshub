/**
 * Workspace Customer Detail Page (Slice 7 §7.5).
 *
 * Route: /workspaces/[id]/customers/[customerId]
 */
import { notFound, redirect } from 'next/navigation'

import { CustomerDetailView } from '../../../../../components/customers/CustomerDetailView'
import { getCustomerDetailsAction } from '../../../../../lib/customer-actions'
import { getServerSession } from '../../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceCustomerDetailPage(props: {
  params: Promise<{ id: string; customerId: string }>
}) {
  const { id, customerId } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const result = await getCustomerDetailsAction(id, customerId)

  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') {
      return (
        <div className="p-8 text-center text-slate-500">
          You do not have permission to view this customer.
        </div>
      )
    }
    notFound()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <CustomerDetailView workspaceId={id} data={result.data} />
    </div>
  )
}
