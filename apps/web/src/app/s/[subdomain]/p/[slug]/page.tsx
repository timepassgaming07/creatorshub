/** Product page on a subdomain storefront. */
import type { Metadata } from 'next'

import { ProductRoute, productMetadata } from '@/components/store/pages'

type Props = {
  readonly params: Promise<{ readonly subdomain: string; readonly slug: string }>
  readonly searchParams: Promise<{ readonly preview?: string; readonly ref?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subdomain, slug } = await params
  return productMetadata(decodeURIComponent(subdomain), slug)
}

export default async function Page({ params, searchParams }: Props) {
  const { subdomain, slug } = await params
  const { preview, ref } = await searchParams
  return (
    <ProductRoute prefix="s" host={decodeURIComponent(subdomain)} slug={slug} preview={preview} referral={ref} />
  )
}
