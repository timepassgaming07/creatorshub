/**
 * Public Affiliate Promoter Portal View (Slice 8 §8.8, Slice 9 §9.8).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, frosted glass accents, copyable referral links.
 * 2. Real-time conversion funnel (Clicks -> Conversions -> Conversion Rate % -> Earnings).
 * 3. Ledger financial balance cards (Vested, In Hold Window, Paid, Reversals).
 * 4. Commissions and Holds timeline with maturation dates and status badges.
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
  readonly financialBreakdown?: {
    readonly held: string
    readonly vested: string
    readonly paid: string
    readonly clawedBack: string
    readonly totalEarned: string
  }
  readonly commissions?: readonly {
    readonly id: string
    readonly orderId: string
    readonly grossSaleAmount: string
    readonly commissionBps: number
    readonly grossAmount: string
    readonly netAmount: string
    readonly status: string
    readonly heldUntil: string
    readonly currency: string
    readonly createdAt: string
  }[]
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

function getDaysRemaining(heldUntilStr: string): { days: number; isMatured: boolean } {
  const heldUntil = new Date(heldUntilStr)
  const now = new Date()
  const diffMs = heldUntil.getTime() - now.getTime()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return {
    days: Math.max(0, days),
    isMatured: days <= 0,
  }
}

export function AffiliatePortalView({
  workspaceId: _workspaceId,
  code: _code,
  affiliate,
  link,
  financialBreakdown,
  commissions = [],
  attributions,
}: AffiliatePortalViewProps) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'commissions' | 'attributions'>('commissions')

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

  const heldAmount = financialBreakdown?.held ?? '0'
  const vestedAmount = financialBreakdown?.vested ?? affiliate.totalEarnings
  const paidAmount = financialBreakdown?.paid ?? '0'
  const clawedBackAmount = financialBreakdown?.clawedBack ?? '0'
  const totalEarnedAmount = financialBreakdown?.totalEarned ?? affiliate.totalEarnings

  return (
    <div className="min-h-screen bg-stone-50/60 pb-24 text-stone-900 font-sans">
      {/* Top Banner */}
      <div className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center font-extrabold text-xs shadow-sm">
              CH
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-600">
                Promoter Portal
              </div>
              <div className="text-sm font-bold text-stone-900">
                {affiliate.name || affiliate.email}
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              affiliate.status === 'approved'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {affiliate.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-8">
        {/* Referral Link Hero */}
        <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-stone-200 text-xs font-medium backdrop-blur-md">
              <span className="text-amber-400">✦</span> Your Unique Partner Referral Link
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Share and earn commissions on every referral
            </h1>
            <p className="text-stone-300 text-sm leading-relaxed">
              Every purchase made through your unique link is automatically tracked and credited to your partner account with transparent refund hold periods.
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
                className="px-6 py-3 rounded-xl bg-white text-stone-900 font-bold text-sm shadow-md hover:bg-stone-100 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-700">Copied to Clipboard!</span>
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

        {/* Financial Balance Cards (Slice 9) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
              Financial Balances & Payout Readiness
            </h2>
            <span className="text-xs text-stone-600">Updated from real-time double-entry ledger</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Vested & Ready */}
            <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm relative overflow-hidden bg-gradient-to-br from-white via-emerald-50/20 to-white">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                  Vested & Ready
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800 tracking-tight mt-2">
                {formatMinor(vestedAmount)}
              </div>
              <div className="text-xs text-emerald-800 mt-1 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Cleared refund window; ready for payout</span>
              </div>
            </div>

            {/* In Holding Period */}
            <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm bg-gradient-to-br from-white via-amber-50/20 to-white">
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                In Holding Period
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-800 tracking-tight mt-2">
                {formatMinor(heldAmount)}
              </div>
              <div className="text-xs text-amber-800 mt-1 flex items-center gap-1 font-medium">
                <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Vests automatically when hold expires</span>
              </div>
            </div>

            {/* Paid Out */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm">
              <div className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
                Paid Out
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mt-2">
                {formatMinor(paidAmount)}
              </div>
              <div className="text-xs text-stone-600 mt-1">Disbursed to your account</div>
            </div>

            {/* Total Net Earned */}
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-sm">
              <div className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
                Total Net Earned
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight mt-2">
                {formatMinor(totalEarnedAmount)}
              </div>
              {Number(clawedBackAmount) > 0 ? (
                <div className="text-xs text-rose-700 mt-1 font-medium">
                  {formatMinor(clawedBackAmount)} refunded / clawed back
                </div>
              ) : (
                <div className="text-xs text-stone-600 mt-1">Lifetime accrued commission</div>
              )}
            </div>
          </div>
        </div>

        {/* Funnel Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Link Clicks
            </div>
            <div className="text-2xl font-extrabold text-stone-900">{link.clicksCount}</div>
            <div className="text-[11px] text-stone-600 mt-0.5">Verified visits</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Sales Converted
            </div>
            <div className="text-2xl font-extrabold text-stone-900">{link.conversionsCount}</div>
            <div className="text-[11px] text-stone-600 mt-0.5">Attributed purchases</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Conversion Rate
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">{conversionRate}%</div>
            <div className="text-[11px] text-stone-600 mt-0.5">Click-to-sale ratio</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Avg. Per Conversion
            </div>
            <div className="text-2xl font-extrabold text-stone-900">
              {link.conversionsCount > 0
                ? formatMinor(
                    Math.round(
                      Number(totalEarnedAmount) / link.conversionsCount,
                    ).toString(),
                  )
                : '₹0.00'}
            </div>
            <div className="text-[11px] text-stone-600 mt-0.5">Earnings per order</div>
          </div>
        </div>

        {/* Tabbed Activity Ledger */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('commissions')}
                className={`text-sm font-bold pb-1 border-b-2 transition-all ${
                  activeTab === 'commissions'
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-600 hover:text-stone-700'
                }`}
              >
                Commissions & Holds ({commissions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('attributions')}
                className={`text-sm font-bold pb-1 border-b-2 transition-all ${
                  activeTab === 'attributions'
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-600 hover:text-stone-700'
                }`}
              >
                Attribution Activity ({attributions.length})
              </button>
            </div>
          </div>

          {activeTab === 'commissions' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-6">Sale Amount</th>
                    <th className="py-3 px-6">Commission Rate</th>
                    <th className="py-3 px-6">Status & Maturation</th>
                    <th className="py-3 px-6 text-right">Net Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {commissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-stone-600 text-sm">
                        No commission records found yet. Share your referral link to earn on every purchase!
                      </td>
                    </tr>
                  ) : (
                    commissions.map((comm) => {
                      const { days, isMatured } = getDaysRemaining(comm.heldUntil)
                      return (
                        <tr key={comm.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="py-4 px-6 text-stone-600 font-mono text-xs">
                            {new Date(comm.createdAt).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-4 px-6 font-medium text-stone-800">
                            {formatMinor(comm.grossSaleAmount, comm.currency)}
                          </td>
                          <td className="py-4 px-6 text-stone-600 text-xs">
                            {(comm.commissionBps / 100).toFixed(1)}%
                          </td>
                          <td className="py-4 px-6">
                            {comm.status === 'held' && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-600/20">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span>Held</span>
                                </span>
                                <div className="text-[11px] text-stone-600 font-medium">
                                  {isMatured ? 'Matured; awaiting batch release' : `Vests in ${days} days`}
                                </div>
                              </div>
                            )}
                            {comm.status === 'vested' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Vested</span>
                              </span>
                            )}
                            {comm.status === 'paid' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                                <span>Paid Out</span>
                              </span>
                            )}
                            {comm.status === 'clawed_back' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 ring-1 ring-rose-600/20">
                                <span>Clawed Back</span>
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-stone-900">
                            {formatMinor(comm.netAmount, comm.currency)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/75 text-[11px] font-semibold text-stone-600 uppercase tracking-wider">
                    <th className="py-3 px-6">Timestamp</th>
                    <th className="py-3 px-6">Attribution Status</th>
                    <th className="py-3 px-6 text-right">Commission Credited</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {attributions.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-stone-600 text-sm">
                        No attribution records logged yet.
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
          )}
        </div>
      </div>
    </div>
  )
}
