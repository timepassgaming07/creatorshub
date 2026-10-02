'use client'

/**
 * The creator dashboard frame: sidebar navigation, a command palette on ⌘K,
 * the email-verification nudge, and the workspace context every screen reads.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BarChart3,
  ChevronsUpDown,
  Command,
  ExternalLink,
  FolderOpen,
  Home,
  LogOut,
  Mail,
  Menu,
  Package,
  Percent,
  Plus,
  Receipt,
  Search,
  Settings,
  Store,
  Users,
  Wallet,
  Waypoints,
  X,
  type LucideIcon,
} from 'lucide-react'

import { cn, LogoMark } from '@/components/ds'
import { useTheme } from '@/components/theme/ThemeProvider'
import { authClient, signOut } from '@/lib/auth-client'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type WorkspaceInfo = {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly currency: string
}

export type StorefrontInfo = {
  readonly subdomain: string
  readonly status: string
  readonly url: string
} | null

type WorkspaceContextValue = {
  readonly workspace: WorkspaceInfo
  readonly storefront: StorefrontInfo
  readonly role: string
  readonly basePath: string
  /** Whether the AI copilot is configured; its buttons are hidden otherwise. */
  readonly aiEnabled: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside the workspace layout')
  return value
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

type NavItem = { readonly href: string; readonly label: string; readonly icon: LucideIcon; readonly exact?: boolean }

function navFor(base: string): readonly { readonly label: string | null; readonly items: readonly NavItem[] }[] {
  return [
    { label: null, items: [{ href: base, label: 'Home', icon: Home, exact: true }] },
    {
      label: 'Sell',
      items: [
        { href: `${base}/products`, label: 'Products', icon: Package },
        { href: `${base}/orders`, label: 'Orders', icon: Receipt },
        { href: `${base}/customers`, label: 'Customers', icon: Users },
        { href: `${base}/discounts`, label: 'Discounts', icon: Percent },
      ],
    },
    {
      label: 'Grow',
      items: [
        { href: `${base}/storefront`, label: 'Storefront', icon: Store },
        { href: `${base}/affiliates`, label: 'Affiliates', icon: Waypoints },
        { href: `${base}/analytics`, label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      label: 'Money',
      items: [{ href: `${base}/payouts`, label: 'Payouts', icon: Wallet }],
    },
  ]
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-body font-medium transition-colors',
        active
          ? 'bg-surface-raised text-content-primary shadow-elevation-1 ring-1 ring-border-subtle'
          : 'text-content-secondary hover:bg-surface-raised/60 hover:text-content-primary',
      )}
    >
      <Icon
        className={cn('size-[17px] shrink-0', active ? 'text-accent' : 'text-content-tertiary group-hover:text-content-secondary')}
        aria-hidden="true"
      />
      {item.label}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

type Command = { readonly label: string; readonly hint?: string; readonly run: () => void; readonly icon: LucideIcon }

// Mounted only while open, so every opening starts with an empty query.
function CommandPalette({ onClose, commands }: { onClose: () => void; commands: readonly Command[] }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands
  }, [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 px-4 pt-[14vh] backdrop-blur-sm">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border-subtle bg-surface-overlay shadow-elevation-3"
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Search className="size-4 text-content-tertiary" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, filtered.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter') {
                filtered[index]?.run()
                onClose()
              }
            }}
            placeholder="Go to, or create…"
            aria-label="Search commands"
            className="h-12 flex-1 bg-transparent text-body-lg text-content-primary placeholder:text-content-tertiary focus:outline-none"
          />
          <kbd className="rounded border border-border-subtle px-1.5 py-0.5 text-[11px] text-content-tertiary">esc</kbd>
        </div>
        <ul role="listbox" className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-body text-content-tertiary">No matches</li>}
          {filtered.map((command, i) => {
            const Icon = command.icon
            return (
              <li key={command.label} role="option" aria-selected={i === index}>
                <button
                  type="button"
                  onMouseEnter={() => {
                    setIndex(i)
                  }}
                  onClick={() => {
                    command.run()
                    onClose()
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-body',
                    i === index ? 'bg-surface-sunken text-content-primary' : 'text-content-secondary',
                  )}
                >
                  <Icon className="size-4 text-content-tertiary" aria-hidden="true" />
                  <span className="flex-1">{command.label}</span>
                  {command.hint && <span className="text-caption text-content-tertiary">{command.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function DashboardShell({
  workspace,
  storefront,
  role,
  user,
  aiEnabled,
  children,
}: {
  readonly workspace: WorkspaceInfo
  readonly storefront: StorefrontInfo
  readonly role: string
  readonly aiEnabled: boolean
  readonly user: { readonly name: string; readonly email: string; readonly emailVerified: boolean }
  readonly children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [verifySent, setVerifySent] = useState(false)

  const base = `/workspaces/${workspace.id}`
  const groups = navFor(base)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Navigating closes the drawer and the account menu. Adjusting state during
  // render, rather than in an effect, avoids a second render pass.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMobileOpen(false)
    setMenuOpen(false)
  }

  const go = useCallback((href: string) => () => {
    router.push(href)
  }, [router])

  const commands: Command[] = [
    { label: 'New product', icon: Plus, run: go(`${base}/products/new`) },
    ...groups.flatMap((g) => g.items.map((item) => ({ label: item.label, icon: item.icon, hint: 'Go to', run: go(item.href) }))),
    { label: 'Files', icon: FolderOpen, hint: 'Go to', run: go(`${base}/files`) },
    { label: 'Settings', icon: Settings, hint: 'Go to', run: go(`${base}/settings`) },
    ...(storefront
      ? [
          {
            label: 'Open my store',
            icon: ExternalLink,
            run: () => {
              window.open(storefront.status === 'published' ? storefront.url : `${storefront.url}?preview=${workspace.id}`, '_blank', 'noopener')
            },
          },
        ]
      : []),
  ]

  async function handleSignOut() {
    await signOut()
    router.push('/sign-in')
    router.refresh()
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4 pb-3">
        <Link
          href={base}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-raised/60"
        >
          <LogoMark className="size-8" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold text-content-primary">{workspace.name}</span>
            <span className="flex items-center gap-1.5 text-[12px] text-content-tertiary">
              <span
                className={cn('size-1.5 rounded-full', storefront?.status === 'published' ? 'bg-positive' : 'bg-content-tertiary')}
                aria-hidden="true"
              />
              {storefront?.status === 'published' ? 'Store live' : 'Store in draft'}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setPaletteOpen(true)
          }}
          className="mt-3 flex h-9 w-full items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-raised px-3 text-body text-content-tertiary shadow-elevation-1 transition-colors hover:text-content-secondary"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="inline-flex items-center gap-0.5 text-[11px]">
            <Command className="size-3" aria-hidden="true" />K
          </kbd>
        </button>
      </div>

      <nav aria-label="Workspace" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.label ?? 'main'}>
            {group.label && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-content-tertiary uppercase">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-0.5 px-3 pb-2">
        <NavLink item={{ href: `${base}/files`, label: 'Files', icon: FolderOpen }} pathname={pathname} />
        <NavLink item={{ href: `${base}/settings`, label: 'Settings', icon: Settings }} pathname={pathname} />
        {storefront && (
          <a
            href={storefront.status === 'published' ? storefront.url : `${storefront.url}?preview=${workspace.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 items-center gap-3 rounded-lg px-2.5 text-body font-medium text-content-secondary transition-colors hover:bg-surface-raised/60 hover:text-content-primary"
          >
            <ExternalLink className="size-[17px] text-content-tertiary" aria-hidden="true" />
            {storefront.status === 'published' ? 'View store' : 'Preview store'}
          </a>
        )}
      </div>

      <div className="relative border-t border-border-subtle p-3">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setMenuOpen((v) => !v)
          }}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-raised/60"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[12px] font-semibold text-accent">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-content-primary">{user.name}</span>
            <span className="block truncate text-[12px] text-content-tertiary">{user.email}</span>
          </span>
          <ChevronsUpDown className="size-4 text-content-tertiary" aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-3 bottom-[calc(100%-4px)] left-3 z-20 overflow-hidden rounded-xl border border-border-subtle bg-surface-overlay p-1 shadow-elevation-3"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-body text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
            >
              {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <Link
              role="menuitem"
              href="/workspaces/new"
              className="flex w-full items-center rounded-lg px-3 py-2 text-body text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
            >
              Create another store
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-body text-critical hover:bg-critical-subtle"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <WorkspaceContext.Provider value={{ workspace, storefront, role, basePath: base, aiEnabled }}>
      <div className="min-h-dvh bg-surface-base">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-[256px] border-r border-border-subtle bg-surface-sunken/50 lg:block">
          {sidebar}
        </aside>

        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-surface-base/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(true)
            }}
            aria-label="Open navigation"
            className="flex size-9 items-center justify-center rounded-lg text-content-secondary hover:bg-surface-sunken"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <span className="flex items-center gap-2 text-body font-semibold">
            <LogoMark className="size-6" />
            <span className="max-w-[180px] truncate">{workspace.name}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setPaletteOpen(true)
            }}
            aria-label="Search"
            className="flex size-9 items-center justify-center rounded-lg text-content-secondary hover:bg-surface-sunken"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close navigation"
              className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setMobileOpen(false)
              }}
            />
            <aside className="absolute inset-y-0 left-0 w-[280px] border-r border-border-subtle bg-surface-base shadow-elevation-3">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                }}
                aria-label="Close navigation"
                className="absolute top-4 right-3 z-10 flex size-8 items-center justify-center rounded-lg text-content-tertiary hover:bg-surface-sunken"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}

        <div className="lg:pl-[256px]">
          {!user.emailVerified && (
            <div className="border-b border-border-subtle bg-accent-subtle/60 px-4 py-2.5 sm:px-8">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 text-body">
                <p className="flex items-center gap-2 text-content-primary">
                  <Mail className="size-4 text-accent" aria-hidden="true" />
                  Confirm {user.email} to receive payouts and reset your password.
                </p>
                <button
                  type="button"
                  disabled={verifySent}
                  onClick={() => {
                    void authClient
                      .sendVerificationEmail({ email: user.email, callbackURL: base })
                      .then(() => {
                        setVerifySent(true)
                      })
                  }}
                  className="text-body font-medium text-accent hover:underline disabled:no-underline disabled:opacity-70"
                >
                  {verifySent ? 'Sent. Check your inbox' : 'Resend email'}
                </button>
              </div>
            </div>
          )}
          <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
            {children}
          </main>
        </div>

        {paletteOpen && (
          <CommandPalette
            onClose={() => {
              setPaletteOpen(false)
            }}
            commands={commands}
          />
        )}
      </div>
    </WorkspaceContext.Provider>
  )
}
