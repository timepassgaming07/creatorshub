'use client'

/**
 * Workspace Management & Member Governance Screen.
 *
 * Responsibilities:
 * - Render workspace dashboard and member roster across all 4 states (loading, empty, error, populated).
 * - Member invitation flow with Dialog and Toast feedback.
 * - Role updates and removal protected by policy permissions.
 * - Enforcement of not-found (404) for cross-tenant isolation.
 */
import { use, useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Dialog, Input, Select, Skeleton, SkeletonText, useToast } from '@creatorhub/ui'

import { signOut, authClient } from '@/lib/auth-client'
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

  async function handleAddPasskey(e: SyntheticEvent) {
    e.preventDefault()
    setPasskeyError(undefined)
    setAddingPasskey(true)

    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName ? passkeyName : 'Passkey Credential',
      })

      if (result.error) {
        setPasskeyError(result.error.message ?? 'Failed to register passkey. Please try again.')
        setAddingPasskey(false)
        return
      }

      toast.show({
        title: 'Passkey registered',
        description: 'You can now sign in securely using this passkey.',
        variant: 'success',
      })

      setPasskeyName('')
      setAddPasskeyOpen(false)
      setAddingPasskey(false)
      void loadPasskeys()
    } catch {
      setPasskeyError('Passkey registration was cancelled or not supported by this browser.')
      setAddingPasskey(false)
    }
  }

  async function handleDeletePasskey(id: string, name?: string | null) {
    try {
      const result = await authClient.passkey.deletePasskey({ id })

      if (result.error) {
        toast.show({
          title: 'Could not delete passkey',
          description: result.error.message ?? 'Failed to delete passkey.',
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
        title: 'Error',
        description: 'Failed to delete passkey.',
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
      description: `${inviteEmail} was added to ${data?.workspace.name ?? 'the workspace'}.`,
      variant: 'success',
    })

    setInviteEmail('')
    setInviteOpen(false)
    setInviting(false)
    void loadWorkspace()
  }

  async function handleRoleChange(member: MemberDisplay, newRole: 'admin' | 'member') {
    const res = await updateMemberRoleAction({
      workspaceId,
      targetUserId: member.userId,
      role: newRole,
    })

    if (!res.success) {
      toast.show({
        title: 'Could not update role',
        description: res.error.detail,
        variant: 'critical',
      })
      return
    }

    toast.show({
      title: 'Role updated',
      description: `${member.name}'s role is now ${newRole}.`,
      variant: 'success',
    })

    void loadWorkspace()
  }

  async function handleRemoveMember(member: MemberDisplay) {
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
      description: `${member.name} was removed from the workspace.`,
      variant: 'success',
    })

    void loadWorkspace()
  }

  async function handleSignOut() {
    await signOut()
    router.push('/sign-in')
  }

  // ---------------------------------------------------------------------------
  // 1. Loading State
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <div className="flex items-center justify-between border-b border-border-subtle pb-6">
          <div className="flex flex-col gap-2">
            <Skeleton shape="text" className="h-8 w-48" />
            <Skeleton shape="text" className="h-4 w-32" />
          </div>
          <Skeleton shape="text" className="h-10 w-24" />
        </div>

        <div className="flex flex-col gap-4">
          <SkeletonText lines={3} />
          <Skeleton shape="block" className="h-64 w-full rounded-md" />
        </div>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // 2. Error State (including 404 Not Found for cross-workspace isolation)
  // ---------------------------------------------------------------------------
  if (error || !data) {
    return (
      <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="bg-surface-raised border-border-control flex w-full max-w-md flex-col items-center gap-6 rounded-lg border p-8 text-center shadow-elevation-1">
          <div className="bg-critical-subtle text-critical inline-flex size-12 items-center justify-center rounded-full">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-6"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-title text-content-primary">
              {error?.title ?? 'Not found'}
            </h1>
            <p className="text-body text-content-secondary">
              {error?.detail ?? 'We could not find this workspace.'}
            </p>
          </div>

          <div className="flex gap-4">
            <Button
              variant="secondary"
              onClick={() => {
                void loadWorkspace()
              }}
            >
              Try again
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                router.push('/workspaces/new')
              }}
            >
              Create new workspace
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const { workspace, members, currentRole, permissions } = data
  const canInvite = permissions.includes('member.invite')
  const canChangeRole = permissions.includes('member.role.change')
  const canRemove = permissions.includes('member.remove')

  // ---------------------------------------------------------------------------
  // 3. Populated & Empty States
  // ---------------------------------------------------------------------------
  return (
    <main id="main" className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      {/* Workspace Header */}
      <header className="border-border-subtle flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-title text-content-primary">{workspace.name}</h1>
            <span className="bg-positive-subtle text-positive rounded-sm px-2 py-0.5 text-caption font-medium uppercase">
              {workspace.status}
            </span>
          </div>
          <p className="text-caption text-content-secondary">
            Storefront:{' '}
            <span className="text-content-primary font-mono">{workspace.slug}.creatorhub.com</span>{' '}
            · Currency: {workspace.defaultCurrency} · Your role:{' '}
            <strong className="text-content-primary capitalize">{currentRole}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canInvite && (
            <Dialog
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              title="Invite workspace member"
              description="Collaborators will have access to view or manage your workspace depending on their role."
              trigger={
                <Button variant="primary" size="medium">
                  Invite member
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
                  <div
                    role="alert"
                    className="bg-critical-subtle text-critical border-critical rounded-sm border p-3 text-caption"
                  >
                    {inviteError}
                  </div>
                )}

                <Input
                  label="Colleague's email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value)
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
                  >
                    Send invitation
                  </Button>
                </div>
              </form>
            </Dialog>
          )}

          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              router.push(`/workspaces/${workspaceId}/products`)
            }}
          >
            Products
          </Button>

          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              router.push(`/workspaces/${workspaceId}/assets`)
            }}
          >
            Assets
          </Button>

          <Button
            variant="ghost"
            size="medium"
            onClick={() => {
              void handleSignOut()
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      {/* Workspace Modules Hub */}
      <section
        aria-labelledby="workspace-hub-heading"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 id="workspace-hub-heading" className="sr-only">
          Workspace Modules
        </h2>

        {/* Storefront Studio Card */}
        <Link
          href={`/workspaces/${workspaceId}/storefront`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Studio →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Storefront Studio
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Live preview, theme tokens, layout presets, and custom domain settings.
            </p>
          </div>
        </Link>

        {/* Product Catalogue Card */}
        <Link
          href={`/workspaces/${workspaceId}/products`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Catalogue →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Product Catalogue
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Create and manage digital courses, templates, pricing, and downloads.
            </p>
          </div>
        </Link>

        {/* Orders & Sales Card */}
        <Link
          href={`/workspaces/${workspaceId}/orders`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Orders →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Orders & Sales
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Track customer purchases, fulfillment tokens, resend delivery emails, and manage refunds.
            </p>
          </div>
        </Link>

        {/* Customers CRM Card */}
        <Link
          href={`/workspaces/${workspaceId}/customers`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-purple-50 p-2 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Customers →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Customer CRM
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Directory of buyer relationships, lifetime value (LTV), and purchase history.
            </p>
          </div>
        </Link>

        {/* Affiliate Programme Card */}
        <Link
          href={`/workspaces/${workspaceId}/affiliates`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Affiliates →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Affiliate Programme
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Manage promoters, commission rates, track referral conversions, and generate links.
            </p>
          </div>
        </Link>

        {/* Digital Assets Card */}
        <Link
          href={`/workspaces/${workspaceId}/assets`}
          className="group relative flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition-all hover:border-neutral-900 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-100"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="rounded-lg bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </span>
              <span className="text-xs font-semibold text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
                Assets →
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Digital Assets
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Upload deliverables, cover images, and media with antivirus verification.
            </p>
          </div>
        </Link>
      </section>

      {/* Members Management Surface */}
      <section aria-labelledby="members-heading" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 id="members-heading" className="font-display text-heading text-content-primary">
            Workspace Members ({members.length.toString()})
          </h2>
        </div>

        {members.length === 0 ? (
          <div className="bg-surface-raised border-border-control rounded-lg border p-12 text-center">
            <p className="text-body text-content-secondary">No members found in this workspace.</p>
          </div>
        ) : (
          <div className="bg-surface-raised border-border-control overflow-x-auto rounded-lg border shadow-elevation-1">
            <table className="w-full text-left text-body">
              <thead className="border-border-subtle bg-surface-sunken border-b text-caption text-content-secondary font-medium">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    Member
                  </th>
                  <th scope="col" className="px-6 py-3">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3">
                    Joined
                  </th>
                  {(canChangeRole || canRemove) && (
                    <th scope="col" className="px-6 py-3 text-right">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-border-subtle divide-y">
                {members.map((m) => {
                  const isOwner = m.role === 'owner'

                  return (
                    <tr key={m.id} className="hover:bg-surface-sunken/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-content-primary font-medium">{m.name}</span>
                          <span className="text-caption text-content-secondary">{m.email}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-sm px-2 py-0.5 text-caption font-medium capitalize ${
                            isOwner
                              ? 'bg-accent/15 text-accent'
                              : m.role === 'admin'
                                ? 'bg-info-subtle text-info'
                                : 'bg-surface-sunken text-content-secondary'
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-caption text-content-tertiary">
                        {new Date(m.joinedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {(canChangeRole || canRemove) && (
                        <td className="px-6 py-4 text-right">
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
                                  className="text-caption text-content-secondary hover:text-content-primary rounded-sm px-2 py-1 underline focus:outline-none"
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
                                  className="text-caption text-critical hover:opacity-80 rounded-sm px-2 py-1 focus:outline-none"
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
        )}
      </section>

      {/* Security & Passkeys Surface */}
      <section aria-labelledby="passkeys-heading" className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <h2 id="passkeys-heading" className="font-display text-heading text-content-primary">
              Security & Passkeys
            </h2>
            <p className="text-caption text-content-secondary">
              Passkeys let you sign in securely without typing passwords using biometric hardware or
              security keys.
            </p>
          </div>

          <Dialog
            open={addPasskeyOpen}
            onOpenChange={setAddPasskeyOpen}
            title="Register a new passkey"
            description="Your device will prompt you to authenticate via Touch ID, Face ID, Windows Hello, or a security key."
            trigger={
              <Button variant="secondary" size="medium">
                Add passkey
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
                <div
                  role="alert"
                  className="bg-critical-subtle text-critical border-critical rounded-sm border p-3 text-caption"
                >
                  {passkeyError}
                </div>
              )}

              <Input
                label="Passkey name / Device label"
                type="text"
                value={passkeyName}
                onChange={(e) => {
                  setPasskeyName(e.target.value)
                }}
                disabled={addingPasskey}
                placeholder="e.g. MacBook Touch ID, Work YubiKey"
              />

              <div className="mt-4 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setAddPasskeyOpen(false)
                  }}
                  disabled={addingPasskey}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={addingPasskey}
                  loadingLabel="Registering passkey..."
                >
                  Register passkey
                </Button>
              </div>
            </form>
          </Dialog>
        </div>

        {passkeysLoading ? (
          <div className="bg-surface-raised border-border-control flex flex-col gap-3 rounded-lg border p-6">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : passkeysList.length === 0 ? (
          <div className="bg-surface-raised border-border-control flex flex-col items-center gap-3 rounded-lg border p-8 text-center">
            <p className="text-body text-content-secondary">
              No passkeys registered yet. Add a passkey to enable instant, phishing-resistant
              sign-in.
            </p>
          </div>
        ) : (
          <div className="bg-surface-raised border-border-control divide-border-subtle divide-y overflow-hidden rounded-lg border shadow-elevation-1">
            {passkeysList.map((pk) => (
              <div key={pk.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-content-primary font-medium">{pk.name ?? 'Passkey'}</span>
                  <span className="text-caption text-content-secondary">
                    {pk.createdAt
                      ? `Added on ${new Date(pk.createdAt).toLocaleDateString()}`
                      : 'Registered passkey'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePasskey(pk.id, pk.name)
                  }}
                  className="text-caption text-critical hover:opacity-80 rounded-sm px-2 py-1 focus:outline-none"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
