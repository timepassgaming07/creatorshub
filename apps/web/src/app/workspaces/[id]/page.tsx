'use client'

/**
 * Workspace Management & Member Governance Screen — Production-Grade.
 *
 * Responsibilities:
 * - Render workspace overview with quick stats and module launch cards
 * - Member invitation flow with Dialog and Toast feedback
 * - Role updates and removal protected by policy permissions
 * - Passkey biometric credential governance
 * - Strict 4-state lifecycle handling (loading, error, empty, populated)
 */
import { use, useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Button, Dialog, Input, Select, Skeleton, SkeletonText, useToast } from '@creatorhub/ui'

import { authClient } from '@/lib/auth-client'
import {
  getWorkspaceDataAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
  type MemberDisplay,
  type WorkspaceData,
} from '@/lib/workspace-actions'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — Can manage settings and invite members' },
  { value: 'member', label: 'Member — View-only workspace access' },
]

export default function WorkspacePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params)
  const router = useRouter()
  const toast = useToast()

  const [data, setData] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; detail: string; status: number } | null>(null)
  const [demoSigningIn, setDemoSigningIn] = useState(false)

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | undefined>(undefined)

  // Passkeys state
  const [passkeysList, setPasskeysList] = useState<
    {
      id: string
      name?: string | null | undefined
      createdAt?: string | Date | undefined
      deviceType?: string | undefined
    }[]
  >([])
  const [passkeysLoading, setPasskeysLoading] = useState(true)
  const [addPasskeyOpen, setAddPasskeyOpen] = useState(false)
  const [passkeyName, setPasskeyName] = useState('')
  const [addingPasskey, setAddingPasskey] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | undefined>(undefined)

  const loadWorkspace = useCallback(async () => {
    try {
      const res = await getWorkspaceDataAction(workspaceId)
      if (!res.success) {
        setError({
          title: res.error.title,
          detail: res.error.detail,
          status: res.error.status,
        })
        setLoading(false)
        return
      }

      setData(res.data)
      setLoading(false)
    } catch {
      setError({
        title: 'Not found',
        detail: 'We could not find this workspace.',
        status: 404,
      })
      setLoading(false)
    }
  }, [workspaceId])

  const handleDemoSignIn = async () => {
    setDemoSigningIn(true)
    try {
      const res = await authClient.signIn.email({
        email: 'creator_demo@studionova.com',
        password: 'SuperSecretPassword123!',
      })
      if (!res.error) {
        toast.show({
          title: 'Signed in as Studio Nova',
          description: 'Welcome back to your creator dashboard.',
          variant: 'success',
        })
        setLoading(true)
        setError(null)
        await loadWorkspace()
      } else {
        toast.show({
          title: 'Sign in failed',
          description: res.error.message ?? 'Could not sign in to demo account.',
          variant: 'critical',
        })
      }
    } catch {
      toast.show({
        title: 'Sign in error',
        description: 'An unexpected error occurred during demo sign in.',
        variant: 'critical',
      })
    } finally {
      setDemoSigningIn(false)
    }
  }

  useEffect(() => {
    let isMounted = true
    void getWorkspaceDataAction(workspaceId)
      .then((res) => {
        if (!isMounted) return
        if (!res.success) {
          setError({
            title: res.error.title,
            detail: res.error.detail,
            status: res.error.status,
          })
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setError({
          title: 'Not found',
          detail: 'We could not find this workspace.',
          status: 404,
        })
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [workspaceId])

  const loadPasskeys = useCallback(async () => {
    try {
      const res = await authClient.passkey.listUserPasskeys()
      if (res.data) {
        setPasskeysList(res.data)
      }
      setPasskeysLoading(false)
    } catch {
      setPasskeysLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    void authClient.passkey
      .listUserPasskeys()
      .then((res) => {
        if (!isMounted) return
        if (res.data) {
          setPasskeysList(res.data)
        }
        setPasskeysLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setPasskeysLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  function formatPasskeyError(rawError?: string | null): string {
    if (!rawError) return 'Failed to register passkey. Please try again.'
    const lower = rawError.toLowerCase()
    if (
      lower.includes('timed out') ||
      lower.includes('not allowed') ||
      lower.includes('privacy-considerations') ||
      lower.includes('notallowederror') ||
      lower.includes('cancelled') ||
      lower.includes('canceled')
    ) {
      return 'Passkey registration was cancelled or timed out. Please try again when prompted by your device.'
    }
    if (
      lower.includes('invalidstateerror') ||
      lower.includes('already registered') ||
      lower.includes('excludecredentials')
    ) {
      return 'This biometric device or security key is already registered to your account.'
    }
    if (
      lower.includes('notsupportederror') ||
      lower.includes('not supported') ||
      lower.includes('platform authenticator')
    ) {
      return 'Passkeys or biometric authentication are not supported on this browser or device.'
    }
    if (lower.includes('securityerror')) {
      return 'Security error: Passkeys require an HTTPS connection or localhost.'
    }
    return rawError
  }

  async function handleAddPasskey(e: SyntheticEvent) {
    e.preventDefault()
    setPasskeyError(undefined)

    const trimmedName = passkeyName.trim()
    if (!trimmedName) {
      setPasskeyError('Please enter a device label or name before registering a passkey.')
      return
    }

    setAddingPasskey(true)

    try {
      const result = await authClient.passkey.addPasskey({
        name: trimmedName,
      })

      if (result.error) {
        setPasskeyError(formatPasskeyError(result.error.message))
        setAddingPasskey(false)
        return
      }

      toast.show({
        title: 'Passkey registered',
        description: `Successfully registered "${trimmedName}". You can now sign in with biometrics.`,
        variant: 'success',
      })

      setPasskeyName('')
      setAddPasskeyOpen(false)
      setAddingPasskey(false)
      void loadPasskeys()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined
      setPasskeyError(formatPasskeyError(msg))
      setAddingPasskey(false)
    }
  }

  async function handleDeletePasskey(id: string, name?: string | null) {
    try {
      const result = await authClient.passkey.deletePasskey({ id })

      if (result.error) {
        toast.show({
          title: 'Could not delete passkey',
          description: formatPasskeyError(result.error.message),
          variant: 'critical',
        })
        return
      }

      toast.show({
        title: 'Passkey removed',
        description: name ? `Removed passkey "${name}".` : 'Passkey removed successfully.',
        variant: 'info',
      })

      void loadPasskeys()
    } catch {
      toast.show({
        title: 'Error removing passkey',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'critical',
      })
    }
  }

  async function handleInviteSubmit(e: SyntheticEvent) {
    e.preventDefault()
    setInviteError(undefined)

    if (!inviteEmail.includes('@')) {
      setInviteError('Please enter a valid email address.')
      return
    }

    setInviting(true)

    try {
      const res = await inviteMemberAction({
        workspaceId,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      })

      if (!res.success) {
        setInviteError(res.error.detail)
        setInviting(false)
        return
      }

      toast.show({
        title: 'Invitation sent',
        description: `Invited ${inviteEmail} as ${inviteRole}.`,
        variant: 'success',
      })

      setInviteEmail('')
      setInviteRole('member')
      setInviteOpen(false)
      setInviting(false)
      void loadWorkspace()
    } catch {
      setInviteError('Failed to send invitation. Please try again.')
      setInviting(false)
    }
  }

  async function handleRoleChange(member: MemberDisplay, newRole: 'admin' | 'member') {
    try {
      const res = await updateMemberRoleAction({
        workspaceId,
        targetUserId: member.userId,
        role: newRole,
      })

      if (!res.success) {
        toast.show({
          title: 'Could not change role',
          description: res.error.detail,
          variant: 'critical',
        })
        return
      }

      toast.show({
        title: 'Role updated',
        description: `${member.name} is now ${newRole === 'admin' ? 'an admin' : 'a member'}.`,
        variant: 'success',
      })

      void loadWorkspace()
    } catch {
      toast.show({
        title: 'Error updating role',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'critical',
      })
    }
  }

  async function handleRemoveMember(member: MemberDisplay) {
    if (!confirm(`Are you sure you want to remove ${member.name} from this workspace?`)) {
      return
    }

    try {
      const res = await removeMemberAction({
        workspaceId,
        targetUserId: member.userId,
      })

      if (!res.success) {
        toast.show({
          title: 'Could not remove member',
          description: res.error.detail,
          variant: 'critical',
        })
        return
      }

      toast.show({
        title: 'Member removed',
        description: `${member.name} has been removed from the workspace.`,
        variant: 'info',
      })

      void loadWorkspace()
    } catch {
      toast.show({
        title: 'Error removing member',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'critical',
      })
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="space-y-2">
            <Skeleton shape="text" className="h-8 w-48" />
            <Skeleton shape="text" className="h-4 w-32" />
          </div>
          <Skeleton shape="text" className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} shape="block" className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Error State
  // ---------------------------------------------------------------------------
  if (error || !data) {
    const isAuthError = error?.status === 401 || error?.title === 'Please sign in'

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-border-subtle bg-surface-raised p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            {isAuthError ? (
              <span className="text-2xl">⚡</span>
            ) : (
              <svg className="h-6 w-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
          </div>
          <h2 className="mt-4 text-xl font-black text-content-primary">{error?.title ?? 'Not found'}</h2>
          <p className="mt-2 text-sm text-content-secondary">{error?.detail ?? 'We could not find this workspace.'}</p>

          {isAuthError && (
            <div className="mt-5 p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 text-left text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                <span>Verified Demo Creator</span>
                <span>Studio Nova</span>
              </div>
              <p className="font-mono text-[11px] text-content-secondary">
                creator_demo@studionova.com
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            {isAuthError ? (
              <>
                <Button
                  variant="primary"
                  loading={demoSigningIn}
                  loadingLabel="Signing in..."
                  onClick={() => void handleDemoSignIn()}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold cursor-pointer"
                >
                  ⚡ 1-Click Demo Sign In
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/sign-in?redirect=/workspaces/${workspaceId}`)}
                  className="cursor-pointer"
                >
                  Go to Sign In →
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => void loadWorkspace()}>
                  Try again
                </Button>
                <Button variant="primary" onClick={() => router.push('/workspaces/new')}>
                  Create new
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const { workspace, members, currentRole, permissions } = data
  const canInvite = permissions.includes('member.invite')
  const canChangeRole = permissions.includes('member.role.change')
  const canRemove = permissions.includes('member.remove')

  const modules = [
    {
      title: 'My Store',
      href: `/workspaces/${workspaceId}/storefront`,
      desc: 'Customize your online store\'s look and feel.',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a1.897 1.897 0 0 1-.61-1.276c-.04-.453.116-.9.44-1.224L9.58 1.126a1.13 1.13 0 0 1 1.588-.014l.007.007 6.002 5.723c.324.324.48.77.44 1.224a1.897 1.897 0 0 1-.61 1.276" />
        </svg>
      ),
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    },
    {
      title: 'Products',
      href: `/workspaces/${workspaceId}/products`,
      desc: 'Add and manage your digital products.',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
        </svg>
      ),
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
    {
      title: 'Orders',
      href: `/workspaces/${workspaceId}/orders`,
      desc: 'See who bought what, send downloads, issue refunds.',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        </svg>
      ),
      color: 'bg-amber-50 text-amber-600 border-amber-100',
    },
    {
      title: 'Customers',
      href: `/workspaces/${workspaceId}/customers`,
      desc: 'Your list of customers and their purchase history.',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 0 1 5.25 0z" />
        </svg>
      ),
      color: 'bg-purple-50 text-purple-600 border-purple-100',
    },
    {
      title: 'Referral Program',
      href: `/workspaces/${workspaceId}/affiliates`,
      desc: 'Let others promote your products and earn commission.',
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      ),
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Workspace Quick Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-border-subtle bg-surface-raised p-6 sm:p-8 shadow-xs flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-content-primary tracking-tight">
              {workspace.name}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {workspace.status}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-content-secondary flex flex-wrap items-center gap-1.5">
            <span>Storefront:</span>
            <Link
              href={`/s/${workspace.slug}`}
              target="_blank"
              className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {workspace.slug}.creatorhub.com ↗
            </Link>
            <button
              type="button"
              onClick={() => {
                const url = typeof window !== 'undefined' ? `${window.location.origin}/s/${workspace.slug}` : `/s/${workspace.slug}`
                void navigator.clipboard.writeText(url)
                toast.show({
                  title: 'Storefront URL Copied',
                  description: 'Share this link with your audience to start selling.',
                  variant: 'success',
                })
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold bg-surface-sunken hover:bg-surface-overlay text-content-secondary border border-border-control transition-colors cursor-pointer"
              title="Copy public storefront link"
            >
              📋 Copy
            </button>
            <span className="text-content-tertiary">·</span>
            <span>Currency: <span className="font-semibold text-content-primary">{workspace.defaultCurrency}</span></span>
            <span className="text-content-tertiary">·</span>
            <span>Role: <span className="font-bold text-content-primary capitalize">{currentRole}</span></span>
            <span className="text-content-tertiary">·</span>
            <span>Platform fee: <span className="font-semibold text-content-primary">{((workspace.platformFeeBps ?? 500) / 100).toFixed(workspace.platformFeeBps % 100 === 0 ? 0 : 1)}% per sale</span></span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canInvite && (
            <Dialog
              open={inviteOpen}
              onOpenChange={(open) => {
                setInviteOpen(open)
                if (!open) {
                  setInviteError(undefined)
                  setInviteEmail('')
                }
              }}
              title="Invite workspace member"
              description="Collaborators will receive access to manage or view your store based on their role."
              trigger={
                <Button variant="primary" size="medium">
                  + Invite Member
                </Button>
              }
            >
              <form
                onSubmit={(e) => {
                  void handleInviteSubmit(e)
                }}
                className="mt-4 flex flex-col gap-4"
              >
                {inviteError && (
                  <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                    {inviteError}
                  </div>
                )}

                <Input
                  label="Colleague email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value)
                    if (inviteError) setInviteError(undefined)
                  }}
                  disabled={inviting}
                  placeholder="collaborator@example.com"
                />

                <Select
                  label="Role & permissions"
                  options={ROLE_OPTIONS}
                  value={inviteRole}
                  onValueChange={(val) => {
                    setInviteRole(val as 'admin' | 'member')
                  }}
                  disabled={inviting}
                />

                <div className="mt-4 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setInviteOpen(false)
                      setInviteError(undefined)
                      setInviteEmail('')
                    }}
                    disabled={inviting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={inviting}
                    loadingLabel="Sending invite..."
                    disabled={inviting || !inviteEmail.trim()}
                  >
                    Send invitation
                  </Button>
                </div>
              </form>
            </Dialog>
          )}

          <Link
            href={`/s/${workspace.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-sunken px-4 py-2 text-xs font-bold text-content-primary transition-colors hover:bg-surface-raised"
          >
            Live Storefront ↗
          </Link>
        </div>
      </motion.div>

      {/* Featured Banners */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href={`/workspaces/${workspaceId}/analytics`}
          className="group relative overflow-hidden rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 p-6 text-white shadow-md transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md">
              📊 Live Tracking
            </span>
            <span className="text-xs font-bold text-white/80 group-hover:text-white transition-colors">
              Open Analytics →
            </span>
          </div>
          <h3 className="mt-4 text-lg font-bold">Sales & Traffic Analytics</h3>
          <p className="mt-1 text-xs text-white/80 leading-relaxed">
            Track your total earnings, visitor conversion rates, order trends, and top-selling deliverables.
          </p>
        </Link>

        <Link
          href={`/workspaces/${workspaceId}/payouts`}
          className="group relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-md transition-transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-white/20 px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-md">
              ⚡ Instant Payouts
            </span>
            <span className="text-xs font-bold text-white/80 group-hover:text-white transition-colors">
              Manage Earnings →
            </span>
          </div>
          <h3 className="mt-4 text-lg font-bold">Bank Payouts & Earnings</h3>
          <p className="mt-1 text-xs text-white/80 leading-relaxed">
            Direct bank settlements, automated daily payouts, and detailed transaction records.
          </p>
        </Link>
      </div>

      {/* Workspace Modules Hub Grid */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-content-primary">Workspace Modules</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className="group relative flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-raised p-6 shadow-xs transition-all hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md"
            >
              <div>
                <div className="flex items-center">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${m.color}`}>
                    {m.icon}
                  </div>
                </div>
                <h3 className="mt-4 text-sm font-bold text-content-primary group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {m.title}
                </h3>
                <p className="mt-1.5 text-xs text-content-secondary leading-relaxed">{m.desc}</p>
              </div>
              <div className="mt-5 flex items-center justify-end text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                <span>Manage</span>
                <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Members Management Surface */}
      <section className="rounded-3xl border border-border-subtle bg-surface-raised p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-content-primary">
              Workspace Team ({members.length})
            </h2>
            <p className="text-xs text-content-secondary">Collaborators with role-based access control.</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-sunken text-content-secondary font-semibold border-b border-border-subtle">
              <tr>
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Joined</th>
                {(canChangeRole || canRemove) && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {members.map((m) => {
                const isOwner = m.role === 'owner'
                return (
                  <tr key={m.id} className="hover:bg-surface-sunken/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-content-primary">{m.name}</span>
                        <span className="text-[11px] text-content-tertiary">{m.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                          isOwner
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                            : m.role === 'admin'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-surface-sunken text-content-secondary border border-border-subtle'
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-content-secondary">
                      {new Date(m.joinedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    {(canChangeRole || canRemove) && (
                      <td className="px-5 py-3.5 text-right">
                        {!isOwner && (
                          <div className="flex items-center justify-end gap-2">
                            {canChangeRole && (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRoleChange(
                                    m,
                                    m.role === 'admin' ? 'member' : 'admin',
                                  )
                                }}
                                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                              >
                                Make {m.role === 'admin' ? 'Member' : 'Admin'}
                              </button>
                            )}
                            {canRemove && (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRemoveMember(m)
                                }}
                                className="font-semibold text-rose-600 dark:text-rose-400 hover:underline ml-2 cursor-pointer"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security & Passkeys Surface */}
      <section className="rounded-3xl border border-border-subtle bg-surface-raised p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-content-primary">Security & WebAuthn Passkeys</h2>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Phishing Proof
              </span>
            </div>
            <p className="mt-1 text-xs text-content-secondary">
              Passkeys let you sign in with Face ID, Touch ID, or hardware security keys without passwords.
            </p>
          </div>

          <Dialog
            open={addPasskeyOpen}
            onOpenChange={(open) => {
              setAddPasskeyOpen(open)
              if (!open) {
                setPasskeyError(undefined)
                setPasskeyName('')
              }
            }}
            title="Register a new passkey"
            description="Your browser will trigger biometric authentication (Touch ID, Face ID, or Windows Hello)."
            trigger={
              <Button variant="secondary" size="medium">
                + Register Passkey
              </Button>
            }
          >
            <form
              onSubmit={(e) => {
                void handleAddPasskey(e)
              }}
              className="mt-4 flex flex-col gap-4"
            >
              {passkeyError && (
                <div role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  {passkeyError}
                </div>
              )}

              <Input
                label="Device label / name"
                type="text"
                required
                value={passkeyName}
                onChange={(e) => {
                  setPasskeyName(e.target.value)
                  if (passkeyError) setPasskeyError(undefined)
                }}
                disabled={addingPasskey}
                placeholder="e.g. MacBook Pro Touch ID"
                hint="Give this passkey a friendly name (e.g. MacBook Touch ID, Work Laptop, iPhone)."
              />

              <div className="mt-4 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAddPasskeyOpen(false)
                    setPasskeyError(undefined)
                    setPasskeyName('')
                  }}
                  disabled={addingPasskey}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={addingPasskey}
                  loadingLabel="Registering..."
                  disabled={addingPasskey || !passkeyName.trim()}
                >
                  Register Passkey
                </Button>
              </div>
            </form>
          </Dialog>
        </div>

        {passkeysLoading ? (
          <Skeleton shape="block" className="h-16 w-full rounded-xl" />
        ) : passkeysList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-control bg-surface-sunken/40 p-6 text-center text-xs text-content-secondary">
            No passkeys registered yet. Register one to enable instant biometric login.
          </div>
        ) : (
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {passkeysList.map((pk) => (
              <div key={pk.id} className="flex items-center justify-between p-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken border border-border-subtle text-content-primary">
                    🔑
                  </div>
                  <div>
                    <p className="font-semibold text-content-primary">{pk.name ?? 'Passkey Credential'}</p>
                    <p className="text-[11px] text-content-tertiary">
                      {pk.createdAt ? `Registered on ${new Date(pk.createdAt).toLocaleDateString()}` : 'Active'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePasskey(pk.id, pk.name)
                  }}
                  className="font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
