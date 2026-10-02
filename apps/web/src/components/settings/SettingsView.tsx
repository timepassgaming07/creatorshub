'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Check,
  CreditCard,
  Fingerprint,
  KeyRound,
  Receipt,
  Trash2,
  Users,
} from 'lucide-react'
import { GSTIN_PATTERN, INDIAN_STATES, gstStateCode } from '@creatorhub/contracts'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import { PasswordField } from '@/components/auth/PasswordField'
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  cn,
  DetailList,
  Notice,
  PageHeader,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { authClient } from '@/lib/auth-client'
import type { SettingsData } from '@/lib/dashboard-data'
import { formatDate } from '@/lib/format'
import { updateTaxSettingsAction, updateWorkspaceNameAction } from '@/lib/settings-actions'
import {
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from '@/lib/workspace-actions'

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const
const ROLE_HINT = {
  admin: 'Runs the store day to day: products, orders, refunds, payouts. Cannot change roles.',
  member: 'Can see the dashboard. Cannot change anything.',
} as const

function GeneralSection({
  data,
  canEdit,
}: {
  readonly data: SettingsData
  readonly canEdit: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const { storefront } = useWorkspace()
  const [name, setName] = useState(data.workspace.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save() {
    setBusy(true)
    setError(undefined)
    const result = await updateWorkspaceNameAction(data.workspace.id, name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.show({ title: 'Workspace renamed', variant: 'success' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="Workspace"
        description="Your business name appears on receipts and in emails to buyers."
      />
      <form
        className="max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input
          label="Business name"
          value={name}
          disabled={!canEdit}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value)
          }}
          {...(error ? { error } : {})}
        />
        {canEdit && (
          <Button type="submit" loading={busy} disabled={name.trim() === data.workspace.name}>
            Save
          </Button>
        )}
      </form>
      <div className="mt-6 border-t border-border-subtle pt-5">
        <DetailList
          items={[
            {
              label: 'Store address',
              value: storefront?.url.replace(/^https?:\/\//, '') ?? 'Not set up',
            },
            { label: 'Currency', value: data.workspace.currency },
            {
              label: 'Workspace ID',
              value: <span className="font-mono text-[12px]">{data.workspace.id}</span>,
            },
          ]}
        />
      </div>
    </Card>
  )
}

function TeamSection({ data }: { readonly data: SettingsData }) {
  const router = useRouter()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('admin')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string>()
  const [busyUser, setBusyUser] = useState<string | null>(null)
  const canInvite = data.role !== 'member'
  const canChangeRoles = data.role === 'owner'

  async function invite() {
    setInviting(true)
    setInviteError(undefined)
    const result = await inviteMemberAction({ workspaceId: data.workspace.id, email, role })
    setInviting(false)
    if (!result.success) {
      setInviteError(result.error.detail)
      return
    }
    toast.show({
      title: 'Invitation sent',
      description: `${email} will get an email with a link to join.`,
      variant: 'success',
    })
    setEmail('')
    router.refresh()
  }

  async function changeRole(targetUserId: string, next: 'admin' | 'member') {
    setBusyUser(targetUserId)
    const result = await updateMemberRoleAction({
      workspaceId: data.workspace.id,
      targetUserId,
      role: next,
    })
    setBusyUser(null)
    if (!result.success) {
      toast.show({
        title: result.error.title,
        description: result.error.detail,
        variant: 'critical',
      })
      return
    }
    router.refresh()
  }

  async function remove(targetUserId: string, label: string) {
    if (!window.confirm(`Remove ${label} from this workspace? They lose access immediately.`))
      return
    setBusyUser(targetUserId)
    const result = await removeMemberAction({ workspaceId: data.workspace.id, targetUserId })
    setBusyUser(null)
    if (!result.success) {
      toast.show({
        title: result.error.title,
        description: result.error.detail,
        variant: 'critical',
      })
      return
    }
    toast.show({ title: `${label} removed` })
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {canInvite && (
        <Card>
          <CardHeader
            title="Invite someone"
            description="An editor, a VA, your accountant. They get an email with a link to join."
          />
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              void invite()
            }}
          >
            <Input
              label="Email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
              }}
            />
            <Select
              label="Role"
              value={role}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'member', label: 'Member' },
              ]}
              onValueChange={(value) => {
                setRole(value as 'admin' | 'member')
              }}
            />
            <Button type="submit" loading={inviting} disabled={!email.includes('@')}>
              Send invite
            </Button>
          </form>
          <p className="mt-2 text-caption text-content-tertiary">{ROLE_HINT[role]}</p>
          {inviteError && (
            <p role="alert" className="mt-2 text-body text-critical">
              {inviteError}
            </p>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="People"
          description={`${String(data.members.length)} with access to this workspace`}
        />
        <ul className="-mx-2 divide-y divide-border-subtle">
          {data.members.map((m) => {
            const isSelf = m.userId === data.currentUserId
            const label = m.name || m.email
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-2 py-3">
                <Avatar label={label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">
                    {label}
                    {isSelf && <span className="ml-1.5 text-content-tertiary">(you)</span>}
                  </p>
                  <p className="truncate text-caption text-content-tertiary">
                    {m.email} · joined {formatDate(m.joinedAt)}
                  </p>
                </div>
                {m.role === 'owner' || !canChangeRoles ? (
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>
                    {ROLE_LABEL[m.role]}
                  </Badge>
                ) : (
                  <div className="w-32">
                    <Select
                      label={`Role for ${label}`}
                      labelHidden
                      value={m.role}
                      disabled={busyUser === m.userId}
                      options={[
                        { value: 'admin', label: 'Admin' },
                        { value: 'member', label: 'Member' },
                      ]}
                      onValueChange={(value) =>
                        void changeRole(m.userId, value as 'admin' | 'member')
                      }
                    />
                  </div>
                )}
                {m.role !== 'owner' && data.role !== 'member' && !isSelf && (
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    title={`Remove ${label}`}
                    disabled={busyUser === m.userId}
                    onClick={() => void remove(m.userId, label)}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-content-tertiary transition-colors hover:bg-critical-subtle hover:text-critical disabled:opacity-40"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

const GST_RATES = [
  { value: '1800', label: '18% (most digital products and services)' },
  { value: '1200', label: '12%' },
  { value: '500', label: '5%' },
  { value: '0', label: '0% (exempt)' },
]

function TaxSection({ data, canEdit }: { readonly data: SettingsData; readonly canEdit: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const initial = data.taxSettings
  const [registered, setRegistered] = useState(initial.gstRegistered)
  const [gstin, setGstin] = useState(initial.gstRegistered ? initial.gstin : '')
  const [legalName, setLegalName] = useState(initial.gstRegistered ? initial.legalName : '')
  const [rate, setRate] = useState(String(initial.gstRegistered ? initial.rateBasisPoints : 1800))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const cleanGstin = gstin.trim().toUpperCase()
  const state = GSTIN_PATTERN.test(cleanGstin)
    ? INDIAN_STATES.find((s) => s.code === gstStateCode(cleanGstin))?.name
    : undefined

  async function save() {
    setBusy(true)
    setError(undefined)
    const result = await updateTaxSettingsAction(
      data.workspace.id,
      registered
        ? { gstRegistered: true, gstin: cleanGstin, legalName, rateBasisPoints: Number(rate) }
        : { gstRegistered: false },
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.show({
      title: 'Tax settings saved',
      description: registered
        ? 'Checkout now adds GST to every sale.'
        : 'Checkout no longer adds GST.',
      variant: 'success',
    })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="GST"
        description="If you are registered, checkout adds GST on top of your price and splits it correctly for each buyer."
      />
      <div className="max-w-xl space-y-5">
        <Switch
          checked={registered}
          onCheckedChange={setRegistered}
          disabled={!canEdit}
          label="I am registered for GST"
          description="Most creators earning under ₹20 lakh a year are not, and should leave this off."
        />
        {registered && (
          <>
            <Input
              label="GSTIN"

              placeholder="27ABCDE1234F1Z5"
              maxLength={15}
              value={gstin}
              disabled={!canEdit}
              hint={
                state
                  ? `Registered in ${state}`
                  : '15 characters, from your registration certificate'
              }
              onChange={(e) => {
                setGstin(e.target.value.toUpperCase())
              }}
            />
            <Input
              label="Legal name"
              hint="Exactly as on your GST registration. Printed on tax invoices."
              value={legalName}
              disabled={!canEdit}
              onChange={(e) => {
                setLegalName(e.target.value)
              }}
            />
            <Select
              label="GST rate"
              value={rate}
              options={GST_RATES}
              disabled={!canEdit}
              onValueChange={setRate}
            />
            <Notice tone="info" title="How checkout splits it">
              Buyers in {state ?? 'your state'} pay CGST and SGST, half each. Buyers in other states
              pay IGST. Buyers outside India pay none.
            </Notice>
          </>
        )}
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        {canEdit && (
          <Button loading={busy} onClick={() => void save()}>
            Save tax settings
          </Button>
        )}
      </div>
    </Card>
  )
}

type Passkey = {
  readonly id: string
  readonly name?: string | null
  readonly createdAt: Date | string
}

function SecuritySection() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [passkeys, setPasskeys] = useState<readonly Passkey[] | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  async function loadPasskeys() {
    const result = await authClient.passkey.listUserPasskeys()
    setPasskeys((result.data as Passkey[] | null) ?? [])
  }

  useEffect(() => {
    void loadPasskeys()
  }, [])

  async function changePassword() {
    setError(undefined)
    if (next.length < 10) {
      setError('Use at least 10 characters for the new password.')
      return
    }
    setBusy(true)
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: signOutOthers,
    })
    setBusy(false)
    if (result.error) {
      setError(
        result.error.status === 400 || result.error.status === 401
          ? 'Your current password is not right.'
          : 'We could not change your password. Try again.',
      )
      return
    }
    setCurrent('')
    setNext('')
    toast.show({
      title: 'Password changed',
      ...(signOutOthers ? { description: 'Other devices have been signed out.' } : {}),
      variant: 'success',
    })
  }

  async function addPasskey() {
    setPasskeyBusy(true)
    const result = await authClient.passkey.addPasskey({
      name: `${navigator.platform || 'This device'}`,
    })
    setPasskeyBusy(false)
    if (result?.error) {
      toast.show({
        title: 'Passkey not added',
        description: 'The request was cancelled or this device does not support passkeys.',
        variant: 'caution',
      })
      return
    }
    toast.show({
      title: 'Passkey added',
      description: 'Sign in with your fingerprint, face, or device PIN next time.',
      variant: 'success',
    })
    await loadPasskeys()
  }

  async function removePasskey(id: string) {
    await authClient.passkey.deletePasskey({ id })
    await loadPasskeys()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Password" />
        <form
          className="max-w-md space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void changePassword()
          }}
        >
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            value={current}
            onChange={setCurrent}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={setNext}
            error={error}
          />
          <Switch
            checked={signOutOthers}
            onCheckedChange={setSignOutOthers}
            label="Sign out of other devices"
          />
          <Button type="submit" loading={busy} disabled={!current || !next}>
            Change password
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Passkeys"
          description="Sign in with your fingerprint, face, or device PIN. Nothing to remember, nothing to phish."
          action={
            <Button variant="secondary" loading={passkeyBusy} onClick={() => void addPasskey()}>
              <Fingerprint className="size-4" aria-hidden="true" />
              Add passkey
            </Button>
          }
        />
        {passkeys === null ? (
          <p className="text-body text-content-tertiary">Loading…</p>
        ) : passkeys.length === 0 ? (
          <p className="text-body text-content-secondary">No passkeys yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <KeyRound className="size-4 text-content-tertiary" aria-hidden="true" />
                <span className="flex-1 text-body">
                  {p.name || 'Passkey'}
                  <span className="ml-2 text-caption text-content-tertiary">
                    added{' '}
                    {formatDate(p.createdAt instanceof Date ? p.createdAt : new Date(p.createdAt))}
                  </span>
                </span>
                <Button variant="ghost" size="small" onClick={() => void removePasskey(p.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    feeBps: 500,
    points: ['Unlimited products', 'Storefront and checkout', 'Affiliates and discounts'],
  },
  {
    name: 'Pro',
    price: '₹1,499 / month',
    feeBps: 200,
    points: ['Everything in Starter', 'Custom domain', 'AI copilot'],
  },
  {
    name: 'Team',
    price: '₹3,999 / month',
    feeBps: 0,
    points: ['Everything in Pro', 'Team roles', 'Priority support'],
  },
]

function PlanSection({ data }: { readonly data: SettingsData }) {
  const current = PLANS.find((p) => p.feeBps === data.workspace.platformFeeBps)
  return (
    <Card>
      <CardHeader
        title="Plan"
        description={`You pay a ${(data.workspace.platformFeeBps / 100).toLocaleString('en-IN')}% platform fee on each sale. Payment processing is charged separately by the payment provider.`}
      />
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan === current
          return (
            <div
              key={plan.name}
              className={cn(
                'rounded-xl border p-4',
                isCurrent ? 'border-accent bg-accent-subtle/40' : 'border-border-subtle',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-body font-semibold">{plan.name}</p>
                {isCurrent && <Badge tone="accent">Current</Badge>}
              </div>
              <p className="mt-1 text-heading">{plan.price}</p>
              <p className="text-caption text-content-tertiary">{plan.feeBps / 100}% per sale</p>
              <ul className="mt-3 space-y-1.5">
                {plan.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-caption text-content-secondary"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-caption text-content-secondary">
        Paid plans are opening to creators in batches.{' '}
        <Link href="/pricing" className="font-medium text-accent hover:underline">
          Join the waitlist
        </Link>{' '}
        to move to a lower fee.
      </p>
    </Card>
  )
}

export function SettingsView({ data }: { readonly data: SettingsData }) {
  const canEdit = data.role !== 'member'
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your workspace, your team, taxes, and how you sign in."
      />
      {!canEdit && (
        <div className="mb-6">
          <Notice tone="info">
            You are a member here, so these settings are read-only. Ask an owner or admin to change
            them.
          </Notice>
        </div>
      )}
      <Tabs defaultValue="general">
        <TabList label="Settings sections">
          <Tab value="general">
            <Building2 className="size-4" aria-hidden="true" />
            General
          </Tab>
          <Tab value="team">
            <Users className="size-4" aria-hidden="true" />
            Team
          </Tab>
          <Tab value="tax">
            <Receipt className="size-4" aria-hidden="true" />
            Taxes
          </Tab>
          <Tab value="security">
            <KeyRound className="size-4" aria-hidden="true" />
            Security
          </Tab>
          <Tab value="plan">
            <CreditCard className="size-4" aria-hidden="true" />
            Plan
          </Tab>
        </TabList>
        <div className="pt-6">
          <TabPanel value="general">
            <GeneralSection data={data} canEdit={canEdit} />
          </TabPanel>
          <TabPanel value="team">
            <TeamSection data={data} />
          </TabPanel>
          <TabPanel value="tax">
            <TaxSection data={data} canEdit={canEdit} />
          </TabPanel>
          <TabPanel value="security">
            <SecuritySection />
          </TabPanel>
          <TabPanel value="plan">
            <PlanSection data={data} />
          </TabPanel>
        </div>
      </Tabs>
    </div>
  )
}
