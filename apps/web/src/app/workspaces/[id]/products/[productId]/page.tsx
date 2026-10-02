import type { Metadata } from 'next'

import { ProductEditor } from '@/components/products/ProductEditor'
import { loadProductEditor } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Edit product' }

export default async function ProductPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string; productId: string }>
  readonly searchParams: Promise<{ created?: string }>
}) {
  const { id, productId } = await params
  const { created } = await searchParams
  const data = await loadProductEditor(id, productId)
  return <ProductEditor key={data.product.id} data={data} justCreated={created === '1'} />
}
