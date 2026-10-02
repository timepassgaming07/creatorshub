/**
 * Creator Affiliate Programme Dashboard View (Slice 8 §8.8, §8.9, Slice 9 §9.8).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, frosted glass accents, rich gradients.
 * 2. Real-time program settings controls (commission rate slider, cookie window, self-referral defense).
 * 3. Promoters directory with approval/suspension lifecycle and custom commission overrides.
 * 4. Commissions & Holds ledger with automated batch vesting release and refund clawback modal.
 * 5. Referral link generator and 1-click CSV export.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'

import type {
  AffiliateDTO,
  AffiliateProgramDTO,
  AffiliateSummaryDTO,
} from '../../lib/affiliate-actions'
import type { CommissionDTO } from '@creatorhub/contracts'
import {
  createAffiliateLinkAction,
  exportAffiliatesCsvAction,
  listAffiliatesAction,
  updateAffiliateProgramAction,
  updateAffiliateStatusAction,
} from '../../lib/affiliate-actions'
import {
  applyClawbackAction,
  listCommissionsAction,
  releaseVestedCommissionsAction,
} from '../../lib/commission-actions'

export type AffiliateProgramViewProps = {
  readonly workspaceId: string
  readonly initialProgram: AffiliateProgramDTO | null
  readonly initialSummary: AffiliateSummaryDTO
  readonly initialAffiliates: readonly AffiliateDTO[]
  readonly initialTotalAffiliates: number
  readonly initialCommissions?: readonly CommissionDTO[]
  readonly initialTotalCommissions?: number
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

export function AffiliateProgramView({
  workspaceId,
  initialProgram,
  initialSummary,
  initialAffiliates,
  initialTotalAffiliates,
  initialCommissions = [],
  initialTotalCommissions = 0,
}: AffiliateProgramViewProps) {
  const [program, setProgram] = useState<AffiliateProgramDTO | null>(initialProgram)
  const [summary, setSummary] = useState<AffiliateSummaryDTO>(initialSummary)
  const [affiliatesList, setAffiliatesList] = useState<readonly AffiliateDTO[]>(initialAffiliates)
  const [totalAffiliates, setTotalAffiliates] = useState<number>(initialTotalAffiliates)

  // Commission State (Slice 9)
  const [commissionsList, setCommissionsList] =
    useState<readonly CommissionDTO[]>(initialCommissions)
  const [totalCommissions, setTotalCommissions] = useState<number>(initialTotalCommissions)
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<string>('all')
  const [commissionSearchQuery, setCommissionSearchQuery] = useState('')
  const [vestingFeedback, setVestingFeedback] = useState<{
    message: string
    type: 'success' | 'error'
  } | null>(null)

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

  // Search & Filter State for Affiliates
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // UI / Action State
  const [isPending, startTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'affiliates' | 'commissions' | 'settings'>(
    'affiliates',
  )

  // New Link Modal State
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string>('')
  const [linkCode, setLinkCode] = useState<string>('')
  const [linkDestination, setLinkDestination] = useState<string>('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null)

  // Clawback Modal State (Slice 9)
  const [showClawbackModal, setShowClawbackModal] = useState(false)
  const [targetCommission, setTargetCommission] = useState<CommissionDTO | null>(null)
  const [clawbackRefundId, setClawbackRefundId] = useState<string>('')
  const [clawbackAmount, setClawbackAmount] = useState<string>('')
  const [clawbackReason, setClawbackReason] = useState<string>('Customer refund requested')
  const [clawbackError, setClawbackError] = useState<string | null>(null)
  const [clawbackSuccess, setClawbackSuccess] = useState<string | null>(null)

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

  const handleCommissionFilterChange = (newStatus: string, newQuery: string) => {
    setCommissionStatusFilter(newStatus)
    setCommissionSearchQuery(newQuery)
    startTransition(async () => {
      const res = await listCommissionsAction(workspaceId, {
        status: newStatus === 'all' ? undefined : (newStatus as any),
      })
      if (res.ok) {
        let filtered = res.data.items
        if (newQuery.trim()) {
          const q = newQuery.trim().toLowerCase()
          filtered = filtered.filter(
            (c) =>
              c.orderId.toLowerCase().includes(q) ||
              c.affiliateId.toLowerCase().includes(q),
          )
        }
        setCommissionsList(filtered)
        setTotalCommissions(res.data.total)
      }
    })
  }

  const handleStatusUpdate = (
    affiliateId: string,
    newStatus: 'approved' | 'suspended' | 'rejected',
  ) => {
    startTransition(async () => {
      const res = await updateAffiliateStatusAction(workspaceId, affiliateId, newStatus)
      if (res.ok) {
        setAffiliatesList((prev) =>
          prev.map((a) => (a.id === affiliateId ? { ...a, status: res.data.status } : a)),
        )
      }
    })
  }

  const handleReleaseVestedCommissions = () => {
    setVestingFeedback(null)
    startTransition(async () => {
      const res = await releaseVestedCommissionsAction(workspaceId)
      if (res.ok) {
        if (res.data.vestedCount > 0) {
          setVestingFeedback({
            message: `Successfully released ${res.data.vestedCount} mature commission(s) totaling ${formatMinor(res.data.vestedAmount)}.`,
            type: 'success',
          })
        } else {
          setVestingFeedback({
            message: 'No commissions have matured past their hold period yet.',
            type: 'success',
          })
        }
        // Refresh commissions list
        const commRes = await listCommissionsAction(workspaceId)
        if (commRes.ok) {
          setCommissionsList(commRes.data.items)
          setTotalCommissions(commRes.data.total)
        }
        setTimeout(() => setVestingFeedback(null), 5000)
      } else {
        setVestingFeedback({
          message: res.error.message,
          type: 'error',
        })
      }
    })
  }

  const handleOpenClawbackModal = (comm: CommissionDTO) => {
    setTargetCommission(comm)
    setClawbackRefundId(`ref-${Date.now().toString(36)}`)
    setClawbackAmount((Number(comm.netAmount) / 100).toFixed(2))
    setClawbackReason('Order refunded by customer')
    setClawbackError(null)
    setClawbackSuccess(null)
    setShowClawbackModal(true)
  }

  const handleApplyClawback = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetCommission) return

    setClawbackError(null)
    setClawbackSuccess(null)

    const minorAmount = Math.round(Number(clawbackAmount) * 100).toString()

    startTransition(async () => {
      const res = await applyClawbackAction(workspaceId, {
        commissionId: targetCommission.id,
        refundId: clawbackRefundId.trim(),
        amount: minorAmount,
        reason: clawbackReason.trim(),
      })

      if (res.ok) {
        setClawbackSuccess('Clawback applied and ledger entry debited successfully!')
        const commRes = await listCommissionsAction(workspaceId)
        if (commRes.ok) {
          setCommissionsList(commRes.data.items)
          setTotalCommissions(commRes.data.total)
        }
        setTimeout(() => {
          setShowClawbackModal(false)
          setClawbackSuccess(null)
        }, 1500)
      } else {
        setClawbackError(res.error.message)
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
    <div className="min-h-screen bg-surface-base pb-24 text-content-primary font-sans transition-colors duration-200">
      {/* Top Header & Breadcrumb */}
      <div className="border-b border-border-subtle bg-surface-raised/90 backdrop-blur-md sticky top-0 z-20 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-content-secondary mb-1">
                <Link
                  href={`/workspaces/${workspaceId}`}
                  className="hover:text-content-primary transition-colors"
                >
                  Workspace Hub
                </Link>
                <span>/</span>
                <span className="text-content-primary font-semibold">Referral Program</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-content-primary">
                  Referral Program
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
                      : 'bg-surface-sunken text-content-secondary ring-1 ring-border-subtle'
                  }`}
                >
                  {isActive ? '● Active' : '○ Not Active'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowLinkModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
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
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold bg-surface-raised text-content-secondary border border-border-subtle shadow-xs hover:bg-surface-sunken hover:text-content-primary transition-all disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1">
              Active Promoters
            </div>
            <div className="text-3xl font-extrabold text-content-primary tracking-tight">
              {summary.activeAffiliatesCount}{' '}
              <span className="text-sm font-normal text-content-tertiary">/ {summary.totalAffiliates}</span>
            </div>
            <div className="text-xs text-content-secondary mt-2">People promoting your products</div>
          </div>

          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1">
              Commission Rate
            </div>
            <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
              {(defaultCommissionBps / 100).toFixed(1)}%
            </div>
            <div className="text-xs text-content-secondary mt-2">Paid to promoters per sale</div>
          </div>

          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1">
              Referred Sales
            </div>
            <div className="text-3xl font-extrabold text-content-primary tracking-tight">
              {summary.totalConversionsCount}
            </div>
            <div className="text-xs text-content-secondary mt-2">Sales from referral links</div>
          </div>

          <div className="bg-surface-raised p-6 rounded-2xl border border-border-subtle shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1">
              Total Earned by Promoters
            </div>
            <div className="text-3xl font-extrabold text-content-primary tracking-tight">
              {formatMinor(summary.totalCommissionAccruedMinor)}
            </div>
            <div className="text-xs text-content-secondary mt-2">Total commission paid out</div>
          </div>
        </div>

        {/* How It Works Explainer — shown when program is new or has no promoters */}
        {(totalAffiliates === 0 || !isActive) && (
          <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-2xl p-6 space-y-3">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <span className="text-lg">🤝</span> How does the Referral Program work?
            </h3>
            <ol className="text-sm text-content-secondary space-y-1.5 list-decimal list-inside">
              <li>You set a commission rate (e.g. 20%)</li>
              <li>Promoters get a unique link to share with their audience</li>
              <li>When someone buys through that link, the promoter automatically earns their commission</li>
              <li>You can track all referral sales and payouts right here</li>
            </ol>
            <p className="text-xs text-content-tertiary">
              <strong>Example:</strong> You sell a ₹999 course with 20% commission. Your promoter earns ₹199.80 for each sale they bring in.
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-border-subtle space-x-8">
          <button
            type="button"
            onClick={() => setActiveTab('affiliates')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'affiliates'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            Your Promoters ({totalAffiliates})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('commissions')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'commissions'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            <span>Earnings & Payouts ({totalCommissions})</span>
            {commissionsList.some((c) => c.status === 'held') && (
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full">
                Pending
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content: Promoters Table */}
        {activeTab === 'affiliates' && (
          <div className="bg-surface-raised rounded-2xl border border-border-subtle shadow-xs overflow-hidden">
            {/* Search & Filter Bar */}
            <div className="p-4 sm:p-6 border-b border-border-subtle flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between bg-surface-sunken/50">
              <div className="relative flex-1 max-w-md">
                <svg
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary"
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
                  className="w-full pl-10 pr-4 py-2 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                {['all', 'approved', 'pending', 'suspended'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleFilterChange(st, searchQuery)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-surface-raised text-content-secondary border border-border-subtle hover:bg-surface-sunken hover:text-content-primary'
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
                  <tr className="border-b border-border-subtle bg-surface-sunken text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                    <th className="py-3 px-6">Promoter</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6">Commission Rate</th>
                    <th className="py-3 px-6 text-right">Conversions</th>
                    <th className="py-3 px-6 text-right">Earnings</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-sm">
                  {affiliatesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-content-secondary">
                        <div className="max-w-sm mx-auto space-y-2">
                          <svg className="w-8 h-8 mx-auto text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <p className="font-semibold text-content-primary">No promoters found</p>
                          <p className="text-xs text-content-secondary">
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
                        <tr key={aff.id} className="hover:bg-surface-sunken/50 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                {initials}
                              </div>
                              <div>
                                <div className="font-semibold text-content-primary">
                                  {aff.name || 'Unnamed Promoter'}
                                </div>
                                <div className="text-xs text-content-tertiary font-mono">{aff.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                aff.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20'
                                  : aff.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20'
                              }`}
                            >
                              {aff.status.charAt(0).toUpperCase() + aff.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            {aff.customCommissionBps ? (
                              <span className="font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md text-xs border border-purple-500/20">
                                {(aff.customCommissionBps / 100).toFixed(1)}% (Custom)
                              </span>
                            ) : (
                              <span className="text-content-secondary text-xs">
                                {(defaultCommissionBps / 100).toFixed(1)}% (Default)
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right font-medium text-content-primary">
                            {aff.totalConversions}
                          </td>
                          <td className="py-4 px-6 text-right font-semibold text-content-primary">
                            {formatMinor(aff.totalEarnings)}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {aff.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'approved')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all cursor-pointer"
                                >
                                  Approve
                                </button>
                              )}
                              {aff.status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'suspended')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-border-control text-content-secondary hover:bg-surface-sunken hover:text-content-primary transition-all cursor-pointer"
                                >
                                  Suspend
                                </button>
                              )}
                              {aff.status === 'suspended' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(aff.id, 'approved')}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-all cursor-pointer"
                                >
                                  Reactivate
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

        {/* Tab Content: Commissions & Holds Table */}
        {activeTab === 'commissions' && (
          <div className="space-y-6">
            {/* Batch Vesting Feedback Banner */}
            {vestingFeedback && (
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between shadow-xs transition-all ${
                  vestingFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${
                      vestingFeedback.type === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {vestingFeedback.type === 'success' ? '✓' : '!'}
                  </div>
                  <div className="text-sm font-semibold">{vestingFeedback.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setVestingFeedback(null)}
                  className="text-content-tertiary hover:text-content-primary text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="bg-surface-raised rounded-2xl border border-border-subtle shadow-xs overflow-hidden">
              {/* Search, Filter, and Batch Vesting Release Bar */}
              <div className="p-4 sm:p-6 border-b border-border-subtle flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between bg-surface-sunken/50">
                <div className="relative flex-1 max-w-md">
                  <svg
                    className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-content-tertiary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by Order ID or Affiliate ID..."
                    value={commissionSearchQuery}
                    onChange={(e) =>
                      handleCommissionFilterChange(commissionStatusFilter, e.target.value)
                    }
                    className="w-full pl-10 pr-4 py-2 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {['all', 'held', 'vested', 'paid', 'clawed_back'].map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          handleCommissionFilterChange(st, commissionSearchQuery)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                          commissionStatusFilter === st
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-surface-raised text-content-secondary border border-border-subtle hover:bg-surface-sunken hover:text-content-primary'
                        }`}
                      >
                        {st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleReleaseVestedCommissions}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white shadow-xs hover:bg-emerald-500 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Release Mature Holds</span>
                  </button>
                </div>
              </div>

              {/* Commission Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-sunken text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
                      <th className="py-3 px-6">Order ID & Date</th>
                      <th className="py-3 px-6">Promoter ID</th>
                      <th className="py-3 px-6 text-right">Sale Amount</th>
                      <th className="py-3 px-6">Rate</th>
                      <th className="py-3 px-6">Status & Maturation</th>
                      <th className="py-3 px-6 text-right">Net Commission</th>
                      <th className="py-3 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-sm">
                    {commissionsList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-16 text-center text-content-secondary">
                          <div className="max-w-sm mx-auto space-y-2">
                            <svg className="w-8 h-8 mx-auto text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="font-semibold text-content-primary">No commission records</p>
                            <p className="text-xs text-content-secondary">
                              Commissions accrue automatically when referred checkout orders are completed.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      commissionsList.map((comm) => {
                        const { days, isMatured } = getDaysRemaining(comm.heldUntil)
                        return (
                          <tr key={comm.id} className="hover:bg-surface-sunken/50 transition-colors">
                            <td className="py-4 px-6">
                              <div className="font-mono text-xs font-semibold text-content-primary">
                                {comm.orderId.slice(0, 16)}...
                              </div>
                              <div className="text-[11px] text-content-tertiary">
                                {new Date(comm.createdAt).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span className="font-mono text-xs text-content-secondary bg-surface-sunken px-2 py-1 rounded-md border border-border-subtle">
                                {comm.affiliateId.slice(0, 12)}...
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right font-medium text-content-primary">
                              {formatMinor(comm.grossSaleAmount, comm.currency)}
                            </td>
                            <td className="py-4 px-6 text-xs text-content-secondary font-medium">
                              {(comm.commissionBps / 100).toFixed(1)}%
                            </td>
                            <td className="py-4 px-6">
                              {comm.status === 'held' && (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>Held</span>
                                  </span>
                                  <div className="text-[11px] text-content-tertiary font-medium">
                                    {isMatured ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                        Matured (Ready to vest)
                                      </span>
                                    ) : (
                                      `Vests in ${days} days`
                                    )}
                                  </div>
                                </div>
                              )}
                              {comm.status === 'vested' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>Vested</span>
                                </span>
                              )}
                              {comm.status === 'paid' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
                                  <span>Paid Out</span>
                                </span>
                              )}
                              {comm.status === 'clawed_back' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
                                  <span>Clawed Back</span>
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right font-bold text-content-primary">
                              {formatMinor(comm.netAmount, comm.currency)}
                            </td>
                            <td className="py-4 px-6 text-right">
                              {comm.status !== 'clawed_back' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenClawbackModal(comm)}
                                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                                >
                                  Clawback
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Settings */}
        {activeTab === 'settings' && (
          <div className="bg-surface-raised rounded-2xl border border-border-subtle shadow-xs p-6 sm:p-8 max-w-3xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-content-primary">Program Rules & Governance</h2>
              <p className="text-xs text-content-secondary mt-1">
                Configure commission economics, cookie attribution windows, and anti-fraud protections.
              </p>
            </div>

            {saveSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Program settings saved successfully!
              </div>
            )}

            {saveError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-sm">
                {saveError}
              </div>
            )}

            <div className="space-y-6">
              {/* Program Enabled Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-sunken border border-border-subtle">
                <div>
                  <div className="font-semibold text-content-primary text-sm">Enable Affiliate Programme</div>
                  <div className="text-xs text-content-secondary">Allow promoters to track referrals and earn commissions</div>
                </div>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-border-control cursor-pointer"
                />
              </div>

              {/* Commission Rate Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-content-primary">
                    Commission Rate
                  </label>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {(defaultCommissionBps / 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="50"
                  value={defaultCommissionBps}
                  onChange={(e) => setDefaultCommissionBps(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <p className="text-xs text-content-secondary">
                  This is the % of each sale that your promoters earn. You can set a different rate for individual promoters later.
                </p>
              </div>

              {/* Cookie Window Duration */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-content-primary">
                  How long should a referral link stay active?
                </label>
                <select
                  value={cookieWindowDays}
                  onChange={(e) => setCookieWindowDays(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (recommended)</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>

              {/* Self-Referral Prevention */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-sunken border border-border-subtle">
                <div>
                  <div className="font-semibold text-content-primary text-sm">Can promoters buy through their own link?</div>
                  <div className="text-xs text-content-secondary">
                    If turned off, promoters won't earn commission on their own purchases.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={allowSelfReferral}
                  onChange={(e) => setAllowSelfReferral(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-border-control cursor-pointer"
                />
              </div>

              {/* Auto-Approve Promoters */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-sunken border border-border-subtle">
                <div>
                  <div className="font-semibold text-content-primary text-sm">Automatically approve new promoters</div>
                  <div className="text-xs text-content-secondary">
                    New promoters can start sharing immediately without waiting for your approval.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoApproveAffiliates}
                  onChange={(e) => setAutoApproveAffiliates(e.target.checked)}
                  className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 border-border-control cursor-pointer"
                />
              </div>

              <div className="pt-4 border-t border-border-subtle flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isPending}
                  className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Referral Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-raised rounded-2xl border border-border-subtle max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-content-primary">Create Referral Link</h3>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            {linkSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm">
                {linkSuccess}
              </div>
            )}

            {linkError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-sm">
                {linkError}
              </div>
            )}

            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Select Promoter
                </label>
                <select
                  value={selectedAffiliateId}
                  onChange={(e) => setSelectedAffiliateId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Custom Referral Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. SUMMER25, YOUTUBE"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="text-[11px] text-content-secondary mt-1">
                  Visitor links will use <code className="bg-surface-sunken px-1 py-0.5 rounded border border-border-subtle">?ref={linkCode || 'code'}</code>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Destination URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={linkDestination}
                  onChange={(e) => setLinkDestination(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-border-control text-content-secondary hover:bg-surface-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-indigo-600 text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Creating...' : 'Create Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clawback Commission Modal */}
      {showClawbackModal && targetCommission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-raised rounded-2xl border border-border-subtle max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Apply Commission Clawback</h3>
                <p className="text-xs text-content-secondary mt-0.5">
                  Reverse affiliate earnings due to a customer refund or dispute.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClawbackModal(false)}
                className="text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            {clawbackSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm">
                {clawbackSuccess}
              </div>
            )}

            {clawbackError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-sm">
                {clawbackError}
              </div>
            )}

            <form onSubmit={handleApplyClawback} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Commission ID
                </label>
                <input
                  type="text"
                  readOnly
                  value={targetCommission.id}
                  className="w-full px-3.5 py-2.5 text-xs font-mono bg-surface-sunken border border-border-subtle rounded-xl text-content-secondary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Refund Reference ID
                </label>
                <input
                  type="text"
                  value={clawbackRefundId}
                  onChange={(e) => setClawbackRefundId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Clawback Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-content-tertiary">
                    {targetCommission.currency === 'USD' ? '$' : '₹'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(Number(targetCommission.netAmount) / 100).toFixed(2)}
                    value={clawbackAmount}
                    onChange={(e) => setClawbackAmount(e.target.value)}
                    required
                    className="w-full pl-8 pr-3.5 py-2.5 text-sm font-medium bg-surface-sunken border border-border-control rounded-xl text-content-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <p className="text-[11px] text-content-secondary mt-1">
                  Maximum clawback: {formatMinor(targetCommission.netAmount, targetCommission.currency)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-content-secondary mb-1.5">
                  Reason for Clawback
                </label>
                <textarea
                  rows={2}
                  value={clawbackReason}
                  onChange={(e) => setClawbackReason(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-sm bg-surface-sunken border border-border-control rounded-xl text-content-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowClawbackModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-border-control text-content-secondary hover:bg-surface-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-rose-600 text-white shadow-xs hover:bg-rose-500 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? 'Processing...' : 'Apply Clawback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
