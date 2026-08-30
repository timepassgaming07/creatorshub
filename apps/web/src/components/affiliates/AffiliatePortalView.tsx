/**
 * Public Affiliate Promoter Portal View (Slice 8 §8.8).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, frosted glass accents, copyable referral links.
 * 2. Real-time conversion funnel (Clicks -> Conversions -> Conversion Rate % -> Earnings).
 * 3. Chronological attribution log with transparent rejection reason reporting.
 */
'use client'

import React, { useState } from 'react'

export type AffiliatePortalViewProps = {
  readonly workspaceId: string
  readonly code: string
  readonly affiliate: {
    readonly name: string | null
    readonly email: string
    readonly status: string
    readonly totalEarnings: string
    readonly totalConversions: number
  }
  readonly link: {
    readonly code: string
    readonly clicksCount: number
    readonly conversionsCount: number
    readonly destinationUrl: string | null
  }
  readonly attributions: readonly {
    readonly id: string
    readonly commissionAmount: string
    readonly status: string
    readonly attributedAt: string
  }[]
}

function formatMinor(amountStr: string, currency = 'INR'): string {
  const minor = Number(amountStr)
  if (isNaN(minor)) return '₹0.00'
  const major = minor / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(major)
}

export function AffiliatePortalView({
  workspaceId,
  code,
  affiliate,
  link,
  attributions,
}: AffiliatePortalViewProps) {
  const [copied, setCopied] = useState(false)

  // Construct shareable referral URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://creatorhub.test'
  const referralUrl = `${origin}/?ref=${link.code}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
    }
  }

  const conversionRate =
    link.clicksCount > 0
      ? ((link.conversionsCount / link.clicksCount) * 100).toFixed(1)
      : '0.0'

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-50/50 pb-24 text-stone-900">
      {/* Top Banner */}
      <div className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-xs">
              CH
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                Promoter Portal
              </div>
              <div className="text-sm font-bold text-stone-900">
                {affiliate.name || affiliate.email}
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              affiliate.status === 'approved'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
            }`}
          >
            ● {affiliate.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Referral Link Card */}
        <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="max-w-xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-stone-200 text-xs font-medium backdrop-blur-md">
              <span>✦</span> Your Unique Partner Link
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Share and earn commission on every sale
            </h1>
            <p className="text-stone-300 text-sm">
              Use your personalized code to refer customers. Every purchase completed through your link is tracked automatically.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-2">
              <input
                type="text"
                readOnly
                value={referralUrl}
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none backdrop-blur-md"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-6 py-3 rounded-xl bg-white text-stone-900 font-semibold text-sm shadow-md hover:bg-stone-100 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-stone-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Funnel Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Total Clicks
            </div>
            <div className="text-3xl font-extrabold text-stone-900">{link.clicksCount}</div>
            <div className="text-[11px] text-stone-400 mt-1">Verified human visits</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Sales Converted
            </div>
            <div className="text-3xl font-extrabold text-stone-900">{link.conversionsCount}</div>
            <div className="text-[11px] text-stone-400 mt-1">Orders attributed</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Conversion Rate
            </div>
            <div className="text-3xl font-extrabold text-emerald-600">{conversionRate}%</div>
            <div className="text-[11px] text-stone-400 mt-1">Clicks to purchases</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Total Earnings
            </div>
            <div className="text-3xl font-extrabold text-stone-900">
              {formatMinor(affiliate.totalEarnings)}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Lifetime accrued commission</div>
          </div>
        </div>

        {/* Recent Attributions Log */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-stone-200 bg-stone-50/50">
            <h2 className="text-base font-bold text-stone-900">Recent Referrals & Sales</h2>
            <p className="text-xs text-stone-500">Live ledger of purchases made through your link</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6 text-right">Commission Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {attributions.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-stone-400 text-sm">
                      No sales recorded yet. Share your link to start earning!
                    </td>
                  </tr>
                ) : (
                  attributions.map((attr) => (
                    <tr key={attr.id} className="hover:bg-stone-50/50">
                      <td className="py-4 px-6 text-stone-600 font-mono text-xs">
                        {new Date(attr.attributedAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            attr.status === 'attributed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {attr.status === 'attributed' ? 'Credited' : attr.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-stone-900">
                        {formatMinor(attr.commissionAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
