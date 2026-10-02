'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Receipt, Search } from 'lucide-react'
import { Button, useToast } from '@creatorhub/ui'

import {
  EmptyState,
  OrderStatusBadge,
  PageHeader,
  Segmented,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { downloadCsv } from '@/lib/download-csv'
import { formatAmount, formatDateTime } from '@/lib/format'
import {
  exportOrdersCsvAction,
  type OrderListItemDTO,
  type OrderSummaryDTO,
} from '@/lib/order-actions'

type StatusFilter = 'all' | 'paid' | 'requires_payment' | 'refunded'

export function OrdersView({
  orders,
  totalCount,
  summary,
  page,
  pageSize,
  status,
  query,
}: {
  readonly orders: readonly OrderListItemDTO[]
  readonly totalCount: number
  readonly summary: OrderSummaryDTO
  readonly page: number
  readonly pageSize: number
  readonly status: string
  readonly query: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const { workspace, basePath } = useWorkspace()
  const [search, setSearch] = useState(query)
  const [pending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)

  const navigate = (next: { status?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams()
    const s = next.status ?? status
    const q = next.q ?? query
    if (s !== 'all') params.set('status', s)
    if (q) params.set('q', q)
    if ((next.page ?? 1) > 1) params.set('page', String(next.page))
    startTransition(() => {
      router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`)
    })
  }

  async function exportCsv() {
    setExporting(true)
    const result = await exportOrdersCsvAction(
      workspace.id,
      status !== 'all' ? { status: status as 'paid' } : {},
    )
    setExporting(false)
    if (!result.ok || !result.csv) {
      toast.show({
        title: 'Export failed',
        description: result.error ?? 'Try again.',
        variant: 'critical',
      })
      return
    }
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, result.csv)
  }

  const pages = Math.max(1, Math.ceil(totalCount / pageSize))
  const filtered = status !== 'all' || query.length > 0
  const current: StatusFilter =
    (['paid', 'requires_payment', 'refunded'] as const).find((s) => s === status) ?? 'all'

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every purchase and free download, with its payment and delivery."
        actions={
          <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="All orders" value={summary.totalOrders.toLocaleString('en-IN')} />
        <Stat label="Paid" value={summary.paidOrdersCount.toLocaleString('en-IN')} />
        <Stat label="Refunded" value={summary.refundedOrdersCount.toLocaleString('en-IN')} />
        <Stat
          label="Net revenue"
          value={formatAmount(
            BigInt(summary.totalGrossRevenue) - BigInt(summary.totalRefundedAmount),
            workspace.currency,
            { compact: true },
          )}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<StatusFilter>
          label="Filter by status"
          value={current}
          onChange={(value) => {
            navigate({ status: value, page: 1 })
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'paid', label: 'Paid' },
            { value: 'requires_payment', label: 'Awaiting payment' },
            { value: 'refunded', label: 'Refunded' },
          ]}
        />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate({ q: search.trim(), page: 1 })
          }}
          className="relative sm:w-72"
        >
          <label htmlFor="order-search" className="sr-only">
            Search orders
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-tertiary"
            aria-hidden="true"
          />
          <input
            id="order-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder="Email, name, or order ID"
            className="h-9 w-full rounded-lg border border-border-control bg-surface-raised pr-3 pl-9 text-body placeholder:text-content-tertiary focus:outline-none focus-visible:border-border-strong"
          />
        </form>
      </div>

      <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {orders.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={filtered ? 'No orders match' : 'No orders yet'}
            description={
              filtered
                ? 'Try a different filter or search.'
                : 'When someone buys or downloads from your store, it shows up here instantly.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th align="right">Date</Th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="group transition-colors hover:bg-surface-sunken/50">
                  <Td>
                    <Link
                      href={`${basePath}/orders/${order.id}`}
                      className="font-mono text-[13px] font-medium group-hover:underline"
                    >
                      #{order.id.slice(-8).toUpperCase()}
                    </Link>
                  </Td>
                  <Td>
                    <span className="block font-medium">{order.customerName ?? '—'}</span>
                    <span className="text-caption text-content-tertiary">
                      {order.customerEmail}
                    </span>
                  </Td>
                  <Td>
                    <OrderStatusBadge status={order.status} />
                  </Td>
                  <Td align="right">
                    {BigInt(order.totalAmount) === 0n
                      ? 'Free'
                      : formatAmount(order.totalAmount, order.currency)}
                  </Td>
                  <Td align="right" className="text-content-tertiary">
                    {formatDateTime(order.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {pages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-4 flex items-center justify-between text-body text-content-secondary"
        >
          <p>
            Page {page} of {pages} · {totalCount.toLocaleString('en-IN')} orders
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={page <= 1}
              onClick={() => {
                navigate({ page: page - 1 })
              }}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={page >= pages}
              onClick={() => {
                navigate({ page: page + 1 })
              }}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  )
}
