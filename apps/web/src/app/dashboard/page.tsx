/**
 * /dashboard: where sign-in sends everyone.
 *
 * Signed out goes to sign-in. Signed in goes to the workspace they last
 * opened, after confirming they are still a member. Anyone without one goes to
 * onboarding to create their store.
 */
import { redirect } from 'next/navigation'

import { getServerSession } from '@/lib/server-session'
import { homeWorkspaceFor } from '@/lib/workspace-access'

export default async function DashboardRedirect(): Promise<never> {
  const session = await getServerSession()
  if (!session) redirect('/sign-in')

  const target = await homeWorkspaceFor(session)
  redirect(target ? `/workspaces/${target}` : '/workspaces/new')
}
