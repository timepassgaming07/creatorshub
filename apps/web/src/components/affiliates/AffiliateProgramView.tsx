/**
 * Creator Affiliate Programme Dashboard View (Slice 8 §8.8, §8.9).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, frosted glass accents, rich gradients.
 * 2. Real-time program settings controls (commission rate slider, cookie window, self-referral defense).
 * 3. Promoters directory with approval/suspension lifecycle and custom commission overrides.
 * 4. Referral link generator and 1-click CSV export.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'

import type {
  AffiliateDTO,
  AffiliateProgramDTO,
  AffiliateSummaryDTO,
} from '../../lib/affiliate-actions'
import {
  createAffiliateLinkAction,
  exportAffiliatesCsvAction,
  listAffiliatesAction,
  updateAffiliateProgramAction,
  updateAffiliateStatusAction,
} from '../../lib/affiliate-actions'

export type AffiliateProgramViewProps = {
  readonly workspaceId: string
  readonly initialProgram: AffiliateProgramDTO | null
  readonly initialSummary: AffiliateSummaryDTO
  readonly initialAffiliates: readonly AffiliateDTO[]
  readonly initialTotalAffiliates: number
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

export function AffiliateProgramView({
  workspaceId,
  initialProgram,
  initialSummary,
  initialAffiliates,
  initialTotalAffiliates,
}: AffiliateProgramViewProps) {
  const [program, setProgram] = useState<AffiliateProgramDTO | null>(initialProgram)
  const [summary, setSummary] = useState<AffiliateSummaryDTO>(initialSummary)
  const [affiliatesList, setAffiliatesList] = useState<readonly AffiliateDTO[]>(initialAffiliates)
  const [totalAffiliates, setTotalAffiliates] = useState<number>(initialTotalAffiliates)

  // Settings State
  const [isActive, setIsActive] = useState<boolean>(initialProgram?.isActive ?? false)
  const [defaultCommissionBps, setDefaultCommissionBps] = useState<number>(
    initialProgram?.defaultCommissionBps ?? 2000,
  )
  const [cookieWindowDays, setCookieWindowDays] = useState<number>(
    initialProgram?.cookieWindowDays ?? 30,
  )
  const [allowSelfReferral, setAllowSelfReferral] = useState<boolean>(
    initialProgram?.allowSelfReferral ?? false,
  )
  const [autoApproveAffiliates, setAutoApproveAffiliates] = useState<boolean>(
    initialProgram?.autoApproveAffiliates ?? false,
  )

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // UI / Action State
  const [isPending, startTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'affiliates' | 'settings'>('affiliates')

  // New Link Modal State
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string>('')
  const [linkCode, setLinkCode] = useState<string>('')
  const [linkDestination, setLinkDestination] = useState<string>('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null)

  const handleSaveSettings = () => {
    setSaveError(null)
    setSaveSuccess(false)
    startTransition(async () => {
      const res = await updateAffiliateProgramAction(workspaceId, {
        isActive,
        defaultCommissionBps,
        cookieWindowDays,
        allowSelfReferral,
        autoApproveAffiliates,
      })

      if (res.ok) {
        setProgram(res.data)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setSaveError(res.error.message)
      }
    })
  }

  const handleFilterChange = (newStatus: string, newQuery: string) => {
    setStatusFilter(newStatus)
    setSearchQuery(newQuery)
    startTransition(async () => {
      const res = await listAffiliatesAction(workspaceId, {
        status: newStatus === 'all' ? undefined : newStatus,
        query: newQuery.trim() || undefined,
      })
      if (res.ok) {
        setAffiliatesList(res.data.items)
        setTotalAffiliates(res.data.total)
      }
    })
  }

  const handleStatusUpdate = (affiliateId: string, newStatus: 'approved' | 'suspended' | 'rejected') => {
    startTransition(async () => {
      const res = await updateAffiliateStatusAction(workspaceId, affiliateId, newStatus)
      if (res.ok) {
        setAffiliatesList((prev) =>
          prev.map((a) => (a.id === affiliateId ? { ...a, status: res.data.status } : a)),
        )
      }
    })
  }

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLinkError(null)
    setLinkSuccess(null)

    if (!selectedAffiliateId || !linkCode.trim()) {
      setLinkError('Please select a promoter and enter a referral code.')
      return
    }

    startTransition(async () => {
      const res = await createAffiliateLinkAction(workspaceId, {
        affiliateId: selectedAffiliateId,
        code: linkCode.trim().toLowerCase(),
        destinationUrl: linkDestination.trim() || undefined,
      })

      if (res.ok) {
        setLinkSuccess(`Referral link "${linkCode.trim().toLowerCase()}" created successfully!`)
        setLinkCode('')
        setLinkDestination('')
        setTimeout(() => {
          setShowLinkModal(false)
          setLinkSuccess(null)
        }, 1500)
      } else {
        setLinkError(res.error.message)
      }
    })
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const res = await exportAffiliatesCsvAction(workspaceId)
      if (res.ok) {
        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `affiliates-export-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } else {
        alert(res.error.message)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-50/50 pb-24 text-stone-900">
      {/* Top Header & Breadcrumb */}
      <div className="border-b border-stone-200/80 bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-1">
                <Link
                  href={`/workspaces/${workspaceId}`}
                  className="hover:text-stone-900 transition-colors"
                >
                  Workspace Hub
                </Link>
                <span>/</span>
                <span className="text-stone-800">Affiliate Programme</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                  Affiliate Programme
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                      : 'bg-stone-100 text-stone-600 ring-1 ring-stone-500/20'
                  }`}
                >
                  {isActive ? '● Program Active' : '○ Disabled'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowLinkModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-stone-900 text-white shadow-sm hover:bg-stone-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Referral Link
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-white text-stone-700 border border-stone-200 shadow-sm hover:bg-stone-50 transition-all disabled:opacity-50"
              >
                <svg className="w-4 h-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Key Metrics Banners */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm shadow-stone-200/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Active Promoters
            </div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {summary.activeAffiliatesCount}{' '}
              <span className="text-sm font-normal text-stone-500">/ {summary.totalAffiliates}</span>
            </div>
            <div className="text-xs text-stone-500 mt-2">Registered partner promoters</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm shadow-stone-200/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Default Commission
            </div>
            <div className="text-3xl font-extrabold text-emerald-600 tracking-tight">
              {(defaultCommissionBps / 100).toFixed(1)}%
            </div>
            <div className="text-xs text-stone-500 mt-2">{defaultCommissionBps} basis points per sale</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm shadow-stone-200/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Referred Sales
            </div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {summary.totalConversionsCount}
            </div>
            <div className="text-xs text-stone-500 mt-2">Successful affiliate conversions</div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-sm shadow-stone-200/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
              Total Accrued Commission
            </div>
            <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
              {formatMinor(summary.totalCommissionAccruedMinor)}
            </div>
            <div className="text-xs text-stone-500 mt-2">Earned across all promoters</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 space-x-8">
          <button
            type="button"
            onClick={() => setActiveTab('affiliates')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'affiliates'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Promoters & Affiliates ({totalAffiliates})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            Program Rules & Settings
          </button>
        </div>

        {/* Tab Content: Promoters Table */}
        {activeTab === 'affiliates' && (
          <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
            {/* Search & Filter Bar */}
            <div className="p-4 sm:p-6 border-b border-stone-200/80 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-stone-50/50">
              <div className="relative flex-1 max-w-md">
                <svg
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search promoters by name or email..."
                  value={searchQuery}
                  onChange={(e) => handleFilterChange(statusFilter, e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 transition-all"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                {['all', 'approved', 'pending', 'suspended'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleFilterChange(st, searchQuery)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                      statusFilter === st
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200/80 bg-stone-50/75 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    <th className="py-3 px-6">Promoter</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Commission Rate</th>
                    <th className="py-3 px-6 text-right">Conversions</th>
                    <th className="py-3 px-6 text-right">Earnings</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-sm">
                  {affiliatesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-stone-500">
                        <div className="max-w-sm mx-auto space-y-2">
                          <svg className="w-8 h-8 mx-auto text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <p className="font-semibold text-stone-800">No promoters found</p>
                          <p className="text-xs text-stone-500">
                            Promoters will appear here when they register or when you create referral links.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    affiliatesList.map((aff) => {
                      const initials = (aff.name || aff.email)
                        .slice(0, 2)
                        .toUpperCase()
                      return (
                        <tr key={aff.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                {initials}
                              </div>
                              <div>
                                <div className="font-semibold text-stone-900">
                                  {aff.name || 'Unnamed Promoter'}
                                </div>
                                <div className="text-xs text-stone-500 font-mono">{aff.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                aff.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                                  : aff.status === 'pending'
                                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
                                  : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
                              }`}
                            >
                              {aff.status.charAt(0).toUpperCase() + aff.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            {aff.customCommissionBps ? (
                              <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md text-xs border border-purple-200">
                                {(aff.customCommissionBps / 100).toFixed(1)}% (Custom)
                              </span>
                            ) : (
                              <span className="text-stone-600 text-xs">
                                {(defaultCommissionBps / 100).toFixed(1)}% (Default)
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right font-medium text-stone-900">
                            {aff.totalConversions}
                          </td>
                          <td className="py-4 px-6 text-right font-semibold text-stone-900">
                            {formatMinor(aff.totalEarnings)}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {aff.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'approved')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all"
                                >
                                  Approve
                                </button>
                              )}
                              {aff.status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'suspended')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-100 text-stone-700 hover:bg-rose-50 hover:text-rose-700 transition-all border border-stone-200"
                                >
                                  Suspend
                                </button>
                              )}
                              {aff.status === 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'approved')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all"
                                >
                                  Re-Activate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Program Settings */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl bg-white rounded-2xl border border-stone-200/80 shadow-sm p-6 sm:p-8 space-y-8">
            <div>
              <h2 className="text-lg font-bold text-stone-900 mb-1">Affiliate Programme Configuration</h2>
              <p className="text-sm text-stone-500">
                Define the default commission rate, referral cookie lifespan, and anti-fraud boundaries.
              </p>
            </div>

            {saveSuccess && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Program settings saved successfully!
              </div>
            )}

            {saveError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
                {saveError}
              </div>
            )}

            <div className="space-y-6">
              {/* Program Enabled Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-stone-50 border border-stone-200/80">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">Enable Affiliate Programme</div>
                  <div className="text-xs text-stone-500">Allow promoters to track referrals and earn commissions</div>
                </div>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-5 h-5 rounded text-stone-900 focus:ring-stone-900 border-stone-300"
                />
              </div>

              {/* Commission Rate Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-stone-900">
                    Default Commission Rate
                  </label>
                  <span className="text-sm font-bold text-emerald-600">
                    {(defaultCommissionBps / 100).toFixed(1)}% ({defaultCommissionBps} bps)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="50"
                  value={defaultCommissionBps}
                  onChange={(e) => setDefaultCommissionBps(Number(e.target.value))}
                  className="w-full accent-stone-900 cursor-pointer"
                />
                <p className="text-xs text-stone-500">
                  Promoters receive this percentage of each order subtotal unless granted a custom rate override.
                </p>
              </div>

              {/* Cookie Window Duration */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-900">
                  Attribution Cookie Window (Days)
                </label>
                <select
                  value={cookieWindowDays}
                  onChange={(e) => setCookieWindowDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                >
                  <option value={7}>7 Days (Short promotional sprints)</option>
                  <option value={14}>14 Days (Standard promo cycle)</option>
                  <option value={30}>30 Days (Recommended industry standard)</option>
                  <option value={60}>60 Days (Extended review window)</option>
                  <option value={90}>90 Days (Long-tail courses & memberships)</option>
                </select>
              </div>

              {/* Self-Referral Prevention */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-stone-50 border border-stone-200/80">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">Allow Self-Referral</div>
                  <div className="text-xs text-stone-500">
                    If disabled, promoters cannot earn commission by buying through their own link.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowSelfReferral}
                  onChange={(e) => setAllowSelfReferral(e.target.checked)}
                  className="w-5 h-5 rounded text-stone-900 focus:ring-stone-900 border-stone-300"
                />
              </div>

              {/* Auto-Approve Promoters */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-stone-50 border border-stone-200/80">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">Auto-Approve New Promoters</div>
                  <div className="text-xs text-stone-500">
                    Immediately activate new affiliate registrations without manual review.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoApproveAffiliates}
                  onChange={(e) => setAutoApproveAffiliates(e.target.checked)}
                  className="w-5 h-5 rounded text-stone-900 focus:ring-stone-900 border-stone-300"
                />
              </div>

              <div className="pt-4 border-t border-stone-200 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isPending}
                  className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-stone-900 text-white shadow-sm hover:bg-stone-800 transition-all disabled:opacity-50"
                >
                  {isPending ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Referral Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-stone-200 max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-stone-900">Create Referral Link</h3>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            {linkSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                {linkSuccess}
              </div>
            )}

            {linkError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
                {linkError}
              </div>
            )}

            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Select Promoter
                </label>
                <select
                  value={selectedAffiliateId}
                  onChange={(e) => setSelectedAffiliateId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                >
                  <option value="">-- Select an affiliate --</option>
                  {affiliatesList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || a.email} ({a.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Custom Referral Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. SUMMER25, YOUTUBE"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  Visitor links will use <code className="bg-stone-100 px-1 py-0.5 rounded">?ref={linkCode || 'code'}</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1.5">
                  Destination URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkDestination}
                  onChange={(e) => setLinkDestination(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-stone-900 text-white shadow-sm hover:bg-stone-800 disabled:opacity-50"
                >
                  {isPending ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
