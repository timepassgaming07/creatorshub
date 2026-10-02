import type { ReactNode } from 'react'
import { DashboardShell } from '@/components/layout/DashboardShell'

/**
 * Workspace Root Layout.
 * Wraps all dashboard subroutes (products, orders, analytics, storefront, etc.)
 * in the unified DashboardShell navigation sidebar and topbar.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id: workspaceId } = await params

  return (
    <DashboardShell workspaceId={workspaceId}>
      {children}
    </DashboardShell>
  )
}
