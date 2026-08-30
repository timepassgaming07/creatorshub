/**
 * Workspace Customers Directory Page (Slice 7 §7.5).
 *
 * Route: /workspaces/[id]/customers
 */
import { notFound, redirect } from 'next/navigation'

import { CustomerListView } from '../../../../components/customers/CustomerListView'
import { listCustomersAction } from '../../../../lib/customer-actions'
import { getServerSession } from '../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceCustomersPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const result = await listCustomersAction(id)

  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') {
      return (
        <div className="p-8 text-center text-slate-500">
          You do not have permission to view customers in this workspace.
        </div>
      )
    }
    notFound()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <CustomerListView
        workspaceId={id}
        initialCustomers={result.data.customers}
        initialTotalCount={result.data.totalCount}
        initialSummary={result.data.summary}
      />
    </div>
  )
}
