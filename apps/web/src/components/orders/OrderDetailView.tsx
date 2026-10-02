/**
 * Creator Order Inspection & Management View (Slice 7 §7.3, §7.4).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white canvas, soft elevations, crisp badges, itemized line-item receipts.
 * 2. Real-time fulfillment tokens inspection, download usage tracker, and resend receipt action.
 * 3. Chronological state transitions timeline and double-entry ledger event traces.
 * 4. Safe refund workflow with partial/full options and entitlement revocation warning.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'

import { orderId as toOrderId, workspaceId as toWorkspaceId } from '@creatorhub/contracts'
import type { OrderDetailsDTO } from '../../lib/order-actions'
import { resendFulfillmentEmailAction } from '../../lib/order-actions'
import { refundOrderAction } from '../../lib/refund-actions'

export type OrderDetailViewProps = {
  readonly workspaceId: string
  readonly data: OrderDetailsDTO
}

function formatMinor(amountStr: string, currency = 'INR'): string {
  const minor = Number(amountStr)
  if (isNaN(minor)) return '₹0.00'
  const major = minor / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(major)
}

export function OrderDetailView({ workspaceId, data }: OrderDetailViewProps) {
  const { order, items, customer, payments, refunds, transitions, entitlements } = data
  const [resending, startResendTransition] = useTransition()
  const [resendStatus, setResendStatus] = useState<string | null>(null)

  const [refundModalOpen, setRefundModalOpen] = useState(false)
  const [refundAmountMajor, setRefundAmountMajor] = useState(
    (Number(order.totalAmount) / 100).toFixed(2),
  )
  const [refundReason, setRefundReason] = useState('Customer requested refund')
  const [refunding, startRefundTransition] = useTransition()
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null)

  const handleResendReceipt = () => {
    startResendTransition(async () => {
      const res = await resendFulfillmentEmailAction(workspaceId, order.id)
      setResendStatus(res.message)
    })
  }

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRefundError(null)
    const amountMinor = BigInt(Math.round(parseFloat(refundAmountMajor) * 100))

    startRefundTransition(async () => {
      const res = await refundOrderAction({
        workspaceId: toWorkspaceId(workspaceId),
        orderId: toOrderId(order.id),
        amount: amountMinor.toString(),
        reason: refundReason,
      })

      if (res.success) {
        setRefundSuccess('Refund successfully processed!')
        setRefundModalOpen(false)
        window.location.reload()
      } else {
        setRefundError(res.error.detail || res.error.title)
      }
    })
  }

  const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Back Button & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={`/workspaces/${workspaceId}/orders`}
            className="inline-flex items-center text-xs font-semibold text-content-secondary hover:text-content-primary transition-colors mb-2"
          >
            &larr; Back to Orders
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-content-primary">
              Order #{order.id.slice(0, 8)}
            </h1>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold capitalize ${
                order.status === 'paid'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : order.status === 'refunded'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-surface-sunken text-content-secondary border border-border-subtle'
              }`}
            >
              {order.status}
            </span>
          </div>
          <p className="text-xs text-content-tertiary mt-1">{dateStr}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResendReceipt}
            disabled={resending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-raised border border-border-subtle text-xs font-semibold text-content-secondary shadow-xs hover:bg-surface-sunken hover:text-content-primary transition-all disabled:opacity-50 cursor-pointer"
          >
            {resending ? 'Sending...' : '✉️ Resend Receipt Email'}
          </button>

          {order.status === 'paid' && (
            <button
              onClick={() => setRefundModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-600 dark:text-rose-400 shadow-xs hover:bg-rose-500/20 transition-all cursor-pointer"
            >
              Issue Refund
            </button>
          )}
        </div>
      </div>

      {resendStatus && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 animate-fadeIn">
          {resendStatus}
        </div>
      )}

      {refundSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-fadeIn">
          {refundSuccess}
        </div>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Left 2 Cols: Items, Digital Fulfillment, Timeline */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Itemized Order Products Card */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-6">
            <h2 className="text-base font-bold text-content-primary">Purchased Items</h2>

            <div className="divide-y divide-border-subtle">
              {items.map((item) => (
                <div key={item.id} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-content-primary">{item.productTitle}</div>
                    <div className="text-xs text-content-secondary">
                      Qty: {item.quantity} &times; {formatMinor(item.unitAmount, order.currency)}
                    </div>
                  </div>
                  <div className="font-bold text-content-primary">
                    {formatMinor(item.totalAmount, order.currency)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Breakdown */}
            <div className="border-t border-border-subtle pt-4 space-y-2 text-xs">
              <div className="flex justify-between text-content-secondary">
                <span>Subtotal</span>
                <span>{formatMinor(order.subtotalAmount, order.currency)}</span>
              </div>
              {order.discountAmount !== '0' && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                  <span>Discount Applied</span>
                  <span>-{formatMinor(order.discountAmount, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-content-secondary">
                <span>Tax (Included)</span>
                <span>{formatMinor(order.taxAmount, order.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-content-primary pt-2 border-t border-border-subtle">
                <span>Total Paid</span>
                <span>{formatMinor(order.totalAmount, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Digital Fulfilment & Entitlements Card */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-content-primary">Digital Asset Delivery</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Active Access
              </span>
            </div>

            {entitlements.length === 0 ? (
              <p className="text-xs text-content-tertiary">No digital entitlements issued for this order.</p>
            ) : (
              <div className="space-y-4">
                {entitlements.map((ent) => (
                  <div
                    key={ent.id}
                    className="p-4 rounded-xl border border-border-subtle bg-surface-sunken space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-content-primary">
                        Entitlement #{ent.id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md capitalize ${
                          ent.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ent.status}
                      </span>
                    </div>

                    {ent.downloadGrants.map((grant) => (
                      <div
                        key={grant.id}
                        className="bg-surface-raised p-3 rounded-lg border border-border-subtle flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-medium text-content-primary">
                            Download Grant #{grant.id.slice(0, 8)}
                          </div>
                          <div className="text-[11px] text-content-secondary mt-0.5">
                            {grant.remainingDownloads} of {grant.maxDownloads} downloads remaining &bull;{' '}
                            Expires {new Date(grant.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div>
                          {grant.isExpired ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold text-[11px]">Expired</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">Active</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chronological Audit & Transition Timeline */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-4">
            <h2 className="text-base font-bold text-content-primary">Order Timeline</h2>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border-subtle">
              {transitions.map((t, idx) => (
                <div key={idx} className="relative">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-surface-raised bg-indigo-600 shadow-xs" />
                  <div className="text-xs font-semibold text-content-primary">
                    Status changed: <span className="text-indigo-600 dark:text-indigo-400">{t.fromStatus}</span> &rarr;{' '}
                    <span className="text-emerald-600 dark:text-emerald-400">{t.toStatus}</span>
                  </div>
                  <div className="text-[11px] text-content-secondary mt-0.5">
                    Actor: {t.actorType} &bull;{' '}
                    {new Date(t.createdAt).toLocaleString('en-IN')}
                    {t.reason && ` &bull; ${t.reason}`}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Col: Customer & Payment Method Info */}
        <div className="space-y-6">
          
          {/* Customer Profile Card */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-4">
            <h2 className="text-base font-bold text-content-primary">Customer</h2>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
                {(order.customerName || order.customerEmail).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-content-primary truncate">
                  {order.customerName || 'Anonymous Buyer'}
                </div>
                <div className="text-xs text-content-secondary truncate">{order.customerEmail}</div>
              </div>
            </div>

            {customer && (
              <div className="border-t border-border-subtle pt-4 space-y-2 text-xs">
                <div className="flex justify-between text-content-secondary">
                  <span>Lifetime Spend</span>
                  <span className="font-semibold text-content-primary">
                    {formatMinor(customer.totalSpend)}
                  </span>
                </div>
                <div className="flex justify-between text-content-secondary">
                  <span>Total Orders</span>
                  <span className="font-semibold text-content-primary">{customer.ordersCount}</span>
                </div>
                <div className="pt-2">
                  <Link
                    href={`/workspaces/${workspaceId}/customers/${customer.id}`}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    View Customer Profile &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Payment & Settlement Summary */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-4">
            <h2 className="text-base font-bold text-content-primary">Payment Details</h2>

            {payments.map((p) => (
              <div key={p.id} className="space-y-2 text-xs text-content-secondary">
                <div className="flex justify-between">
                  <span className="text-content-tertiary">Provider</span>
                  <span className="font-semibold uppercase text-content-primary">{p.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-tertiary">Payment ID</span>
                  <span className="font-mono text-content-primary">{p.providerPaymentId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-content-tertiary">Status</span>
                  <span className="font-semibold capitalize text-emerald-600 dark:text-emerald-400">{p.status}</span>
                </div>
                {p.capturedAt && (
                  <div className="flex justify-between">
                    <span className="text-content-tertiary">Captured At</span>
                    <span>{new Date(p.capturedAt).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            ))}

            {refunds.length > 0 && (
              <div className="border-t border-border-subtle pt-3 space-y-2">
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Refunds Recorded</span>
                {refunds.map((r) => (
                  <div key={r.id} className="p-2.5 rounded-lg bg-amber-500/10 text-xs flex justify-between">
                    <span className="text-amber-700 dark:text-amber-300">{r.reason || 'Refund'}</span>
                    <span className="font-bold text-amber-700 dark:text-amber-300">
                      -{formatMinor(r.amount, order.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Refund Modal */}
      {refundModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-surface-raised rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-border-subtle space-y-6">
            <div>
              <h3 className="text-lg font-bold text-content-primary">Issue Refund</h3>
              <p className="text-xs text-content-secondary mt-1">
                Refunding this order will revoke digital download access and post a balanced refund ledger transaction.
              </p>
            </div>

            {refundError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400">
                {refundError}
              </div>
            )}

            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Refund Amount ({order.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={(Number(order.totalAmount) / 100).toFixed(2)}
                  value={refundAmountMajor}
                  onChange={(e) => setRefundAmountMajor(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-control bg-surface-sunken text-sm text-content-primary focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-primary mb-1">
                  Reason for Refund
                </label>
                <input
                  type="text"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border-control bg-surface-sunken text-sm text-content-primary focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setRefundModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-content-secondary hover:text-content-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refunding}
                  className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                >
                  {refunding ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
