import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ErrorState } from '@/components/ds'
import { OrderDetail } from '@/components/orders/OrderDetail'
import { getOrderDetailsAction } from '@/lib/order-actions'

export const metadata: Metadata = { title: 'Order' }

export default async function OrderPage({
  params,
}: {
  readonly params: Promise<{ id: string; orderId: string }>
}) {
  const { id, orderId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) notFound()
  const result = await getOrderDetailsAction(id, orderId)
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND' || result.error.code === 'FORBIDDEN') notFound()
    return <ErrorState detail={result.error.message} />
  }
  return <OrderDetail data={result.data} />
}
