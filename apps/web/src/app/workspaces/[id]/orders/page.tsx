import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { OrdersView } from '@/components/orders/OrdersView'
import { ErrorState } from '@/components/ds'
import { listOrdersAction } from '@/lib/order-actions'

export const metadata: Metadata = { title: 'Orders' }

const PAGE_SIZE = 25
const STATUSES = ['paid', 'requires_payment', 'refunded', 'partially_refunded'] as const

export default async function OrdersPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>
  readonly searchParams: Promise<{ status?: string; q?: string; page?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const status = STATUSES.find((s) => s === query.status)
  const page = Math.max(1, Number(query.page) || 1)

  const result = await listOrdersAction(id, {
    status,
    query: query.q?.slice(0, 100),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') notFound()
    return <ErrorState detail={result.error.message} />
  }

  return (
    <OrdersView
      orders={result.data.orders}
      totalCount={result.data.totalCount}
      summary={result.data.summary}
      page={page}
      pageSize={PAGE_SIZE}
      status={status ?? 'all'}
      query={query.q ?? ''}
    />
  )
}
