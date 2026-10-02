'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Search, Users } from 'lucide-react'
import { Button, useToast } from '@creatorhub/ui'

import { Avatar, EmptyState, PageHeader, Stat, Table, Td, Th } from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import {
  exportCustomersCsvAction,
  type CustomerListItemDTO,
  type CustomerSummaryDTO,
} from '@/lib/customer-actions'
import { downloadCsv } from '@/lib/download-csv'
import { formatAmount, formatDate, formatRelative } from '@/lib/format'

export function CustomersView({
  customers,
  totalCount,
  summary,
  page,
  pageSize,
  query,
}: {
  readonly customers: readonly CustomerListItemDTO[]
  readonly totalCount: number
  readonly summary: CustomerSummaryDTO
  readonly page: number
  readonly pageSize: number
  readonly query: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const { workspace, basePath } = useWorkspace()
  const [search, setSearch] = useState(query)
  const [pending, startTransition] = useTransition()
  const [exporting, setExporting] = useState(false)
  const pages = Math.max(1, Math.ceil(totalCount / pageSize))

  const go = (q: string, p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (p > 1) params.set('page', String(p))
    startTransition(() => {
      router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`)
    })
  }

  async function exportCsv() {
    setExporting(true)
    const result = await exportCustomersCsvAction(workspace.id)
    setExporting(false)
    if (!result.ok || !result.csv) {
      toast.show({
        title: 'Export failed',
        description: result.error ?? 'Try again.',
        variant: 'critical',
      })
      return
    }
    downloadCsv(`customers-${new Date().toISOString().slice(0, 10)}.csv`, result.csv)
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone who has bought or downloaded from you. Free downloads count: they are your email list."
        actions={
          <Button variant="secondary" loading={exporting} onClick={() => void exportCsv()}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Customers" value={summary.totalCustomers.toLocaleString('en-IN')} />
        <Stat label="Repeat buyers" value={summary.repeatCustomersCount.toLocaleString('en-IN')} />
        <Stat
          label="Lifetime value"
          value={formatAmount(summary.totalLifetimeValue, workspace.currency, { compact: true })}
        />
        <Stat
          label="Average order"
          value={formatAmount(summary.averageOrderValue, workspace.currency, { compact: true })}
        />
      </div>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          go(search.trim(), 1)
        }}
        className="relative mb-4 sm:w-80"
      >
        <label htmlFor="customer-search" className="sr-only">
          Search customers
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-tertiary"
          aria-hidden="true"
        />
        <input
          id="customer-search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
          }}
          placeholder="Name, email, or phone"
          className="h-9 w-full rounded-lg border border-border-control bg-surface-raised pr-3 pl-9 text-body placeholder:text-content-tertiary focus:outline-none focus-visible:border-border-strong"
        />
      </form>

      <div className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {customers.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={query ? 'No customers match' : 'No customers yet'}
            description={
              query ? 'Try another search.' : 'Your first buyer or free download appears here.'
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Spent</Th>
                <Th align="right">First seen</Th>
                <Th align="right">Last order</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="group transition-colors hover:bg-surface-sunken/50">
                  <Td>
                    <Link
                      href={`${basePath}/customers/${c.id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar label={c.name ?? c.email} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium group-hover:underline">
                          {c.name ?? c.email}
                        </span>
                        {c.name && (
                          <span className="block truncate text-caption text-content-tertiary">
                            {c.email}
                          </span>
                        )}
                      </span>
                    </Link>
                  </Td>
                  <Td align="right">{c.ordersCount}</Td>
                  <Td align="right">
                    {formatAmount(c.totalSpend, workspace.currency, { compact: true })}
                  </Td>
                  <Td align="right" className="text-content-tertiary">
                    {formatDate(c.firstSeenAt)}
                  </Td>
                  <Td align="right" className="text-content-tertiary">
                    <span suppressHydrationWarning>{formatRelative(c.lastSeenAt)}</span>
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
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              disabled={page <= 1}
              onClick={() => {
                go(query, page - 1)
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
                go(query, page + 1)
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
