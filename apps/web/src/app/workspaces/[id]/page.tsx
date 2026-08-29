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
import { useRouter } from 'next/navigation'
import { Button, Dialog, Input, Select, Skeleton, SkeletonText, useToast } from '@creatorhub/ui'

import { signOut } from '@/lib/auth-client'
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
    </main>
  )
}
