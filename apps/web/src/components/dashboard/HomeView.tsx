'use client'

/**
 * Dashboard home: what needs doing, how the last 30 days went, latest orders.
 */
import Link from 'next/link'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  IndianRupee,
  Package,
  Plus,
  Receipt,
  Sparkles,
  Users,
} from 'lucide-react'
import { Button } from '@creatorhub/ui'

import { AreaChart } from '@/components/charts/AreaChart'
import {
  Badge,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  OrderStatusBadge,
  Stat,
  cn,
} from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import type { HomeData } from '@/lib/dashboard-data'
import { formatAmount, formatAmountShort, formatRelative } from '@/lib/format'

function greeting(): string {
  // Same zone on the server and in the browser, so hydration agrees.
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  )
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function trendFor(current: bigint, previous: bigint) {
  if (previous === 0n) return current > 0n ? { direction: 'up' as const, label: 'New' } : undefined
  const pct = Number(((current - previous) * 1000n) / previous) / 10
  return {
    direction: pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('flat' as const),
    label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
  }
}

export function HomeView({
  data,
  firstName,
  welcome,
}: {
  readonly data: HomeData
  readonly firstName: string
  readonly welcome: boolean
}) {
  const { workspace, storefront, basePath } = useWorkspace()
  const { summary, checklist } = data
  const currency = summary.currency || workspace.currency
  const gross = BigInt(summary.grossRevenueMinor)

  const steps = [
    {
      done: checklist.hasProduct,
      label: 'Create your first product',
      href: `${basePath}/products/new`,
    },
    {
      done: checklist.hasDeliverable,
      label: 'Upload the file buyers receive',
      href: `${basePath}/products`,
    },
    {
      done: checklist.storeCustomized,
      label: 'Add your bio, links, and colours',
      href: `${basePath}/storefront`,
    },
    {
      done: checklist.hasPayoutAccount,
      label: 'Add a bank account or UPI for payouts',
      href: `${basePath}/payouts`,
    },
    { done: checklist.storePublished, label: 'Publish your store', href: `${basePath}/storefront` },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const setupComplete = doneCount === steps.length
  const storeLink = storefront ? storefront.url : null

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-body text-content-tertiary" suppressHydrationWarning>
            {greeting()}
          </p>
          <h1 className="mt-1 text-title-lg font-semibold tracking-tight">
            {welcome
              ? `Welcome to CreatorHub${firstName ? `, ${firstName}` : ''}`
              : firstName
                ? `Hi ${firstName}`
                : workspace.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {storeLink && <CopyButton value={storeLink} label="Copy store link" />}
          <Button asChild size="medium">
            <Link href={`${basePath}/products/new`}>
              <Plus className="size-4" aria-hidden="true" />
              New product
            </Link>
          </Button>
        </div>
      </div>

      {!setupComplete && (
        <Card className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/10 blur-3xl"
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-sm">
              <Badge tone="accent">
                <Sparkles className="size-3" aria-hidden="true" />
                Launch checklist
              </Badge>
              <h2 className="mt-3 text-title font-semibold tracking-tight">
                Get your store ready to sell
              </h2>
              <p className="mt-1.5 text-body text-content-secondary">
                {doneCount} of {steps.length} done. Most creators finish in under ten minutes.
              </p>
              <div className="mt-4 h-1.5 rounded-full bg-surface-sunken">
                <div
                  className="h-1.5 rounded-full bg-accent transition-all"
                  style={{ width: `${String((doneCount / steps.length) * 100)}%` }}
                />
              </div>
            </div>
            <ol className="grid flex-1 gap-1.5 lg:max-w-md">
              {steps.map((step, i) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-body transition-colors',
                      step.done ? 'text-content-tertiary' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold',
                        step.done
                          ? 'border-transparent bg-positive text-content-inverse'
                          : 'border-border-control text-content-secondary',
                      )}
                    >
                      {step.done ? (
                        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex-1',
                        step.done && 'line-through decoration-content-tertiary/50',
                      )}
                    >
                      {step.label}
                    </span>
                    {!step.done && (
                      <ArrowRight
                        className="size-4 text-content-tertiary transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      <section aria-label="Last 30 days" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue, 30 days"
          value={formatAmountShort(summary.grossRevenueMinor, currency)}
          icon={<IndianRupee />}
          trend={trendFor(gross, BigInt(data.previousGrossMinor))}
          hint="vs previous 30"
        />
        <Stat
          label="Orders, 30 days"
          value={summary.ordersCount.toLocaleString('en-IN')}
          icon={<Receipt />}
          hint={`Avg ${formatAmount(summary.averageOrderValueMinor, currency, { compact: true })}`}
        />
        <Stat
          label="Store visitors"
          value={summary.uniqueVisitorsCount.toLocaleString('en-IN')}
          icon={<Eye />}
          hint={`${summary.storefrontPageviewsCount.toLocaleString('en-IN')} page views`}
        />
        <Stat
          label="Conversion"
          value={`${(summary.conversionRateBps / 100).toFixed(1)}%`}
          icon={<Users />}
          hint="visitors who bought"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Revenue"
            description="Paid orders, last 30 days"
            action={
              <Link
                href={`${basePath}/analytics`}
                className="inline-flex items-center gap-1 text-body font-medium text-content-secondary hover:text-content-primary"
              >
                Analytics
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
          {summary.ordersCount === 0 ? (
            <EmptyState
              icon={<IndianRupee />}
              title="No sales yet"
              description="Your revenue chart starts with the first order. Share your store link to get it."
              className="py-10"
            />
          ) : (
            <AreaChart
              label="Revenue per day, last 30 days"
              data={summary.timeSeries.map((p) => ({
                date: p.date,
                value: Number(BigInt(p.grossRevenueMinor)),
              }))}
              formatValue={(v) => formatAmount(BigInt(Math.round(v)), currency)}
              formatAxis={(v) => formatAmountShort(BigInt(Math.round(v)), currency)}
            />
          )}
        </Card>

        <Card padded={false}>
          <div className="p-5 pb-3 sm:p-6 sm:pb-3">
            <CardHeader
              className="mb-0"
              title="Latest orders"
              action={
                <Link
                  href={`${basePath}/orders`}
                  className="inline-flex items-center gap-1 text-body font-medium text-content-secondary hover:text-content-primary"
                >
                  All orders
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              }
            />
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="px-5 pb-6 sm:px-6">
              <EmptyState icon={<Package />} title="No orders yet" className="py-10" />
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`${basePath}/orders/${order.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken/60 sm:px-6"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium">
                        {order.customerName ?? order.customerEmail}
                      </p>
                      <p className="text-caption text-content-tertiary" suppressHydrationWarning>
                        {formatRelative(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-body font-medium tabular-nums">
                        {BigInt(order.total) === 0n
                          ? 'Free'
                          : formatAmount(order.total, order.currency)}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
