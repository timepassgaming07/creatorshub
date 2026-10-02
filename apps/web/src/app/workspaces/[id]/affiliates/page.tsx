import type { Metadata } from 'next'

import { AffiliatesView } from '@/components/affiliates/AffiliatesView'
import { loadAffiliates } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Affiliates' }

export default async function AffiliatesPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadAffiliates(id)
  return <AffiliatesView data={data} />
}
