/**
 * Workspace Affiliate Programme Page (Slice 8 §8.9).
 *
 * Route: /workspaces/[id]/affiliates
 */
import { notFound, redirect } from 'next/navigation'

import { AffiliateProgramView } from '../../../../components/affiliates/AffiliateProgramView'
import {
  getAffiliateProgramAction,
  listAffiliatesAction,
} from '../../../../lib/affiliate-actions'
import { listCommissionsAction } from '../../../../lib/commission-actions'
import { getServerSession } from '../../../../lib/server-session'

export const dynamic = 'force-dynamic'

export default async function WorkspaceAffiliatesPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  const session = await getServerSession()

  if (!session) {
    redirect('/sign-in')
  }

  const [progRes, listRes, commRes] = await Promise.all([
    getAffiliateProgramAction(id),
    listAffiliatesAction(id),
    listCommissionsAction(id),
  ])

  if (!progRes.ok) {
    if (progRes.error.code === 'FORBIDDEN') {
      return (
        <div className="p-8 text-center text-stone-500">
          You do not have permission to view the affiliate programme in this workspace.
        </div>
      )
    }
    notFound()
  }

  return (
    <AffiliateProgramView
      workspaceId={id}
      initialProgram={progRes.data.program}
      initialSummary={progRes.data.summary}
      initialAffiliates={listRes.ok ? listRes.data.items : []}
      initialTotalAffiliates={listRes.ok ? listRes.data.total : 0}
      initialCommissions={commRes.ok ? commRes.data.items : []}
      initialTotalCommissions={commRes.ok ? commRes.data.total : 0}
    />
  )
}
