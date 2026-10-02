'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, Download, Mail, RotateCcw, Undo2, User } from 'lucide-react'
import { orderId as toOrderId, workspaceId as toWorkspaceId } from '@creatorhub/contracts'
import { Button, Dialog, Input, useToast } from '@creatorhub/ui'

import {
  Avatar,
  Badge,
  Card,
  cn,
  CardHeader,
  DetailList,
  OrderStatusBadge,
  PageHeader,
  Textarea,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { formatAmount, formatDateTime, minorToInput, parsePriceToMinor } from '@/lib/format'
import { resendFulfillmentEmailAction, type OrderDetailsDTO } from '@/lib/order-actions'
import { refundOrderAction } from '@/lib/refund-actions'

const TRANSITION_LABEL: Record<string, string> = {
  requires_payment: 'Checkout started',
  paid: 'Payment captured',
  refunded: 'Refunded in full',
  partially_refunded: 'Partly refunded',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

export function OrderDetail({ data }: { readonly data: OrderDetailsDTO }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace, basePath, role } = useWorkspace()
  const { order } = data
  const currency = order.currency

  const refunded = data.refunds
    .filter((r) => r.status === 'succeeded')
    .reduce((sum, r) => sum + BigInt(r.amount), 0n)
  const refundable = BigInt(order.totalAmount) - refunded
  const canRefund =
    (order.status === 'paid' || order.status === 'partially_refunded') &&
    refundable > 0n &&
    role !== 'member'

  // Refund records carry the amount, so they stand in for the matching status changes.
  const timeline = [
    ...data.transitions
      .filter((t) => t.toStatus !== 'refunded' && t.toStatus !== 'partially_refunded')
      .map((t, i) => ({
        key: `t-${String(i)}`,
        at: t.createdAt,
        title: TRANSITION_LABEL[t.toStatus] ?? t.toStatus,
        detail: t.reason,
        refund: false,
      })),
    ...data.refunds.map((r) => ({
      key: r.id,
      at: r.createdAt,
      title:
        r.status === 'failed'
          ? `Refund of ${formatAmount(r.amount, currency)} failed`
          : `Refunded ${formatAmount(r.amount, currency)}`,
      detail: r.reason,
      refund: true,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const [refundOpen, setRefundOpen] = useState(false)
  const [refundAmount, setRefundAmount] = useState(minorToInput(refundable))
  const [refundReason, setRefundReason] = useState('')
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState<string | undefined>(undefined)
  const [resending, setResending] = useState(false)

  const payment = data.payments.find((p) => p.status === 'captured') ?? data.payments[0]
  const downloadsUsed = data.entitlements
    .flatMap((e) => e.downloadGrants)
    .reduce((sum, g) => sum + g.downloadCount, 0)

  async function refund() {
    const minor = parsePriceToMinor(refundAmount)
    if (minor === null || minor <= 0n || minor > refundable) {
      setRefundError(`Enter an amount up to ${formatAmount(refundable, currency)}.`)
      return
    }
    setRefunding(true)
    setRefundError(undefined)
    const result = await refundOrderAction({
      workspaceId: toWorkspaceId(workspace.id),
      orderId: toOrderId(order.id),
      amount: minor.toString(),
      ...(refundReason.trim() ? { reason: refundReason.trim() } : {}),
    })
    setRefunding(false)
    if (!result.success) {
      setRefundError(result.error.detail)
      return
    }
    setRefundOpen(false)
    toast.show({
      title: result.data.isFullRefund ? 'Refunded in full' : 'Partial refund sent',
      description: 'The money is on its way back to the buyer. Banks take 5 to 7 working days.',
      variant: 'success',
    })
    router.refresh()
  }

  async function resend() {
    setResending(true)
    const result = await resendFulfillmentEmailAction(workspace.id, order.id)
    setResending(false)
    toast.show({
      title: result.ok ? 'Links sent' : 'Not sent',
      description: result.message,
      variant: result.ok ? 'success' : 'critical',
    })
    if (result.ok) router.refresh()
  }

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: 'Orders', href: `${basePath}/orders` },
          { label: `#${order.id.slice(-8).toUpperCase()}` },
        ]}
        title={`Order #${order.id.slice(-8).toUpperCase()}`}
        eyebrow={<OrderStatusBadge status={order.status} />}
        description={formatDateTime(order.createdAt)}
        actions={
          <>
            {(order.status === 'paid' || order.status === 'partially_refunded') && (
              <Button variant="secondary" loading={resending} onClick={() => void resend()}>
                <Mail className="size-4" aria-hidden="true" />
                Resend download links
              </Button>
            )}
            {canRefund && (
              <Dialog
                open={refundOpen}
                onOpenChange={(open) => {
                  setRefundOpen(open)
                  if (open) {
                    setRefundAmount(minorToInput(refundable))
                    setRefundError(undefined)
                  }
                }}
                title="Refund this order"
                description="The buyer gets the money back on their original payment method. A full refund also ends their access to the files."
                trigger={
                  <Button variant="secondary">
                    <Undo2 className="size-4" aria-hidden="true" />
                    Refund
                  </Button>
                }
              >
                <div className="space-y-4">
                  <Input
                    label="Amount"
                    inputMode="decimal"
                    prefix={currency === 'INR' ? '₹' : '$'}
                    value={refundAmount}
                    onChange={(e) => {
                      setRefundAmount(e.target.value)
                    }}
                    hint={`Up to ${formatAmount(refundable, currency)}`}
                    {...(refundError ? { error: refundError } : {})}
                  />
                  <Textarea
                    label="Reason (for your records)"
                    rows={3}
                    value={refundReason}
                    onChange={(e) => {
                      setRefundReason(e.target.value)
                    }}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRefundOpen(false)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      loading={refunding}
                      loadingLabel="Refunding"
                      onClick={() => void refund()}
                    >
                      Refund{' '}
                      {parsePriceToMinor(refundAmount) !== null
                        ? formatAmount(parsePriceToMinor(refundAmount) ?? 0n, currency)
                        : ''}
                    </Button>
                  </div>
                </div>
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Items" />
            <ul className="divide-y divide-border-subtle">
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0"
                >
                  <Link
                    href={`${basePath}/products/${item.productId}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {item.productTitle}
                  </Link>
                  <span className="shrink-0 tabular-nums">
                    {formatAmount(item.totalAmount, currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-border-subtle pt-4">
              <DetailList
                items={[
                  { label: 'Subtotal', value: formatAmount(order.subtotalAmount, currency) },
                  ...(BigInt(order.discountAmount) > 0n
                    ? [
                        {
                          label: 'Discount',
                          value: `−${formatAmount(order.discountAmount, currency)}`,
                        },
                      ]
                    : []),
                  ...(BigInt(order.taxAmount) > 0n
                    ? [{ label: 'GST', value: formatAmount(order.taxAmount, currency) }]
                    : []),
                  {
                    label: 'Total',
                    value: (
                      <span className="text-heading">
                        {formatAmount(order.totalAmount, currency)}
                      </span>
                    ),
                  },
                  ...(refunded > 0n
                    ? [{ label: 'Refunded', value: `−${formatAmount(refunded, currency)}` }]
                    : []),
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Delivery"
              description={`${String(downloadsUsed)} download${downloadsUsed === 1 ? '' : 's'} so far`}
            />
            {data.entitlements.length === 0 ? (
              <p className="text-body text-content-secondary">
                No downloads issued for this order.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.entitlements.map((ent) => (
                  <li key={ent.id} className="rounded-lg border border-border-subtle p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-body font-medium">
                        <Download className="size-4 text-content-tertiary" aria-hidden="true" />
                        {data.items.find((i) => i.productId === ent.productId)?.productTitle ??
                          'Product'}
                      </span>
                      <Badge tone={ent.status === 'active' ? 'positive' : 'critical'}>
                        {ent.status === 'active' ? 'Access active' : 'Access revoked'}
                      </Badge>
                    </div>
                    {ent.downloadGrants.length > 0 && (
                      <p className="mt-2 text-caption text-content-tertiary">
                        {ent.downloadGrants.length} link{ent.downloadGrants.length === 1 ? '' : 's'}{' '}
                        issued · latest has {ent.downloadGrants[0]?.remainingDownloads ?? 0} of{' '}
                        {ent.downloadGrants[0]?.maxDownloads ?? 0} downloads left
                        {ent.downloadGrants[0]?.isExpired ? ' (expired)' : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <ol className="relative space-y-5 border-l border-border-subtle pl-5">
              {timeline.map((event) => (
                <li key={event.key} className="relative">
                  <span
                    className={cn(
                      'absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface-raised',
                      event.refund ? 'bg-info' : 'bg-accent',
                    )}
                    aria-hidden="true"
                  />
                  <p className="flex items-center gap-1.5 text-body font-medium">
                    {event.refund && <RotateCcw className="size-3.5" aria-hidden="true" />}
                    {event.title}
                  </p>
                  <p className="text-caption text-content-tertiary">
                    {formatDateTime(event.at)}
                    {event.detail ? ` · ${event.detail}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <div className="flex items-center gap-3">
              <Avatar
                label={order.customerName ?? order.customerEmail}
                className="size-10 text-sm"
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{order.customerName ?? 'No name given'}</p>
                <a
                  href={`mailto:${order.customerEmail}`}
                  className="truncate text-caption text-content-secondary hover:underline"
                >
                  {order.customerEmail}
                </a>
              </div>
            </div>
            {data.customer && (
              <div className="mt-4 border-t border-border-subtle pt-4">
                <DetailList
                  items={[
                    { label: 'Orders', value: data.customer.ordersCount },
                    {
                      label: 'Lifetime spend',
                      value: formatAmount(data.customer.totalSpend, currency),
                    },
                    ...(data.customer.phone
                      ? [{ label: 'Phone', value: data.customer.phone }]
                      : []),
                  ]}
                />
                <Link
                  href={`${basePath}/customers/${data.customer.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-body font-medium text-accent hover:underline"
                >
                  <User className="size-4" aria-hidden="true" />
                  View customer
                </Link>
              </div>
            )}
          </Card>

          {payment && (
            <Card>
              <CardHeader title="Payment" />
              {payment.method === 'free' ? (
                <p className="text-body text-content-secondary">
                  Free product. No payment was taken.
                </p>
              ) : (
                <DetailList
                  items={[
                    {
                      label: 'Method',
                      value: (
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <CreditCard
                            className="size-3.5 text-content-tertiary"
                            aria-hidden="true"
                          />
                          {payment.method ?? payment.provider}
                        </span>
                      ),
                    },
                    {
                      label: 'Provider',
                      value: (
                        <span className="capitalize">
                          {payment.provider === 'memory' ? 'Test mode' : payment.provider}
                        </span>
                      ),
                    },
                    {
                      label: 'Status',
                      value: <span className="capitalize">{payment.status}</span>,
                    },
                    {
                      label: 'Reference',
                      value: (
                        <span className="font-mono text-[12px] break-all">
                          {payment.providerPaymentId}
                        </span>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
