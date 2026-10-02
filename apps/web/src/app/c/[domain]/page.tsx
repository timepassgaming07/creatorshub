/** Storefront home on a custom domain. */
import type { Metadata } from 'next'

import { StoreHomeRoute, storeHomeMetadata } from '@/components/store/pages'

type Props = {
  readonly params: Promise<{ readonly domain: string }>
  readonly searchParams: Promise<{ readonly preview?: string; readonly ref?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { domain } = await params
  return storeHomeMetadata(decodeURIComponent(domain))
}

export default async function Page({ params, searchParams }: Props) {
  const { domain } = await params
  const { preview, ref } = await searchParams
  return <StoreHomeRoute prefix="c" host={decodeURIComponent(domain)} preview={preview} referral={ref} />
}
