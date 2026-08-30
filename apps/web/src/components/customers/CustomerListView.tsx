/**
 * Creator Customer Directory View (Slice 7 §7.5, §7.6).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, soft cards, crisp typography.
 * 2. Instant search by customer email / name and spend threshold filter.
 * 3. Aggregated lifetime customer value (LTV), average order value (AOV), and repeat buyer metrics.
 * 4. 1-click customer CSV export.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'

import type {
  CustomerListItemDTO,
  CustomerSummaryDTO,
} from '../../lib/customer-actions'
import {
  exportCustomersCsvAction,
  listCustomersAction,
} from '../../lib/customer-actions'

export type CustomerListViewProps = {
  readonly workspaceId: string
  readonly initialCustomers: readonly CustomerListItemDTO[]
  readonly initialTotalCount: number
  readonly initialSummary: CustomerSummaryDTO
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

export function CustomerListView({
  workspaceId,
  initialCustomers,
  initialTotalCount,
  initialSummary,
}: CustomerListViewProps) {
  const [customersList, setCustomersList] = useState<readonly CustomerListItemDTO[]>(initialCustomers)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [summary, setSummary] = useState(initialSummary)
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)

  const handleSearch = (newQuery: string) => {
    setQuery(newQuery)
    startTransition(async () => {
      const res = await listCustomersAction(workspaceId, {
        query: newQuery.trim() || undefined,
      })
      if (res.ok) {
        setCustomersList(res.data.customers)
        setTotalCount(res.data.totalCount)
        setSummary(res.data.summary)
      }
    })
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const res = await exportCustomersCsvAction(workspaceId)
      if (res.ok && res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `customers-export-${new Date().toISOString().slice(0, 10)}.csv`)
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Customers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Build relationships with your audience, track buyer lifetime value, and view purchase histories.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 cursor-pointer"
        >
          {exporting ? 'Exporting...' : '📥 Export CSV'}
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Customers
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {summary.totalCustomers}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Unique buyers</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Customer Lifetime Value
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 mt-2">
            {formatMinor(summary.totalLifetimeValue)}
          </div>
          <div className="text-xs text-emerald-600 font-medium mt-1">Total revenue generated</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Average Order Value
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600 mt-2">
            {formatMinor(summary.averageOrderValue)}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Per transaction avg</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Repeat Buyers
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-600 mt-2">
            {summary.repeatCustomersCount}
          </div>
          <div className="text-xs text-slate-400 font-medium mt-1">Customers with &gt;1 orders</div>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:max-w-md">
          <input
            type="text"
            placeholder="Search by customer name or email..."
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
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-6">Customer</th>
                <th className="py-3.5 px-6">Total Spend</th>
                <th className="py-3.5 px-6">Orders</th>
                <th className="py-3.5 px-6">First Purchase</th>
                <th className="py-3.5 px-6">Last Active</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {customersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">👥</div>
                    <div className="font-semibold text-slate-700">No customers found</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {query ? 'Try a different search query' : 'Your customer list will grow as sales arrive!'}
                    </p>
                  </td>
                </tr>
              ) : (
                customersList.map((cust) => {
                  const firstDate = new Date(cust.firstSeenAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                  const lastDate = new Date(cust.lastSeenAt).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })

                  return (
                    <tr
                      key={cust.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                            {(cust.name || cust.email).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">
                              {cust.name || cust.email.split('@')[0]}
                            </div>
                            <div className="text-xs text-slate-400">{cust.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900">
                        {formatMinor(cust.totalSpend)}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                          {cust.ordersCount} {cust.ordersCount === 1 ? 'order' : 'orders'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-500">{firstDate}</td>
                      <td className="py-4 px-6 text-xs text-slate-500">{lastDate}</td>
                      <td className="py-4 px-6 text-right">
                        <Link
                          href={`/workspaces/${workspaceId}/customers/${cust.id}`}
                          className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 group-hover:translate-x-0.5 transition-transform"
                        >
                          View History &rarr;
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {customersList.length} of {totalCount} customers
          </span>
        </div>
      </div>
    </div>
  )
}
