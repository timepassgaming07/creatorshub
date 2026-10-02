/** A buyer's order on a subdomain storefront. */
import { OrderRoute, orderMetadata } from '@/components/store/pages'

export const metadata = orderMetadata

type Props = {
  readonly params: Promise<{ readonly subdomain: string; readonly orderId: string }>
}

export default async function Page({ params }: Props) {
  const { subdomain, orderId } = await params
  return <OrderRoute prefix="s" host={decodeURIComponent(subdomain)} orderId={orderId} />
}
