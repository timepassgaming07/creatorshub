/**
 * Every workspace screen renders inside this layout, and nothing renders until
 * the server has confirmed the visitor is a signed-in member of the workspace.
 * Signed-out visitors go to sign-in and come back; non-members get a 404, so a
 * workspace id reveals nothing about whether the workspace exists.
 */
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound, redirect } from 'next/navigation'

import { DashboardShell } from '@/components/layout/DashboardShell'
import { getWorkspaceAccess } from '@/lib/workspace-access'

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · CreatorHub' },
  robots: { index: false, follow: false },
}

export default async function WorkspaceLayout({
  children,
  params,
}: {
  readonly children: ReactNode
  readonly params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { session, access } = await getWorkspaceAccess(id)

  if (!session) redirect(`/sign-in?redirect=${encodeURIComponent(`/workspaces/${id}`)}`)
  if (!access) notFound()

  return (
    <DashboardShell
      workspace={access.workspace}
      role={access.role}
      storefront={access.storefront}
      user={{
        name: session.user.name ?? session.user.email,
        email: session.user.email,
        emailVerified: session.user.emailVerified ?? false,
      }}
    >
      {children}
    </DashboardShell>
  )
}
