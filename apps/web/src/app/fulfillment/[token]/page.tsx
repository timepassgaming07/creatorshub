/**
 * Download page: /fulfillment/<token>
 *
 * Linked from the buyer's receipt email. The token names its workspace, so
 * this works on the platform host whatever the creator's store domain is.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { DownloadPortalView } from '@/components/fulfillment/DownloadPortalView'
import { ErrorState } from '@/components/ds'
import { getFulfillmentDetails } from '@/lib/fulfillment-actions'

export const metadata: Metadata = {
  title: 'Your download',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = {
  readonly params: Promise<{ readonly token: string }>
  readonly searchParams: Promise<{ readonly error?: string }>
}

export default async function DownloadPage({ params, searchParams }: Props) {
  const { token } = await params
  const { error } = await searchParams
  const result = await getFulfillmentDetails(decodeURIComponent(token))

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND' || result.error.code === 'INVALID_TOKEN') {
      return (
        <main id="main" className="flex min-h-dvh items-center justify-center bg-surface-base px-5">
          <div className="w-full max-w-md">
            <ErrorState title="This link does not work" detail={result.error.message} />
          </div>
        </main>
      )
    }
    notFound()
  }

  return <DownloadPortalView data={result.data} errorCode={error} />
}
