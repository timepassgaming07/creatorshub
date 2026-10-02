import type { Metadata } from 'next'

import { ProductsView } from '@/components/products/ProductsView'
import { loadProducts } from '@/lib/dashboard-data'

export const metadata: Metadata = { title: 'Products' }

export default async function ProductsPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params
  const products = await loadProducts(id)
  return <ProductsView products={products} />
}
