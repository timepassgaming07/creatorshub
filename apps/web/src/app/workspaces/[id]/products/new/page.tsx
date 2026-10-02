import type { Metadata } from 'next'

import { NewProductForm } from '@/components/products/NewProductForm'

export const metadata: Metadata = { title: 'New product' }

export default function NewProductPage() {
  return <NewProductForm />
}
