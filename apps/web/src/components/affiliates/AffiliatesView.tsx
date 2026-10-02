'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Handshake, Pause, Play, UserPlus } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@creatorhub/ui'

import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  Notice,
  PageHeader,
  Stat,
  Switch,
  Table,
  Td,
  Th,
  type Tone,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import {
  inviteAffiliateAction,
  saveAffiliateProgramAction,
  setAffiliateStatusAction,
} from '@/lib/affiliate-actions'
import type { AffiliatesData } from '@/lib/dashboard-data'
import { formatAmount, formatDate } from '@/lib/format'

const COMMISSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  held: { label: 'On hold', tone: 'neutral' },
  vested: { label: 'Payable', tone: 'positive' },
  paid: { label: 'Paid', tone: 'info' },
  clawed_back: { label: 'Reversed', tone: 'caution' },
}

function pct(bps: number): string {
  return `${(bps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`
}

function suggestCode(name: string, email: string): string {
  const base = (name || email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return base.slice(0, 20) || ''
}

function ProgramCard({ program }: { readonly program: AffiliatesData['program'] }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace } = useWorkspace()
  const [active, setActive] = useState(program.isActive)
  const [percent, setPercent] = useState(String(program.commissionBps / 100))
  const [days, setDays] = useState(String(program.cookieWindowDays))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save(nextActive = active) {
    setBusy(true)
    setError(undefined)
    const result = await saveAffiliateProgramAction(workspace.id, {
      isActive: nextActive,
      commissionPercent: percent,
      cookieWindowDays: Number(days),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      setActive(program.isActive)
      return
    }
    toast.show({
      title: result.data.isActive ? 'Affiliate programme is on' : 'Programme settings saved',
      variant: 'success',
    })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="Programme"
        description="Affiliates share your store with their audience and earn a cut of each sale they send you."
      />
      <div className="space-y-5">
        <Switch
          checked={active}
          onCheckedChange={(next) => {
            setActive(next)
            void save(next)
          }}
          label="Pay commission on referred sales"
          description="While off, referral links still work but no new commission is earned."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Default commission"
            inputMode="decimal"
            suffix="%"
            value={percent}
            hint="Of the price before GST"
            onChange={(e) => {
              setPercent(e.target.value)
            }}
          />
          <Input
            label="Cookie window"
            inputMode="numeric"
            suffix="days"
            value={days}
            hint="How long after a click a sale still counts"
            onChange={(e) => {
              setDays(e.target.value.replace(/\D/g, ''))
            }}
          />
        </div>
        <p className="text-caption text-content-tertiary">
          Commissions are held for 30 days so a refund can reverse them, then become payable.
          CreatorHub pays affiliates from the commission it keeps aside on each sale; you never pay
          them by hand.
        </p>
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        <Button variant="secondary" loading={busy} onClick={() => void save()}>
          Save settings
        </Button>
      </div>
    </Card>
  )
}

function InviteDialog({ defaultBps }: { readonly defaultBps: number }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace, storefront } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [percent, setPercent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const effectiveCode = codeTouched ? code : suggestCode(name, email)

  async function submit() {
    setBusy(true)
    setError(undefined)
    const result = await inviteAffiliateAction(workspace.id, {
      name,
      email,
      code: effectiveCode,
      commissionPercent: percent,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.show({
      title: 'Affiliate invited',
      description: `${email} has their link and a dashboard.`,
      variant: 'success',
    })
    setOpen(false)
    setName('')
    setEmail('')
    setCode('')
    setCodeTouched(false)
    setPercent('')
    router.refresh()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Invite an affiliate"
      description="They get an email with their referral link and a dashboard showing clicks, sales, and earnings."
      trigger={
        <Button disabled={!storefront}>
          <UserPlus className="size-4" aria-hidden="true" />
          Invite affiliate
        </Button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          label="Name"
          value={name}
          placeholder="Rohan Mehta"
          onChange={(e) => {
            setName(e.target.value)
          }}
        />
        <Input
          label="Email"
          type="email"
          value={email}
          placeholder="rohan@example.com"
          onChange={(e) => {
            setEmail(e.target.value)
          }}
        />
        <Input
          label="Referral code"
          value={effectiveCode}
          {...(storefront
            ? { hint: `${storefront.url.replace(/^https?:\/\//, '')}?ref=${effectiveCode || 'code'}` }
            : {})}
          onChange={(e) => {
            setCodeTouched(true)
            setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
          }}
        />
        <Input
          label="Commission"
          inputMode="decimal"
          suffix="%"
          placeholder={String(defaultBps / 100)}
          value={percent}
          hint="Leave empty to use your default"
          onChange={(e) => {
            setPercent(e.target.value)
          }}
        />
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!email || !effectiveCode}>
            Send invite
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function AffiliatesView({ data }: { readonly data: AffiliatesData }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace } = useWorkspace()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function toggle(id: string, status: string) {
    setBusyId(id)
    const result = await setAffiliateStatusAction(
      workspace.id,
      id,
      status === 'approved' ? 'suspended' : 'approved',
    )
    setBusyId(null)
    if (!result.ok) {
      toast.show({
        title: 'Could not update the affiliate',
        description: result.error,
        variant: 'critical',
      })
      return
    }
    router.refresh()
  }

  return (
    <div>
      <PageHeader
        title="Affiliates"
        description="People who sell for you, and what they have earned."
        actions={<InviteDialog defaultBps={data.program.commissionBps} />}
      />

      {!data.program.isActive && data.affiliates.length > 0 && (
        <div className="mb-6">
          <Notice tone="caution" title="Your programme is off">
            Referral links still bring people to your store, but sales they make earn no commission
            until you switch it on.
          </Notice>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Link clicks" value={data.totals.clicks.toLocaleString('en-IN')} />
        <Stat label="Referred sales" value={data.totals.conversions.toLocaleString('en-IN')} />
        <Stat
          label="Referred revenue"
          value={formatAmount(data.totals.referredSales, workspace.currency, { compact: true })}
        />
        <Stat
          label="Commission owed"
          value={formatAmount(data.totals.commissionOwed, workspace.currency, { compact: true })}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {data.affiliates.length === 0 ? (
            <EmptyState
              icon={<Handshake />}
              title="No affiliates yet"
              description="Invite a fan, a fellow creator, or a community you belong to. Each gets their own link and sees their earnings in a dashboard."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Affiliate</Th>
                  <Th>Link</Th>
                  <Th align="right">Clicks</Th>
                  <Th align="right">Sales</Th>
                  <Th align="right">Earned</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.affiliates.map((a) => {
                  const earned = BigInt(a.held) + BigInt(a.payable) + BigInt(a.paid)
                  return (
                    <tr key={a.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar label={a.name ?? a.email} />
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-medium">
                              {a.name ?? a.email}
                              {a.status !== 'approved' && <Badge tone="neutral">Paused</Badge>}
                            </p>
                            <p className="truncate text-caption text-content-tertiary">
                              {a.email} · {pct(a.commissionBps)}
                              {a.isCustomRate ? ' (custom)' : ''}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {a.referralUrl ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-mono text-[13px]">?ref={a.code}</span>
                            <CopyButton
                              value={a.referralUrl}
                              label={`Copy ${a.code} link`}
                              iconOnly
                              className="size-7 border-transparent"
                            />
                          </span>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {a.clicks.toLocaleString('en-IN')}
                      </Td>
                      <Td align="right" className="tabular-nums">
                        {a.conversions.toLocaleString('en-IN')}
                      </Td>
                      <Td align="right">
                        <span className="block tabular-nums">
                          {formatAmount(earned, workspace.currency)}
                        </span>
                        {BigInt(a.payable) > 0n && (
                          <span className="text-caption text-positive">
                            {formatAmount(a.payable, workspace.currency)} payable
                          </span>
                        )}
                      </Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="small"
                          loading={busyId === a.id}
                          aria-label={`${a.status === 'approved' ? 'Pause' : 'Resume'} ${a.name ?? a.email}`}
                          onClick={() => void toggle(a.id, a.status)}
                        >
                          {a.status === 'approved' ? (
                            <Pause className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Play className="size-3.5" aria-hidden="true" />
                          )}
                          {a.status === 'approved' ? 'Pause' : 'Resume'}
                        </Button>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}

          <Card>
            <CardHeader
              title="Recent commissions"
              description="Every referred sale, and where its commission is in the hold."
            />
            {data.recent.length === 0 ? (
              <p className="text-body text-content-secondary">No referred sales yet.</p>
            ) : (
              <ul className="-mx-2 divide-y divide-border-subtle">
                {data.recent.map((c) => {
                  const status = COMMISSION_STATUS[c.status] ?? {
                    label: c.status,
                    tone: 'neutral' as Tone,
                  }
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-body font-medium">{c.affiliateName}</p>
                        <p className="text-caption text-content-tertiary">
                          {formatAmount(c.saleAmount, workspace.currency)} sale ·{' '}
                          {formatDate(c.createdAt)}
                          {c.status === 'held' ? ` · payable from ${formatDate(c.heldUntil)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular-nums">
                          {formatAmount(c.amount, workspace.currency)}
                        </span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="self-start xl:sticky xl:top-6">
          <ProgramCard program={data.program} />
        </div>
      </div>
    </div>
  )
}
