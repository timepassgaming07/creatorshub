/** Product page on a custom domain storefront. */
import type { Metadata } from 'next'

import { ProductRoute, productMetadata } from '@/components/store/pages'

type Props = {
  readonly params: Promise<{ readonly domain: string; readonly slug: string }>
  readonly searchParams: Promise<{ readonly preview?: string; readonly ref?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain, slug } = await params
  return productMetadata(decodeURIComponent(domain), slug)
}

export default async function Page({ params, searchParams }: Props) {
  const { domain, slug } = await params
  const { preview, ref } = await searchParams
  return (
    <ProductRoute prefix="c" host={decodeURIComponent(domain)} slug={slug} preview={preview} referral={ref} />
  )
}
