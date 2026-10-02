/**
 * Public Affiliate Promoter Portal Page (Slice 8 §8.8).
 *
 * Route: /affiliate/[code]
 */
import { notFound } from 'next/navigation'

import { AffiliatePortalView } from '../../../components/affiliates/AffiliatePortalView'
import { getAffiliatePortalDataAction } from '../../../lib/affiliate-actions'

export const dynamic = 'force-dynamic'

export default async function AffiliatePortalPage(props: {
  params: Promise<{ code: string }>
}) {
  const { code } = await props.params

  const res = await getAffiliatePortalDataAction(code)

  if (!res.ok) {
    if (res.error.code === 'NOT_FOUND') {
      notFound()
    }

    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-stone-200 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl font-bold mx-auto mb-4">
            !
          </div>
          <h2 className="text-xl font-bold text-stone-900 mb-2">Error Loading Portal</h2>
          <p className="text-sm text-stone-500 mb-6">{res.error.message}</p>
          <a
            href="/"
            className="inline-block py-2.5 px-6 rounded-xl bg-stone-900 text-white font-medium text-sm hover:bg-stone-800 transition-colors"
          >
            Return Home
          </a>
        </div>
      </div>
    )
  }

  return (
    <AffiliatePortalView
      workspaceId={res.data.workspaceId}
      code={code}
      affiliate={res.data.affiliate}
      link={res.data.link}
      financialBreakdown={res.data.financialBreakdown}
      commissions={res.data.commissions}
      attributions={res.data.attributions}
    />
  )
}
