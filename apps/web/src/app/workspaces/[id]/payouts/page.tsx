/**
 * Workspace Payouts, Bank Accounts & Disbursements Page (Slice 11 §11.1, §11.4).
 *
 * Route: /workspaces/[id]/payouts
 */
import { notFound, redirect } from 'next/navigation'

import { PayoutsDashboardView } from '../../../../components/payouts/PayoutsDashboardView'
import {
  getPayoutBalanceSummaryAction,
  listBeneficiaryAccountsAction,
  listPayoutsAction,
} from '../../../../lib/payout-actions'
import { getServerSession } from '../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspacePayoutsPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const [balanceRes, beneficiariesRes, payoutsRes] = await Promise.all([
    getPayoutBalanceSummaryAction(id),
    listBeneficiaryAccountsAction(id),
    listPayoutsAction(id),
  ])

  if (!balanceRes.ok) {
    if (balanceRes.error.code === 'FORBIDDEN') {
      return (
        <div className="mx-auto max-w-5xl p-8 text-center text-neutral-500">
          You do not have permission to view payouts in this workspace.
        </div>
      )
    }
    notFound()
  }

  return (
    <PayoutsDashboardView
      workspaceId={id}
      initialBalance={balanceRes.data}
      initialBeneficiaries={beneficiariesRes.ok ? beneficiariesRes.data : []}
      initialPayouts={payoutsRes.ok ? payoutsRes.data : []}
      currentUserId={session.user.id}
      userRole="owner"
    />
  )
}
