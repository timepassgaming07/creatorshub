/** Checkout on a subdomain storefront: /checkout?product=<slug>&variant=<id>&code=<discount> */
import { CheckoutRoute, checkoutMetadata } from '@/components/store/pages'

export const metadata = checkoutMetadata

type Props = {
  readonly params: Promise<{ readonly subdomain: string }>
  readonly searchParams: Promise<{
    readonly product?: string
    readonly variant?: string
    readonly code?: string
  }>
}

export default async function Page({ params, searchParams }: Props) {
  const { subdomain } = await params
  const query = await searchParams
  return (
    <CheckoutRoute
      prefix="s"
      host={decodeURIComponent(subdomain)}
      productSlug={query.product}
      variantId={query.variant}
      discount={query.code}
    />
  )
}
