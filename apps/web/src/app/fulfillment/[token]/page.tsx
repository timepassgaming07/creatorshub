/**
 * Digital Asset Fulfillment Page (Slice 6 §6.7).
 *
 * Route: /fulfillment/[token]
 *
 * Allows buyers to access their purchased digital products without account registration.
 * Validates download token, entitlement status, use-caps, and expiry dates.
 */
import { notFound } from 'next/navigation'

import { DownloadPortalView } from '../../../components/fulfillment/DownloadPortalView'
import { getFulfillmentDetailsAction } from '../../../lib/fulfillment-actions'

export const dynamic = 'force-dynamic'

export default async function FulfillmentPage(props: {
  params: Promise<{ token: string }>
}) {
  const { token } = await props.params

  const result = await getFulfillmentDetailsAction(token)

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND' || result.error.code === 'INVALID_TOKEN') {
      notFound()
    }

    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl font-bold mx-auto mb-4">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Error Accessing Download</h2>
          <p className="text-sm text-slate-500 mb-6">{result.error.message}</p>
          <a
            href="/"
            className="inline-block py-2.5 px-6 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors"
          >
            Return Home
          </a>
        </div>
      </div>
    )
  }

  return <DownloadPortalView data={result.data} />
}
