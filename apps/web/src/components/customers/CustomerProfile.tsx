'use client'

import Link from 'next/link'
import { Mail, Phone } from 'lucide-react'

import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  CopyButton,
  OrderStatusBadge,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import type { CustomerDetailsDTO } from '@/lib/customer-actions'
import { formatAmount, formatDate, formatDateTime } from '@/lib/format'

export function CustomerProfile({ data }: { readonly data: CustomerDetailsDTO }) {
  const { workspace, basePath } = useWorkspace()
  const { customer } = data
  const active = data.entitlements.filter((e) => e.status === 'active').length

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: 'Customers', href: `${basePath}/customers` },
          { label: customer.name ?? customer.email },
        ]}
        title={
          <span className="flex items-center gap-4">
            <Avatar label={customer.name ?? customer.email} className="size-12 text-base" />
            {customer.name ?? customer.email}
          </span>
        }
        actions={
          <>
            <CopyButton value={customer.email} label="Copy email" />
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Lifetime spend"
          value={formatAmount(customer.totalSpend, workspace.currency)}
        />
        <Stat label="Orders" value={customer.ordersCount} />
        <Stat label="Products owned" value={active} />
        <Stat label="Customer since" value={formatDate(customer.firstSeenAt)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <h2 className="mb-3 text-heading font-semibold">Orders</h2>
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
                <Th align="right">Date</Th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id} className="group hover:bg-surface-sunken/50">
                  <Td>
                    <Link
                      href={`${basePath}/orders/${order.id}`}
                      className="font-mono text-[13px] font-medium group-hover:underline"
                    >
                      #{order.id.slice(-8).toUpperCase()}
                    </Link>
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
        </div>
        <aside>
          <Card>
            <CardHeader title="Contact" />
            <ul className="space-y-3 text-body">
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 text-content-tertiary" aria-hidden="true" />
                <a href={`mailto:${customer.email}`} className="truncate hover:underline">
                  {customer.email}
                </a>
              </li>
              {customer.phone && (
                <li className="flex items-center gap-2.5">
                  <Phone className="size-4 text-content-tertiary" aria-hidden="true" />
                  <a href={`tel:${customer.phone}`} className="hover:underline">
                    {customer.phone}
                  </a>
                </li>
              )}
            </ul>
            <div className="mt-4 border-t border-border-subtle pt-4">
              <Badge tone={customer.ordersCount > 1 ? 'accent' : 'neutral'}>
                {customer.ordersCount > 1 ? 'Repeat buyer' : 'First-time buyer'}
              </Badge>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
