/**
 * Creator Customer Detailed Profile & Order History View (Slice 7 §7.5).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white cards, soft elevations, indigo & emerald accents.
 * 2. Lifetime spend metrics, average spend per order, and chronological order history.
 * 3. Active proof-of-purchase digital entitlements inspection.
 */
'use client'

import React from 'react'
import Link from 'next/link'

import type { CustomerDetailsDTO } from '../../lib/customer-actions'

export type CustomerDetailViewProps = {
  readonly workspaceId: string
  readonly data: CustomerDetailsDTO
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

export function CustomerDetailView({ workspaceId, data }: CustomerDetailViewProps) {
  const { customer, orders, entitlements } = data

  const firstDate = new Date(customer.firstSeenAt).toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const lastDate = new Date(customer.lastSeenAt).toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Navigation */}
      <div>
        <Link
          href={`/workspaces/${workspaceId}/customers`}
          className="inline-flex items-center text-xs font-semibold text-content-secondary hover:text-content-primary transition-colors mb-2"
        >
          &larr; Back to Customers
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              {(customer.name || customer.email).charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-content-primary">
                {customer.name || customer.email.split('@')[0]}
              </h1>
              <p className="text-xs text-content-secondary mt-0.5">{customer.email}</p>
            </div>
          </div>

          <div className="bg-surface-raised px-5 py-3 rounded-2xl border border-border-subtle shadow-xs flex items-center gap-4">
            <div>
              <div className="text-[11px] font-semibold text-content-tertiary uppercase">Lifetime Value</div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatMinor(customer.totalSpend)}</div>
            </div>
            <div className="w-px h-8 bg-border-subtle" />
            <div>
              <div className="text-[11px] font-semibold text-content-tertiary uppercase">Orders Count</div>
              <div className="text-xl font-bold text-content-primary">{customer.ordersCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        
        {/* Left 2 Cols: Orders History & Digital Entitlements */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Orders History Card */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-6">
            <h2 className="text-base font-bold text-content-primary">Order History</h2>

            {orders.length === 0 ? (
              <p className="text-xs text-content-tertiary">No orders recorded for this customer.</p>
            ) : (
              <div className="divide-y divide-border-subtle">
                {orders.map((ord) => {
                  const dateFormatted = new Date(ord.createdAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })

                  return (
                    <div
                      key={ord.id}
                      className="py-4 flex items-center justify-between gap-4 hover:bg-surface-sunken/50 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/workspaces/${workspaceId}/orders/${ord.id}`}
                            className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            #{ord.id.slice(0, 8)}
                          </Link>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              ord.status === 'paid'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-surface-sunken text-content-secondary'
                            }`}
                          >
                            {ord.status}
                          </span>
                        </div>
                        <div className="text-xs text-content-secondary mt-1">{dateFormatted}</div>
                      </div>

                      <div className="text-right">
                        <div className="font-bold text-content-primary">
                          {formatMinor(ord.totalAmount, ord.currency)}
                        </div>
                        <Link
                          href={`/workspaces/${workspaceId}/orders/${ord.id}`}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5 block"
                        >
                          View Details &rarr;
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Active Digital Entitlements */}
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-4">
            <h2 className="text-base font-bold text-content-primary">Active Digital Entitlements</h2>

            {entitlements.length === 0 ? (
              <p className="text-xs text-content-tertiary">No active digital entitlements.</p>
            ) : (
              <div className="space-y-3">
                {entitlements.map((ent) => (
                  <div
                    key={ent.id}
                    className="p-3.5 bg-surface-sunken rounded-xl border border-border-subtle flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-content-primary">
                        Product ID: {ent.productId.slice(0, 8)}...
                      </div>
                      <div className="text-[11px] text-content-secondary mt-0.5">
                        Granted on {new Date(ent.grantedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize ${
                        ent.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {ent.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Col: Customer Profile Info */}
        <div className="space-y-6">
          
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-sm space-y-4 text-xs">
            <h2 className="text-base font-bold text-content-primary">Customer Details</h2>

            <div className="space-y-3 pt-2 text-content-secondary">
              <div>
                <div className="text-content-tertiary">Email Address</div>
                <div className="font-semibold text-content-primary">{customer.email}</div>
              </div>

              {customer.name && (
                <div>
                  <div className="text-content-tertiary">Full Name</div>
                  <div className="font-semibold text-content-primary">{customer.name}</div>
                </div>
              )}

              {customer.phone && (
                <div>
                  <div className="text-content-tertiary">Phone Number</div>
                  <div className="font-semibold text-content-primary">{customer.phone}</div>
                </div>
              )}

              <div className="border-t border-border-subtle pt-3">
                <div className="text-content-tertiary">Customer Since</div>
                <div className="font-semibold text-content-primary">{firstDate}</div>
              </div>

              <div>
                <div className="text-content-tertiary">Last Purchase Activity</div>
                <div className="font-semibold text-content-primary">{lastDate}</div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
