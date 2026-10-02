import type { Metadata } from 'next'

import { PayoutsView } from '@/components/payouts/PayoutsView'
import { loadPayouts } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Payouts' }

export default async function PayoutsPage({
  params,
}: {
  readonly params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await loadPayouts(id)
  return <PayoutsView data={data} />
}
