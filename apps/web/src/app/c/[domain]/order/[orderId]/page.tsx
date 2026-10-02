/** A buyer's order on a custom domain storefront. */
import { OrderRoute, orderMetadata } from '@/components/store/pages'

export const metadata = orderMetadata

type Props = {
  readonly params: Promise<{ readonly domain: string; readonly orderId: string }>
}

export default async function Page({ params }: Props) {
  const { domain, orderId } = await params
  return <OrderRoute prefix="c" host={decodeURIComponent(domain)} orderId={orderId} />
}
