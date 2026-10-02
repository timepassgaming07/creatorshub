import type { Metadata } from 'next'

import { DiscountsView } from '@/components/discounts/DiscountsView'
import { loadDiscounts } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Discounts' }

export default async function DiscountsPage({
  params,
}: {
  readonly params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await loadDiscounts(id)
  return <DiscountsView data={data} />
}
