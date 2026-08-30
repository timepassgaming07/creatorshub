/**
 * Creator Orders Directory & Management View (Slice 7 §7.3, §7.6).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white canvas (`#fafbfc`), soft ambient glow, indigo & emerald metric cards.
 * 2. Instant search by order ID / customer email / customer name, and status filter pills.
 * 3. Formatted minor units currency and clean status pill badges.
 * 4. 1-click CSV data export.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'

import type {
  OrderListItemDTO,
  OrderSummaryDTO,
} from '../../lib/order-actions'
import {
  exportOrdersCsvAction,
  listOrdersAction,
} from '../../lib/order-actions'

export type OrderListViewProps = {
  readonly workspaceId: string
  readonly initialOrders: readonly OrderListItemDTO[]
  readonly initialTotalCount: number
  readonly initialSummary: OrderSummaryDTO
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

function getStatusBadge(status: string) {
  switch (status) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Paid
        </span>
      )
    case 'refunded':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Refunded
        </span>
      )
    case 'partially_refunded':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          Partial Refund
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          Pending
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Failed
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
          {status}
        </span>
      )
  }
}

export function OrderListView({
  workspaceId,
  initialOrders,
  initialTotalCount,
  initialSummary,
}: OrderListViewProps) {
  const [ordersList, setOrdersList] = useState<readonly OrderListItemDTO[]>(initialOrders)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [summary, setSummary] = useState(initialSummary)
  const [query, setQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [isPending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)

  const handleSearch = (newQuery: string, newStatus = selectedStatus) => {
    setQuery(newQuery)
    startTransition(async () => {
      const res = await listOrdersAction(workspaceId, {
        query: newQuery.trim() || undefined,
        status: newStatus !== 'all' ? (newStatus as any) : undefined,
      })
      if (res.ok) {
        setOrdersList(res.data.orders)
        setTotalCount(res.data.totalCount)
        setSummary(res.data.summary)
      }
    })
  }

  const handleStatusFilter = (status: string) => {
    setSelectedStatus(status)
    handleSearch(query, status)
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const res = await exportOrdersCsvAction(workspaceId, {
        status: selectedStatus !== 'all' ? (selectedStatus as any) : undefined,
      })
      if (res.ok && res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `orders-export-${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track, search, and manage your digital storefront sales and customer fulfillments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 cursor-pointer"
          >
            {exporting ? 'Exporting...' : '📥 Export CSV'}
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Gross Revenue
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {formatMinor(summary.totalGrossRevenue)}
          </div>
          <div className="text-xs text-emerald-600 font-medium mt-1">From settled orders</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Orders
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {summary.totalOrders}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Lifetime customer transactions</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Paid & Fulfilled
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-2">
            {summary.paidOrdersCount}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Active delivered sales</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Refunded
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-2">
            {summary.refundedOrdersCount}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Returned or compensated</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder="Search by order ID, customer name, email..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            <svg
              className="absolute left-3.5 top-3 w-4 h-4 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {['all', 'paid', 'refunded', 'pending', 'failed'].map((status) => (
              <button
                key={status}
                onClick={() => handleStatusFilter(status)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all cursor-pointer ${
                  selectedStatus === status
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-6">Order</th>
                <th className="py-3.5 px-6">Customer</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6">Total</th>
                <th className="py-3.5 px-6">Date</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {ordersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">📦</div>
                    <div className="font-semibold text-slate-700">No orders found</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {query ? 'Try adjusting your search criteria' : 'Share your storefront link to get sales!'}
                    </p>
                  </td>
                </tr>
              ) : (
                ordersList.map((order) => {
                  const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    >
                      <td className="py-4 px-6 font-mono text-xs font-semibold text-indigo-600">
                        <Link
                          href={`/workspaces/${workspaceId}/orders/${order.id}`}
                          className="hover:underline"
                        >
                          #{order.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-medium text-slate-900">
                          {order.customerName || order.customerEmail.split('@')[0]}
                        </div>
                        <div className="text-xs text-slate-400">{order.customerEmail}</div>
                      </td>
                      <td className="py-4 px-6">{getStatusBadge(order.status)}</td>
                      <td className="py-4 px-6 font-semibold text-slate-900">
                        {formatMinor(order.totalAmount, order.currency)}
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500">{dateStr}</td>
                      <td className="py-4 px-6 text-right">
                        <Link
                          href={`/workspaces/${workspaceId}/orders/${order.id}`}
                          className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 group-hover:translate-x-0.5 transition-transform"
                        >
                          Manage &rarr;
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {ordersList.length} of {totalCount} orders
          </span>
        </div>
      </div>
    </div>
  )
}
