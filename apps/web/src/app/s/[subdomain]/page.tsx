/** Storefront home on a subdomain. */
import type { Metadata } from 'next'

import { StoreHomeRoute, storeHomeMetadata } from '@/components/store/pages'

type Props = {
  readonly params: Promise<{ readonly subdomain: string }>
  readonly searchParams: Promise<{ readonly preview?: string; readonly ref?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subdomain } = await params
  return storeHomeMetadata(decodeURIComponent(subdomain))
}

export default async function Page({ params, searchParams }: Props) {
  const { subdomain } = await params
  const { preview, ref } = await searchParams
  return (
    <StoreHomeRoute
      prefix="s"
      host={decodeURIComponent(subdomain)}
      preview={preview}
      referral={ref}
    />
  )
}
