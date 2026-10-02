'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowUpRight,
  Check,
  Landmark,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { Button, Dialog, Input, Select, useToast } from '@creatorhub/ui'

import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Notice,
  PageHeader,
  Segmented,
  Stat,
  Table,
  Td,
  Th,
  type Tone,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import type { PayoutsData } from '@/lib/dashboard-data'
import {
  formatAmount,
  formatDate,
  formatDateTime,
  minorToInput,
  parsePriceToMinor,
} from '@/lib/format'
import {
  approvePayoutAction,
  createBeneficiaryAccountAction,
  deleteBeneficiaryAccountAction,
  rejectPayoutAction,
  requestPayoutAction,
  setDefaultBeneficiaryAccountAction,
} from '@/lib/payout-actions'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'Awaiting approval', tone: 'caution' },
  approved: { label: 'Approved', tone: 'info' },
  processing: { label: 'On the way', tone: 'info' },
  paid: { label: 'Paid', tone: 'positive' },
  failed: { label: 'Not paid', tone: 'critical' },
  reversed: { label: 'Returned', tone: 'critical' },
}

const DAY_MS = 24 * 60 * 60 * 1000

function AddAccountDialog({ onAdded }: { readonly onAdded: () => void }) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'vpa' | 'bank_account'>('vpa')
  const [holder, setHolder] = useState('')
  const [vpa, setVpa] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [confirmNumber, setConfirmNumber] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function submit() {
    setError(undefined)
    if (kind === 'bank_account' && accountNumber !== confirmNumber) {
      setError('The account numbers do not match.')
      return
    }
    setBusy(true)
    const result = await createBeneficiaryAccountAction(workspace.id, {
      payeeType: 'workspace',
      payeeId: workspace.id,
      accountHolderName: holder,
      accountType: kind,
      ...(kind === 'vpa' ? { vpa } : { accountNumber, ifscCode: ifsc }),
      isDefault: true,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    toast.show({
      title: 'Payout account added',
      description: 'We emailed the owners of this workspace about it, as a safety check.',
      variant: 'success',
    })
    setOpen(false)
    setHolder('')
    setVpa('')
    setAccountNumber('')
    setConfirmNumber('')
    setIfsc('')
    onAdded()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Add a payout account"
      description="Where your earnings go. Use an account in your own or your business's name."
      trigger={
        <Button variant="secondary" size="small">
          <Plus className="size-4" aria-hidden="true" />
          Add account
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
        <Segmented<'vpa' | 'bank_account'>
          label="Account type"
          value={kind}
          onChange={setKind}
          options={[
            {
              value: 'vpa',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="size-3.5" aria-hidden="true" />
                  UPI
                </span>
              ),
            },
            {
              value: 'bank_account',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Landmark className="size-3.5" aria-hidden="true" />
                  Bank account
                </span>
              ),
            },
          ]}
        />
        <Input
          label="Account holder name"
          value={holder}
          onChange={(e) => {
            setHolder(e.target.value)
          }}
        />
        {kind === 'vpa' ? (
          <Input
            label="UPI ID"
            placeholder="name@okhdfcbank"
            value={vpa}
            onChange={(e) => {
              setVpa(e.target.value.trim())
            }}
          />
        ) : (
          <>
            <Input
              label="Account number"
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/\D/g, ''))
              }}
            />
            <Input
              label="Confirm account number"
              inputMode="numeric"
              autoComplete="off"
              value={confirmNumber}
              onPaste={(e) => {
                e.preventDefault()
              }}
              onChange={(e) => {
                setConfirmNumber(e.target.value.replace(/\D/g, ''))
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
        <p className="text-caption text-content-tertiary">
          For your safety, payouts over ₹50,000 to a new account open 24 hours after you add it.
        </p>
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Add account
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function WithdrawDialog({
  data,
  onRequested,
}: {
  readonly data: PayoutsData
  readonly onRequested: () => void
}) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const defaultAccount = data.accounts.find((a) => a.isDefault) ?? data.accounts[0]
  const [accountId, setAccountId] = useState(defaultAccount?.id ?? '')
  const [amount, setAmount] = useState(minorToInput(data.balance.available))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const available = BigInt(data.balance.available)
  const minimum = BigInt(data.balance.minimum)
  const canWithdraw = available >= minimum && data.accounts.length > 0

  async function submit() {
    setError(undefined)
    const minor = parsePriceToMinor(amount)
    if (minor === null || minor <= 0n) {
      setError('Enter an amount, like 2500.')
      return
    }
    if (minor > available) {
      setError(`You can withdraw up to ${formatAmount(available, data.currency)}.`)
      return
    }
    setBusy(true)
    const result = await requestPayoutAction(workspace.id, {
      beneficiaryAccountId: accountId,
      amountMinor: minor.toString(),
      currency: data.currency,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    toast.show({
      title: 'Withdrawal requested',
      description:
        data.memberCount > 1
          ? 'Another owner or admin needs to approve it.'
          : 'Approve it below to send it for payment.',
      variant: 'success',
    })
    setOpen(false)
    onRequested()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setAmount(minorToInput(data.balance.available))
          setAccountId(defaultAccount?.id ?? '')
          setError(undefined)
        }
      }}
      title="Withdraw earnings"
      description={`Available now: ${formatAmount(available, data.currency)}. The minimum withdrawal is ${formatAmount(minimum, data.currency, { compact: true })}.`}
      trigger={
        <Button disabled={!canWithdraw}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          Withdraw
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
          label="Amount"
          inputMode="decimal"
          prefix={data.currency === 'INR' ? '₹' : '$'}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
          }}
        />
        <Select
          label="Send to"
          value={accountId}
          options={data.accounts.map((a) => ({ value: a.id, label: `${a.display} · ${a.holder}` }))}
          onValueChange={setAccountId}
        />
        {error && (
          <p role="alert" className="text-body text-critical">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Request withdrawal
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function PayoutsView({ data }: { readonly data: PayoutsData }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const refresh = () => {
    router.refresh()
  }
  const canApprove = data.role !== 'member'

  async function run(
    id: string,
    work: () => Promise<{ ok: boolean; error?: { message: string } }>,
    success: string,
  ) {
    setBusy(id)
    const result = await work()
    setBusy(null)
    if (!result.ok) {
      toast.show({
        title: 'That did not work',
        description: result.error?.message ?? 'Try again.',
        variant: 'critical',
      })
      return
    }
    toast.show({ title: success, variant: 'success' })
    refresh()
  }

  return (
    <div>
      <PageHeader
        title="Payouts"
        description="Your earnings after fees, GST, commissions, and refunds, and how to get them to your bank."
        actions={<WithdrawDialog data={data} onRequested={refresh} />}
      />

      {!data.emailVerified && (
        <div className="mb-6">
          <Notice tone="caution" title="Confirm your email to withdraw">
            We only send money for accounts whose email we have confirmed. Use the link in your
            inbox, or resend it from the banner at the top.
          </Notice>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Available to withdraw"
          value={formatAmount(data.balance.available, data.currency)}
        />
        <Stat label="Awaiting approval" value={formatAmount(data.balance.pending, data.currency)} />
        <Stat label="On the way" value={formatAmount(data.balance.inTransit, data.currency)} />
        <Stat label="Paid out" value={formatAmount(data.balance.settled, data.currency)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          {data.payouts.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="No withdrawals yet"
              description="Add a payout account, then withdraw once you have at least ₹500 available. Money usually reaches your bank within two working days of approval."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Requested</Th>
                  <Th>To</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => {
                  const status = STATUS[p.status] ?? { label: p.status, tone: 'neutral' as Tone }
                  const selfRequested = p.requestedBy === data.currentUserId
                  const mayApprove = canApprove && (data.memberCount === 1 || !selfRequested)
                  return (
                    <tr key={p.id}>
                      <Td className="text-content-secondary">{formatDateTime(p.requestedAt)}</Td>
                      <Td>{p.account}</Td>
                      <Td>
                        <Badge tone={status.tone} dot>
                          {status.label}
                        </Badge>
                        {p.status === 'paid' && p.reference && (
                          <span className="mt-1 block font-mono text-[11px] text-content-tertiary">
                            UTR {p.reference}
                          </span>
                        )}
                        {p.status === 'failed' && p.failureReason && (
                          <span className="mt-1 block text-caption text-content-tertiary">
                            {p.failureReason}
                          </span>
                        )}
                        {p.status === 'requested' && !mayApprove && selfRequested && (
                          <span className="mt-1 block text-caption text-content-tertiary">
                            Another admin approves
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="font-medium tabular-nums">
                        {formatAmount(p.amount, data.currency)}
                      </Td>
                      <Td align="right">
                        {p.status === 'requested' && mayApprove && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="small"
                              loading={busy === `a-${p.id}`}
                              onClick={() =>
                                void run(
                                  `a-${p.id}`,
                                  () => approvePayoutAction(workspace.id, { payoutId: p.id }),
                                  'Withdrawal approved',
                                )
                              }
                            >
                              <Check className="size-3.5" aria-hidden="true" />
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              loading={busy === `r-${p.id}`}
                              aria-label="Cancel this withdrawal"
                              onClick={() =>
                                void run(
                                  `r-${p.id}`,
                                  () =>
                                    rejectPayoutAction(workspace.id, {
                                      payoutId: p.id,
                                      reason: 'Cancelled in dashboard',
                                    }),
                                  'Withdrawal cancelled',
                                )
                              }
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </div>

        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Payout accounts" action={<AddAccountDialog onAdded={refresh} />} />
            {data.accounts.length === 0 ? (
              <p className="text-body text-content-secondary">
                Add a UPI ID or bank account to withdraw.
              </p>
            ) : (
              <ul className="-mx-2 divide-y divide-border-subtle">
                {data.accounts.map((a) => {
                  const fresh = now - Date.parse(a.createdAt) < DAY_MS
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-2 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-content-secondary">
                        {a.kind === 'vpa' ? (
                          <Smartphone className="size-4" aria-hidden="true" />
                        ) : (
                          <Landmark className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-body font-medium">
                          {a.display}
                          {a.isDefault && <Badge tone="accent">Default</Badge>}
                        </p>
                        <p className="truncate text-caption text-content-tertiary">
                          {a.holder}
                          {fresh
                            ? ' · new, large payouts open in 24h'
                            : ` · added ${formatDate(a.createdAt)}`}
                        </p>
                      </div>
                      {!a.isDefault && (
                        <Button
                          variant="ghost"
                          size="small"
                          loading={busy === `d-${a.id}`}
                          onClick={() =>
                            void run(
                              `d-${a.id}`,
                              () => setDefaultBeneficiaryAccountAction(workspace.id, a.id),
                              'Default account changed',
                            )
                          }
                        >
                          Make default
                        </Button>
                      )}
                      <button
                        type="button"
                        aria-label={`Remove ${a.display}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${a.display}? Withdrawals already requested to it are not affected.`,
                            )
                          ) {
                            void run(
                              `x-${a.id}`,
                              () => deleteBeneficiaryAccountAction(workspace.id, a.id),
                              'Account removed',
                            )
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-content-tertiary hover:bg-critical-subtle hover:text-critical"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="How payouts work" />
            <ol className="space-y-3 text-body text-content-secondary">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent">
                  1
                </span>
                You request a withdrawal from your available balance.
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent">
                  2
                </span>
                {data.memberCount > 1
                  ? 'A second owner or admin approves it. Nobody can approve their own request.'
                  : 'You approve it. With a team, a second person approves instead.'}
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-caption font-semibold text-accent">
                  3
                </span>
                We send it by IMPS or UPI, usually within two working days, and show the bank
                reference here.
              </li>
            </ol>
            <p className="mt-4 flex items-start gap-2 text-caption text-content-tertiary">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden="true" />
              Every payout is recorded in a double-entry ledger, so your balance always reconciles
              to the rupee.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
