import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CustomersView } from '@/components/customers/CustomersView'
import { ErrorState } from '@/components/ds'
import { listCustomersAction } from '@/lib/customer-actions'

export const metadata: Metadata = { title: 'Customers' }

const PAGE_SIZE = 25

export default async function CustomersPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>
  readonly searchParams: Promise<{ q?: string; page?: string }>
}) {
  const { id } = await params
  const query = await searchParams
  const page = Math.max(1, Number(query.page) || 1)
  const result = await listCustomersAction(id, {
    query: query.q?.slice(0, 100),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  if (!result.ok) {
    if (result.error.code === 'FORBIDDEN') notFound()
    return <ErrorState detail={result.error.message} />
  }
  return (
    <CustomersView
      customers={result.data.customers}
      totalCount={result.data.totalCount}
      summary={result.data.summary}
      page={page}
      pageSize={PAGE_SIZE}
      query={query.q ?? ''}
    />
  )
}
