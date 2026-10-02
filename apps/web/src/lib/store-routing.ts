/**
 * Where storefront links point.
 *
 * On a creator's own host (asha.creatorhub.store or shop.asha.com) the
 * middleware rewrites `/p/x` to `/s/asha/p/x`, so links are written from the
 * root. On the platform host, during local development and previews, the
 * store lives under `/s/<subdomain>` and links carry that prefix.
 */
import { headers } from 'next/headers'

export async function storeBasePath(prefix: 's' | 'c', host: string): Promise<string> {
  const target = (await headers()).get('x-creatorhub-target')
  if (target === 'storefront-subdomain' || target === 'storefront-custom-domain') return ''
  return `/${prefix}/${host}`
}
