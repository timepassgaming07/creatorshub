/**
 * Order Status & Fulfillment Confirmation Route (Slice 5 §5.11).
 * Route: /checkout/[orderId]
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicOrderSummaryAction } from '@/lib/checkout-actions'
import { CheckoutSuccessView } from '@/components/checkout/CheckoutSuccessView'
import { CheckoutFailureView } from '@/components/checkout/CheckoutFailureView'

export const metadata: Metadata = {
  title: 'Order Status · CreatorHub',
  description: 'Order confirmation and digital access.',
  robots: { index: false, follow: false },
}

type OrderStatusPageProps = {
  readonly params: Promise<{ readonly orderId: string }>
  readonly searchParams?: Promise<{ readonly workspaceId?: string }>
}

export default async function OrderStatusPage({ params, searchParams }: OrderStatusPageProps) {
  const { orderId } = await params
  const sParams = await searchParams

  const result = await getPublicOrderSummaryAction(orderId, sParams?.workspaceId)
  if (!result.ok) {
    notFound()
  }

  const order = result.data

  if (order.status === 'paid') {
    return (
      <div className="min-h-screen bg-slate-50/50 py-6 sm:py-10">
        <CheckoutSuccessView order={order} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/50 py-12 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        <CheckoutFailureView
          errorMessage={order.failureReason ?? 'This order requires payment before fulfillment.'}
          onRetry={() => {
            if (typeof window !== 'undefined') {
              window.location.reload()
            }
          }}
          onBackToCheckout={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/'
            }
          }}
        />
      </div>
    </div>
  )
}
