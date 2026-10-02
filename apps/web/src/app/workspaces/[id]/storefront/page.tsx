import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { StoreEditor } from '@/components/storefront-editor/StoreEditor'
import { loadStorefrontEditor } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Storefront' }

export default async function StorefrontPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await loadStorefrontEditor(id)
  if (!data) notFound()
  return <StoreEditor workspaceId={id} data={data} />
}
