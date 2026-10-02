'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pause, Play, Plus, Shuffle, TicketPercent } from 'lucide-react'
import { Button, Dialog, Input, useToast } from '@creatorhub/ui'

import {
  Badge,
  CopyButton,
  EmptyState,
  PageHeader,
  Segmented,
  Table,
  Td,
  Th,
  type Tone,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import type { DiscountRow, DiscountsData } from '@/lib/dashboard-data'
import { createDiscountAction, setDiscountActiveAction } from '@/lib/discount-actions'
import { formatAmount, formatDate } from '@/lib/format'

function describeValue(d: DiscountRow, fallbackCurrency: string): string {
  if (d.type === 'percentage') {
    const pct = Number(BigInt(d.value)) / 100
    return `${pct.toLocaleString('en-IN', { maximumFractionDigits: 2 })}% off`
  }
  return `${formatAmount(d.value, d.currency ?? fallbackCurrency, { compact: true })} off`
}

function statusOf(d: DiscountRow, now: number): { label: string; tone: Tone } {
  if (!d.isActive) return { label: 'Paused', tone: 'neutral' }
  if (d.expiresAt && Date.parse(d.expiresAt) < now) return { label: 'Expired', tone: 'neutral' }
  if (d.maxUses !== null && d.usesCount >= d.maxUses) return { label: 'Used up', tone: 'caution' }
  if (d.startsAt && Date.parse(d.startsAt) > now) return { label: 'Scheduled', tone: 'info' }
  return { label: 'Active', tone: 'positive' }
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

function NewDiscountDialog({
  products,
  onCreated,
}: {
  readonly products: DiscountsData['products']
  readonly onCreated: () => void
}) {
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'fixed_amount'>('percentage')
  const [value, setValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [scope, setScope] = useState<'all' | 'some'>('all')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const symbol = workspace.currency === 'INR' ? '₹' : '$'

  function reset() {
    setCode('')
    setType('percentage')
    setValue('')
    setMaxUses('')
    setMinOrder('')
    setStartsAt('')
    setExpiresAt('')
    setScope('all')
    setSelected(new Set())
    setError(undefined)
  }

  async function submit() {
    setError(undefined)
    if (scope === 'some' && selected.size === 0) {
      setError('Pick at least one product, or let the code apply to everything.')
      return
    }
    const uses = maxUses.trim() ? Number(maxUses) : null
    if (uses !== null && (!Number.isInteger(uses) || uses < 1)) {
      setError('The use limit must be a whole number, 1 or more.')
      return
    }
    setBusy(true)
    const result = await createDiscountAction(workspace.id, {
      code,
      type,
      value,
      maxUses: uses,
      minOrder: minOrder.trim() || null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      productIds: scope === 'some' ? [...selected] : [],
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.show({
      title: `${result.data.code} is ready`,
      description: 'Share it anywhere. Buyers enter it at checkout.',
      variant: 'success',
    })
    setOpen(false)
    reset()
    onCreated()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
      title="New discount code"
      description="Buyers type the code at checkout. The discount comes off the price before GST."
      trigger={
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          New code
        </Button>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="flex items-end gap-2">
          <Input
            label="Code"
            className="min-w-0 flex-1"
            placeholder="DIWALI25"
            maxLength={50}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setCode(randomCode())
            }}
          >
            <Shuffle className="size-4" aria-hidden="true" />
            Generate
          </Button>
        </div>

        <div className="space-y-2">
          <Segmented<'percentage' | 'fixed_amount'>
            label="Discount type"
            value={type}
            onChange={setType}
            options={[
              { value: 'percentage', label: 'Percentage' },
              { value: 'fixed_amount', label: 'Fixed amount' },
            ]}
          />
          <Input
            label={type === 'percentage' ? 'Percent off' : 'Amount off'}
            inputMode="decimal"
            placeholder={type === 'percentage' ? '20' : '200'}
            value={value}
            {...(type === 'percentage' ? { suffix: '%' } : { prefix: symbol })}
            onChange={(e) => {
              setValue(e.target.value)
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Limit total uses"
            hint="Leave empty for unlimited"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => {
              setMaxUses(e.target.value.replace(/\D/g, ''))
            }}
          />
          <Input
            label="Minimum order"
            hint="Leave empty for none"
            inputMode="decimal"
            prefix={symbol}
            value={minOrder}
            onChange={(e) => {
              setMinOrder(e.target.value)
            }}
          />
          <Input
            label="Starts"
            type="datetime-local"
            hint="Leave empty to start now"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value)
            }}
          />
          <Input
            label="Ends"
            type="datetime-local"
            hint="Leave empty to never end"
            value={expiresAt}
            onChange={(e) => {
              setExpiresAt(e.target.value)
            }}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-body font-medium">Applies to</legend>
          <Segmented<'all' | 'some'>
            label="Applies to"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Every product' },
              { value: 'some', label: 'Chosen products' },
            ]}
          />
          {scope === 'some' && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-2">
              {products.length === 0 && (
                <li className="p-2 text-caption text-content-tertiary">
                  You have no products yet.
                </li>
              )}
              {products.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-body hover:bg-surface-sunken">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={selected.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        setSelected(next)
                      }}
                    />
                    <span className="truncate">{p.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

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
          <Button type="submit" loading={busy} loadingLabel="Creating" disabled={!code || !value}>
            Create code
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function DiscountsView({ data }: { readonly data: DiscountsData }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace } = useWorkspace()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  async function toggle(d: DiscountRow) {
    setBusyId(d.id)
    const result = await setDiscountActiveAction(workspace.id, d.id, !d.isActive)
    setBusyId(null)
    if (!result.ok) {
      toast.show({
        title: 'Could not update the code',
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
        title="Discounts"
        description="Codes for launches, festivals, and your newsletter. Each one tracks how often it is used."
        actions={
          <NewDiscountDialog
            products={data.products}
            onCreated={() => {
              router.refresh()
            }}
          />
        }
      />

      {data.discounts.length === 0 ? (
        <EmptyState
          icon={<TicketPercent />}
          title="No discount codes yet"
          description="Create a code like LAUNCH20 and share it with your audience. You choose the amount, the products, the dates, and how many times it can be used."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Discount</Th>
              <Th>Applies to</Th>
              <Th align="right">Used</Th>
              <Th>Ends</Th>
              <Th>Status</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {data.discounts.map((d) => {
              const status = statusOf(d, now)
              return (
                <tr key={d.id}>
                  <Td>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-[13px] font-semibold">{d.code}</span>
                      <CopyButton
                        value={d.code}
                        label={`Copy ${d.code}`}
                        iconOnly
                        className="size-7 border-transparent"
                      />
                    </span>
                  </Td>
                  <Td>
                    <span className="block">{describeValue(d, workspace.currency)}</span>
                    {d.minOrderAmount && (
                      <span className="text-caption text-content-tertiary">
                        on orders over{' '}
                        {formatAmount(d.minOrderAmount, workspace.currency, { compact: true })}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-56">
                    <span
                      className="block truncate text-content-secondary"
                      title={d.productTitles.join(', ')}
                    >
                      {d.productTitles.length === 0 ? 'Every product' : d.productTitles.join(', ')}
                    </span>
                  </Td>
                  <Td align="right" className="tabular-nums">
                    {d.usesCount.toLocaleString('en-IN')}
                    {d.maxUses !== null && (
                      <span className="text-content-tertiary">
                        {' '}
                        / {d.maxUses.toLocaleString('en-IN')}
                      </span>
                    )}
                  </Td>
                  <Td className="text-content-secondary">
                    {d.expiresAt ? formatDate(d.expiresAt) : 'No end date'}
                  </Td>
                  <Td>
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </Td>
                  <Td align="right">
                    <Button
                      variant="ghost"
                      size="small"
                      loading={busyId === d.id}
                      onClick={() => void toggle(d)}
                      aria-label={`${d.isActive ? 'Pause' : 'Resume'} ${d.code}`}
                    >
                      {d.isActive ? (
                        <Pause className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Play className="size-3.5" aria-hidden="true" />
                      )}
                      {d.isActive ? 'Pause' : 'Resume'}
                    </Button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </div>
  )
}
