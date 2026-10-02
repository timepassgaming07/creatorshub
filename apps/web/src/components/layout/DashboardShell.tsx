'use client'

/**
 * DashboardShell — Shared Workspace Navigation & Layout.
 *
 * Provides:
 * - Persistent desktop sidebar with route highlighting, theme toggle, and quick storefront link
 * - Top navigation bar with breadcrumbs, tenant switcher, and user actions
 * - Mobile responsive drawer navigation with smooth slide-in transition
 * - Consistent page framing for all creator workspace modules
 */
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { signOut } from '@/lib/auth-client'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

interface DashboardShellProps {
  workspaceId: string
  workspaceName?: string
  workspaceSlug?: string
  children: ReactNode
}

interface NavItem {
  href: string
  label: string
  exact?: boolean
  icon: (active: boolean) => ReactNode
  badge?: string
}

export function DashboardShell({
  workspaceId,
  workspaceName = 'Workspace',
  workspaceSlug,
  children,
}: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const basePath = `/workspaces/${workspaceId}`

  const navItems: NavItem[] = [
    {
      href: basePath,
      label: 'Overview',
      exact: true,
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      ),
    },
    {
      href: `${basePath}/storefront`,
      label: 'My Store',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a1.897 1.897 0 0 1-.61-1.276c-.04-.453.116-.9.44-1.224L9.58 1.126a1.13 1.13 0 0 1 1.588-.014l.007.007 6.002 5.723c.324.324.48.77.44 1.224a1.897 1.897 0 0 1-.61 1.276" />
        </svg>
      ),
    },
    {
      href: `${basePath}/products`,
      label: 'Products',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
        </svg>
      ),
    },
    {
      href: `${basePath}/orders`,
      label: 'Orders',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        </svg>
      ),
    },
    {
      href: `${basePath}/customers`,
      label: 'Customers',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      ),
    },
    {
      href: `${basePath}/affiliates`,
      label: 'Referral Program',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      ),
    },
    {
      href: `${basePath}/payouts`,
      label: 'Money & Payouts',
      icon: (active) => (
        <svg className={`h-5 w-5 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6H2.25m0 0v10.5m0-10.5h19.5m0 0v10.5m0-10.5v-.75A.75.75 0 0 0 21 4.5h-.75m-16.5 0h16.5m-16.5 0a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h16.5a3 3 0 0 0 3-3V7.5a3 3 0 0 0-3-3H3.75Z" />
        </svg>
      ),
    },
  ]

  const isRouteActive = (item: NavItem) => {
    if (item.exact) {
      return pathname === item.href
    }
    return pathname.startsWith(item.href)
  }

  async function handleSignOut() {
    await signOut()
    router.push('/sign-in')
  }

  return (
    <div className="min-h-screen bg-surface-base text-content-primary flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-30 border-r border-border-subtle bg-surface-raised shadow-xs">
        {/* Workspace Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-border-subtle px-5">
          <Link href={`/workspaces/${workspaceId}`} className="flex items-center gap-2.5 group min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-sm font-black text-white shadow-md shadow-indigo-500/20">
              C
            </div>
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-bold text-content-primary group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {workspaceName}
              </span>
              <span className="text-[10px] font-semibold text-content-tertiary">Creator OS</span>
            </div>
          </Link>
          <ThemeToggle />
        </div>

        {/* Navigation List */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const active = isRouteActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-accent/10 text-accent font-bold shadow-xs'
                    : 'text-content-secondary hover:bg-surface-sunken hover:text-content-primary'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon(active)}
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-400">
                    {item.badge}
                  </span>
                )}
                {active && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 h-5 w-1 rounded-r-full bg-accent"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Storefront Link & User Footer */}
        <div className="border-t border-border-subtle p-4 space-y-3">
          {workspaceSlug && (
            <Link
              href={`/s/${workspaceSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2 text-xs font-semibold text-content-secondary transition-all hover:border-accent hover:bg-surface-raised hover:text-accent"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                <span className="truncate">View Storefront</span>
              </div>
              <svg className="h-3.5 w-3.5 text-content-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </Link>
          )}

          <div className="flex items-center justify-between pt-1">
            <Link
              href="/workspaces/new"
              className="text-[11px] font-medium text-content-tertiary hover:text-accent transition-colors"
            >
              + New Workspace
            </Link>
            <button
              type="button"
              onClick={() => {
                void handleSignOut()
              }}
              className="text-[11px] font-semibold text-critical hover:opacity-80 transition-opacity"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Navigation Header */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-raised/90 px-4 backdrop-blur-md">
        <Link href={`/workspaces/${workspaceId}`} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 text-xs font-black text-white">
            C
          </div>
          <span className="text-sm font-bold text-content-primary truncate max-w-[140px]">
            {workspaceName}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-control text-content-secondary"
            aria-label="Toggle navigation menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="lg:hidden fixed inset-x-0 top-14 z-30 border-b border-border-subtle bg-surface-raised p-4 shadow-xl space-y-1"
          >
            {navItems.map((item) => {
              const active = isRouteActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold ${
                    active ? 'bg-accent/10 text-accent' : 'text-content-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon(active)}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-400">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
            <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
              <Link
                href="/workspaces/new"
                className="text-xs font-medium text-content-secondary"
                onClick={() => setMobileMenuOpen(false)}
              >
                + Create Workspace
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut()
                }}
                className="text-xs font-bold text-critical"
              >
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
