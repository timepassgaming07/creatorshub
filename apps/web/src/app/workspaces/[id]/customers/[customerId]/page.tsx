import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CustomerProfile } from '@/components/customers/CustomerProfile'
import { ErrorState } from '@/components/ds'
import { getCustomerDetailsAction } from '@/lib/customer-actions'

export const metadata: Metadata = { title: 'Customer' }

export default async function CustomerPage({
  params,
}: {
  readonly params: Promise<{ id: string; customerId: string }>
}) {
  const { id, customerId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) notFound()
  const result = await getCustomerDetailsAction(id, customerId)
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND' || result.error.code === 'FORBIDDEN') notFound()
    return <ErrorState detail={result.error.message} />
  }
  return <CustomerProfile data={result.data} />
}
