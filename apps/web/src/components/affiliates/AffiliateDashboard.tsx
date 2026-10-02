'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Landmark, Smartphone } from 'lucide-react'
import { Button, Input, useToast } from '@creatorhub/ui'

import {
  Badge,
  Card,
  CardHeader,
  CopyButton,
  Logo,
  Notice,
  Segmented,
  Stat,
  type Tone,
} from '@/components/ds'
import { saveAffiliatePayoutAccountAction } from '@/lib/affiliate-actions'
import type { AffiliatePortalData } from '@/lib/affiliate-portal'
import { formatAmount, formatDate } from '@/lib/format'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  held: { label: 'On hold', tone: 'neutral' },
  vested: { label: 'Payable', tone: 'positive' },
  paid: { label: 'Paid', tone: 'info' },
  clawed_back: { label: 'Reversed', tone: 'caution' },
}

function PayoutForm({ data }: { readonly data: AffiliatePortalData }) {
  const router = useRouter()
  const toast = useToast()
  const current = data.payoutAccount
  const [method, setMethod] = useState<'upi' | 'bank'>(current?.method ?? 'upi')
  const [upiId, setUpiId] = useState(current?.method === 'upi' ? current.upiId : '')
  const [accountName, setAccountName] = useState(
    current?.method === 'bank' ? current.accountName : '',
  )
  const [accountNumber, setAccountNumber] = useState(
    current?.method === 'bank' ? current.accountNumber : '',
  )
  const [ifsc, setIfsc] = useState(current?.method === 'bank' ? current.ifsc : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function save() {
    setBusy(true)
    setError(undefined)
    const result = await saveAffiliatePayoutAccountAction(
      data.store.subdomain,
      data.code,
      method === 'upi' ? { method, upiId } : { method, accountName, accountNumber, ifsc },
    )
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.show({ title: 'Payout details saved', variant: 'success' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="Where to pay you"
        description="Payable commissions are sent here. Check the details carefully; a payment to the wrong account cannot be pulled back."
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Segmented<'upi' | 'bank'>
          label="Payout method"
          value={method}
          onChange={setMethod}
          options={[
            {
              value: 'upi',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="size-3.5" aria-hidden="true" />
                  UPI
                </span>
              ),
            },
            {
              value: 'bank',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Landmark className="size-3.5" aria-hidden="true" />
                  Bank account
                </span>
              ),
            },
          ]}
        />
        {method === 'upi' ? (
          <Input
            label="UPI ID"
            placeholder="name@okhdfcbank"
            value={upiId}
            onChange={(e) => {
              setUpiId(e.target.value.trim())
            }}
          />
        ) : (
          <>
            <Input
              label="Name on account"
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value)
              }}
            />
            <Input
              label="Account number"
              inputMode="numeric"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/\D/g, ''))
              }}
            />
            <Input
              label="IFSC"
              placeholder="HDFC0001234"
              maxLength={11}
              value={ifsc}
              onChange={(e) => {
                setIfsc(e.target.value.toUpperCase())
              }}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy}>
          {current ? 'Update details' : 'Save details'}
        </Button>
      </form>
    </Card>
  )
}

export function AffiliateDashboard({ data }: { readonly data: AffiliatePortalData }) {
  const paused = data.affiliate.status !== 'approved'
  const pct = `${(data.commissionBps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

  return (
    <div className="min-h-dvh bg-surface-base">
      <header className="border-b border-border-subtle bg-surface-raised/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="text-caption text-content-tertiary">{data.affiliate.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-caption font-medium tracking-wide text-accent uppercase">
          Affiliate dashboard
        </p>
        <h1 className="mt-2 font-display text-[clamp(2rem,4vw,2.75rem)] leading-tight tracking-tight">
          {data.store.title}
        </h1>
        <p className="mt-2 max-w-2xl text-body text-content-secondary">
          You earn {pct} of every sale made within {data.cookieWindowDays} days of someone clicking
          your link. Commissions are held for 30 days in case of a refund, then become payable.
        </p>

        {(paused || !data.programActive) && (
          <div className="mt-6">
            <Notice
              tone="caution"
              title={paused ? 'Your link is paused' : 'The programme is paused'}
            >
              {paused
                ? `${data.store.title} has paused your referrals. Sales through your link do not earn commission right now.`
                : `${data.store.title} has paused commissions. Your link still works, and you will earn again when they switch it back on.`}
            </Notice>
          </div>
        )}

        <Card className="mt-8">
          <CardHeader
            title="Your link"
            description="Share it anywhere: your bio, a video description, a newsletter."
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 truncate rounded-lg border border-border-subtle bg-surface-sunken/60 px-3.5 py-2.5 font-mono text-[13px]">
              {data.referralUrl}
            </div>
            <div className="flex gap-2">
              <CopyButton value={data.referralUrl} label="Copy link" className="h-10 px-3.5" />
              <a
                href={data.store.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border-subtle px-3.5 text-caption font-medium text-content-secondary hover:text-content-primary"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Visit store
              </a>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Clicks" value={data.clicks.toLocaleString('en-IN')} />
          <Stat label="Sales" value={data.conversions.toLocaleString('en-IN')} />
          <Stat label="On hold" value={formatAmount(data.balances.held, data.currency)} />
          <Stat label="Payable to you" value={formatAmount(data.balances.payable, data.currency)} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader
              title="Commissions"
              description={`Paid to you so far: ${formatAmount(data.balances.paid, data.currency)}`}
            />
            {data.commissions.length === 0 ? (
              <p className="text-body text-content-secondary">
                No sales yet. When someone buys through your link, it appears here within seconds.
              </p>
            ) : (
              <ul className="-mx-2 divide-y divide-border-subtle">
                {data.commissions.map((c) => {
                  const status = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as Tone }
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-2 py-3">
                      <div>
                        <p className="text-body font-medium tabular-nums">
                          {formatAmount(c.amount, data.currency)}
                        </p>
                        <p className="text-caption text-content-tertiary">
                          on a {formatAmount(c.saleAmount, data.currency)} sale ·{' '}
                          {formatDate(c.createdAt)}
                          {c.status === 'held' ? ` · payable from ${formatDate(c.heldUntil)}` : ''}
                        </p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <div className="self-start">
            <PayoutForm data={data} />
          </div>
        </div>
      </main>
    </div>
  )
}
