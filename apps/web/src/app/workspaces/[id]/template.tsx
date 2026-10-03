/**
 * Re-mounts on every navigation inside a workspace, so each screen arrives with
 * a short rise while the shell around it stays put. Reduced motion removes it.
 */
import type { ReactNode } from 'react'

export default function WorkspaceTemplate({ children }: { readonly children: ReactNode }) {
  return <div className="page-enter">{children}</div>
}
