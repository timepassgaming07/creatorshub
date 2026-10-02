/**
 * Payouts & Disbursements Dashboard View (Slice 11 §11.1, §11.4, §11.7).
 *
 * Ultra-modern creator light-theme aesthetic:
 * 1. Warm white surfaces, glassmorphic gradient cards, subtle micro-animations.
 * 2. Real-time balance cards (Available, In-Transit, Lifetime Settled, Pending Review).
 * 3. Disbursement Destination Widget (Verified Bank Account & UPI VPA management).
 * 4. Two-Person Maker-Checker Governance review drawer and actions.
 * 5. Request Payout modal with preset amount chips, safety cooldown notices, and live bounds validation.
 * 6. Historical payout audit log table with status badges and CSV export.
 */
'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import type {
  BeneficiaryAccountDTO,
  PayoutBalanceOverviewDTO,
  PayoutDTO,
  PayoutStatus,
} from '@creatorhub/contracts'

import {
  approvePayoutAction,
  createBeneficiaryAccountAction,
  deleteBeneficiaryAccountAction,
  exportPayoutsCsvAction,
  listBeneficiaryAccountsAction,
  listPayoutsAction,
  rejectPayoutAction,
  requestPayoutAction,
  setDefaultBeneficiaryAccountAction,
} from '../../lib/payout-actions'

export type PayoutsDashboardViewProps = {
  readonly workspaceId: string
  readonly initialBalance: PayoutBalanceOverviewDTO
  readonly initialBeneficiaries: readonly BeneficiaryAccountDTO[]
  readonly initialPayouts: readonly PayoutDTO[]
  readonly currentUserId: string
  readonly userRole: string
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

function formatDate(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString))
  } catch {
    return isoString
  }
}

export function PayoutsDashboardView({
  workspaceId,
  initialBalance,
  initialBeneficiaries,
  initialPayouts,
  currentUserId,
  userRole,
}: PayoutsDashboardViewProps) {
  const [balance, setBalance] = useState<PayoutBalanceOverviewDTO>(initialBalance)
  const [beneficiaries, setBeneficiaries] = useState<readonly BeneficiaryAccountDTO[]>(initialBeneficiaries)
  const [payouts, setPayouts] = useState<readonly PayoutDTO[]>(initialPayouts)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const [isBeneficiaryModalOpen, setIsBeneficiaryModalOpen] = useState(false)
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false)
  const [reviewingPayout, setReviewingPayout] = useState<PayoutDTO | null>(null)

  // Request Payout Form
  const [requestAmountMajor, setRequestAmountMajor] = useState('')
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState(
    initialBeneficiaries.find((b) => b.isDefault)?.id ?? initialBeneficiaries[0]?.id ?? '',
  )
  const [requestNotes, setRequestNotes] = useState('')

  // Add Beneficiary Form
  const [accountType, setAccountType] = useState<'bank_account' | 'vpa'>('bank_account')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('')
  const [ifscCode, setIfscCode] = useState('')
  const [vpa, setVpa] = useState('')
  const [isDefaultAccount, setIsDefaultAccount] = useState(true)

  // Approval / Rejection remarks
  const [reviewRemarks, setReviewRemarks] = useState('')

  // Feedback State
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const defaultAccount = beneficiaries.find((b) => b.isDefault) ?? beneficiaries[0]
  const availableMinor = BigInt(balance.availableBalanceMinor)
  const minimumPayoutMinor = BigInt(balance.minimumPayoutMinor)
  const canRequest = availableMinor >= minimumPayoutMinor && beneficiaries.length > 0

  const pendingPayouts = payouts.filter((p) => p.status === 'requested')

  const filteredPayouts = payouts.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.id.toLowerCase().includes(q) ||
      p.amountMinor.includes(q) ||
      (p.beneficiary?.accountHolderName?.toLowerCase().includes(q) ?? false) ||
      (p.beneficiary?.maskedAccountNumber?.toLowerCase().includes(q) ?? false) ||
      (p.beneficiary?.vpa?.toLowerCase().includes(q) ?? false)
    )
  })

  const refreshData = () => {
    startTransition(async () => {
      const [accRes, payRes] = await Promise.all([
        listBeneficiaryAccountsAction(workspaceId),
        listPayoutsAction(workspaceId),
      ])
      if (accRes.ok) setBeneficiaries(accRes.data)
      if (payRes.ok) setPayouts(payRes.data)
    })
  }

  // --- Actions ---

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const amountRupees = parseFloat(requestAmountMajor)
    if (isNaN(amountRupees) || amountRupees < 500) {
      setErrorMessage('Minimum payout amount is ₹500.00')
      return
    }

    const amountMinor = BigInt(Math.round(amountRupees * 100))
    if (amountMinor > availableMinor) {
      setErrorMessage('Amount exceeds your currently available balance.')
      return
    }

    if (!selectedBeneficiaryId) {
      setErrorMessage('Please select a destination bank account or UPI ID.')
      return
    }

    startTransition(async () => {
      const res = await requestPayoutAction(workspaceId, {
        beneficiaryAccountId: selectedBeneficiaryId,
        amountMinor: amountMinor.toString(),
        currency: 'INR',
        notes: requestNotes || undefined,
      })

      if (!res.ok) {
        setErrorMessage(res.error.message)
      } else {
        setSuccessMessage(`Payout of ₹${amountRupees.toFixed(2)} requested successfully.`)
        setIsRequestModalOpen(false)
        setRequestAmountMajor('')
        setRequestNotes('')
        refreshData()
      }
    })
  }

  const handleAddBeneficiary = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!accountHolderName.trim()) {
      setErrorMessage('Please enter the account holder or business name.')
      return
    }

    if (accountType === 'bank_account') {
      if (!accountNumber.trim()) {
        setErrorMessage('Please enter your bank account number.')
        return
      }
      if (accountNumber !== confirmAccountNumber) {
        setErrorMessage('Bank account numbers do not match.')
        return
      }
      if (!ifscCode || ifscCode.length !== 11) {
        setErrorMessage('IFSC code must be exactly 11 alphanumeric characters.')
        return
      }
    } else {
      if (!vpa || !vpa.includes('@')) {
        setErrorMessage('Please enter a valid UPI ID (e.g., yourname@okhdfcbank).')
        return
      }
    }

    startTransition(async () => {
      const res = await createBeneficiaryAccountAction(workspaceId, {
        payeeType: 'workspace',
        payeeId: workspaceId,
        accountHolderName,
        accountType,
        accountNumber: accountType === 'bank_account' ? accountNumber : undefined,
        ifscCode: accountType === 'bank_account' ? ifscCode.toUpperCase() : undefined,
        vpa: accountType === 'vpa' ? vpa.toLowerCase() : undefined,
        isDefault: isDefaultAccount,
      })

      if (!res.ok) {
        setErrorMessage(res.error.message)
      } else {
        setSuccessMessage('Beneficiary account added and verified.')
        setIsAddAccountOpen(false)
        setAccountHolderName('')
        setAccountNumber('')
        setConfirmAccountNumber('')
        setIfscCode('')
        setVpa('')
        refreshData()
      }
    })
  }

  const handleSetDefault = (accountId: string) => {
    startTransition(async () => {
      const res = await setDefaultBeneficiaryAccountAction(workspaceId, accountId)
      if (res.ok) {
        setSuccessMessage('Default disbursement account updated.')
        refreshData()
      }
    })
  }

  const handleDeleteAccount = (accountId: string) => {
    if (!confirm('Are you sure you want to remove this beneficiary account?')) return
    startTransition(async () => {
      const res = await deleteBeneficiaryAccountAction(workspaceId, accountId)
      if (res.ok) {
        setSuccessMessage('Beneficiary account removed.')
        refreshData()
      }
    })
  }

  const handleApprove = (payoutId: string) => {
    setErrorMessage(null)
    startTransition(async () => {
      const res = await approvePayoutAction(workspaceId, {
        payoutId,
        notes: reviewRemarks || undefined,
      })

      if (!res.ok) {
        setErrorMessage(res.error.message)
      } else {
        setSuccessMessage('Payout approved and queued for bank settlement.')
        setReviewingPayout(null)
        setReviewRemarks('')
        refreshData()
      }
    })
  }

  const handleReject = (payoutId: string) => {
    if (!reviewRemarks.trim()) {
      setErrorMessage('Please provide a reason for rejecting this payout request.')
      return
    }

    setErrorMessage(null)
    startTransition(async () => {
      const res = await rejectPayoutAction(workspaceId, {
        payoutId,
        reason: reviewRemarks,
      })

      if (!res.ok) {
        setErrorMessage(res.error.message)
      } else {
        setSuccessMessage('Payout request rejected.')
        setReviewingPayout(null)
        setReviewRemarks('')
        refreshData()
      }
    })
  }

  const handleExportCsv = () => {
    startTransition(async () => {
      const res = await exportPayoutsCsvAction(workspaceId)
      if (res.ok) {
        const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `payouts-${workspaceId}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    })
  }

  const setPercentageAmount = (pct: number) => {
    const minorVal = (availableMinor * BigInt(pct)) / 100n
    const rupees = Number(minorVal) / 100
    setRequestAmountMajor(rupees.toFixed(2))
  }

  return (
    <div className="min-h-screen bg-surface-base pb-24 text-content-primary transition-colors duration-200">
      {/* Toast Notifications */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-700 dark:text-emerald-300 shadow-xl shadow-emerald-500/10 animate-in fade-in slide-in-from-top-3">
          <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-emerald-600 dark:text-emerald-400 hover:opacity-80 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm font-medium text-rose-700 dark:text-rose-300 shadow-xl shadow-rose-500/10 animate-in fade-in slide-in-from-top-3">
          <svg className="h-5 w-5 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMessage}
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-rose-600 dark:text-rose-400 hover:opacity-80 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-content-secondary">
          <Link href={`/workspaces/${workspaceId}`} className="hover:text-content-primary transition-colors">
            Workspace
          </Link>
          <span>/</span>
          <span className="font-semibold text-content-primary">Bank Payouts & Earnings</span>
        </div>

        {/* Hero Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-content-primary sm:text-4xl">
              Bank Payouts & Earnings
            </h1>
            <p className="mt-1 text-sm text-content-secondary">
              Direct bank settlements, automated daily payouts, and detailed transaction records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportCsv}
              disabled={isPending || payouts.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-4 py-2.5 text-sm font-semibold text-content-secondary shadow-xs hover:bg-surface-sunken hover:text-content-primary disabled:opacity-50 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>

            <button
              onClick={() => setIsBeneficiaryModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-4 py-2.5 text-sm font-semibold text-content-secondary shadow-xs hover:bg-surface-sunken hover:text-content-primary transition-all cursor-pointer"
            >
              <svg className="h-4 w-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Bank & UPI ({beneficiaries.length})
            </button>

            <button
              onClick={() => {
                if (beneficiaries.length === 0) {
                  setIsAddAccountOpen(true)
                } else {
                  setIsRequestModalOpen(true)
                }
              }}
              disabled={!canRequest && beneficiaries.length > 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Request Payout
            </button>
          </div>
        </div>

        {/* Pending Payouts Review Banner */}
        {pendingPayouts.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 shadow-xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-content-primary">
                    {pendingPayouts.length} Payout Request{pendingPayouts.length > 1 ? 's' : ''} Awaiting Review
                  </h3>
                  <p className="mt-0.5 text-xs text-content-secondary">
                    Review and sign off on disbursement requests before transfer to bank account.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReviewingPayout(pendingPayouts[0]!)}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-500 transition-colors cursor-pointer"
              >
                Review Payout #{pendingPayouts[0]!.id.slice(0, 8)}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Hero Financial Metric Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {/* Card 1: Available Balance */}
          <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="flex items-center justify-between text-content-secondary">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Available For Payout</span>
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Instant UPI / Bank
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-content-primary">
                {formatMinor(balance.availableBalanceMinor)}
              </span>
            </div>
            <p className="mt-2 text-xs text-content-secondary">
              Min threshold: ₹500.00 &bull; Ready to withdraw
            </p>
          </div>

          {/* Card 2: In-Transit / Processing */}
          <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-blue-500/10 blur-2xl" />
            <div className="flex items-center justify-between text-content-secondary">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">In-Transit / Processing</span>
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Clearing
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-content-primary">
                {formatMinor(balance.inTransitBalanceMinor)}
              </span>
            </div>
            <p className="mt-2 text-xs text-content-secondary">
              Dispatched to banking network
            </p>
          </div>

          {/* Card 3: Pending Approval */}
          <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-amber-500/10 blur-2xl" />
            <div className="flex items-center justify-between text-content-secondary">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending Review</span>
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                In Review
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-content-primary">
                {formatMinor(balance.pendingApprovalMinor)}
              </span>
            </div>
            <p className="mt-2 text-xs text-content-secondary">
              Awaiting sign-off
            </p>
          </div>

          {/* Card 4: Lifetime Settled */}
          <div className="relative overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs hover:shadow-md transition-shadow">
            <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-purple-500/10 blur-2xl" />
            <div className="flex items-center justify-between text-content-secondary">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Lifetime Settled</span>
              <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Disbursed
              </span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-content-primary">
                {formatMinor(balance.lifetimeSettledMinor)}
              </span>
            </div>
            <p className="mt-2 text-xs text-content-secondary">
              Total lifetime funds received
            </p>
          </div>
        </div>

        {/* Disbursement Destination & Fast Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Default Beneficiary Card */}
          <div className="lg:col-span-2 rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-content-primary">Primary Disbursement Destination</h3>
                <p className="text-xs text-content-secondary">All requested withdrawals will be routed to this verified account.</p>
              </div>
              <button
                onClick={() => setIsBeneficiaryModalOpen(true)}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Change Destination &rarr;
              </button>
            </div>

            {defaultAccount ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-sunken p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-raised text-content-primary font-bold text-lg border border-border-subtle">
                    {defaultAccount.accountType === 'vpa' ? 'UPI' : '₹'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-content-primary">
                        {defaultAccount.accountHolderName}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Verified
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-content-secondary">
                      {defaultAccount.accountType === 'vpa' ? (
                        <span className="font-mono">{defaultAccount.vpa}</span>
                      ) : (
                        <>
                          <span className="font-mono">{defaultAccount.maskedAccountNumber}</span>
                          <span>&bull;</span>
                          <span className="font-mono uppercase">{defaultAccount.ifscCode}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="rounded-xl bg-surface-raised border border-border-subtle px-3 py-1.5 text-xs font-semibold text-content-secondary">
                    Default Account
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-control p-8 text-center bg-surface-sunken/40">
                <p className="text-sm font-medium text-content-primary">No bank account or UPI ID configured yet.</p>
                <p className="mt-1 text-xs text-content-secondary">Add your bank account details to unlock payouts.</p>
                <button
                  onClick={() => setIsAddAccountOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  + Add Bank Account / UPI
                </button>
              </div>
            )}
          </div>

          {/* Quick Settlement Policy */}
          <div className="rounded-3xl border border-border-subtle bg-surface-raised p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  ✓
                </span>
                <h3 className="text-sm font-bold text-content-primary">Settlement & Payout Timeline</h3>
              </div>
              <ul className="mt-4 space-y-2 text-xs text-content-secondary">
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">&bull;</span>
                  <span><strong className="text-content-primary">IMPS / UPI:</strong> Instant clearing to bank.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">&bull;</span>
                  <span><strong className="text-content-primary">NEFT / RTGS:</strong> 2 to 4 business hours.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-emerald-500">&bull;</span>
                  <span><strong className="text-content-primary">Automated Tracking:</strong> Real-time ledger status.</span>
                </li>
              </ul>
            </div>

            <div className="mt-6 rounded-2xl bg-surface-sunken p-3 border border-border-subtle text-[11px] text-content-secondary">
              Fully compliant with Indian banking standards (RBI/NPCI).
            </div>
          </div>
        </div>

        {/* Payout History & Audit Log */}
        <div className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised shadow-xs">
          {/* Table Header & Search Filter Bar */}
          <div className="flex flex-col gap-4 border-b border-border-subtle p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-content-primary">Payout History & Timeline</h2>
              <p className="text-xs text-content-secondary">Complete record of all requested and disbursed transactions.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter Tabs */}
              <div className="flex rounded-xl bg-surface-sunken p-1 border border-border-subtle">
                {['all', 'requested', 'processing', 'paid', 'failed'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-surface-raised text-content-primary shadow-xs'
                        : 'text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search payouts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-border-control bg-surface-sunken px-3.5 py-1.5 text-xs text-content-primary placeholder-content-tertiary focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border-subtle bg-surface-sunken text-content-secondary uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-6 py-3.5">Payout ID</th>
                  <th className="px-6 py-3.5">Date Requested</th>
                  <th className="px-6 py-3.5">Destination</th>
                  <th className="px-6 py-3.5">Amount</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Audit</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-medium text-content-secondary">
                {filteredPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-content-tertiary">
                      No payouts match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPayouts.map((payout) => {
                    const isPendingApproval = payout.status === 'requested'
                    const isProcessing = payout.status === 'approved' || payout.status === 'processing'
                    const isPaid = payout.status === 'paid'
                    const isFailed = payout.status === 'failed'

                    return (
                      <tr key={payout.id} className="hover:bg-surface-sunken/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-content-primary font-bold">
                          #{payout.id.slice(0, 8)}
                        </td>
                        <td className="px-6 py-4 text-content-secondary">
                          {formatDate(payout.requestedAt)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-content-primary">
                              {payout.beneficiary?.accountHolderName ?? 'Beneficiary Account'}
                            </span>
                            <span className="text-content-tertiary">&bull;</span>
                            <span className="font-mono text-content-secondary">
                              {payout.beneficiary?.accountType === 'vpa'
                                ? payout.beneficiary.vpa
                                : payout.beneficiary?.maskedAccountNumber}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-extrabold text-content-primary">
                          {formatMinor(payout.amountMinor, payout.currency)}
                        </td>
                        <td className="px-6 py-4">
                          {isPendingApproval && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Requested
                            </span>
                          )}
                          {isProcessing && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              Processing
                            </span>
                          )}
                          {isPaid && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Paid
                            </span>
                          )}
                          {isFailed && (
                            <span
                              title={payout.failureReason ?? 'Disbursement rejected'}
                              className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 border border-rose-500/20 cursor-help"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-content-secondary">
                          {payout.approvedBy ? (
                            <span>Approved by #{payout.approvedBy.slice(0, 6)}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">In Review</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isPendingApproval && (
                            <button
                              onClick={() => setReviewingPayout(payout)}
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
                            >
                              Review
                            </button>
                          )}
                          {isPaid && (
                            <span className="text-xs text-content-tertiary font-mono">
                              Settled {payout.completedAt ? formatDate(payout.completedAt) : ''}
                            </span>
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

      {/* --- MODAL 1: Request Payout Modal --- */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-surface-raised p-6 shadow-2xl border border-border-subtle">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Request Payout</h3>
                <p className="text-xs text-content-secondary">Disburse available creator earnings directly to your bank account or UPI.</p>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="rounded-xl p-1 text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRequestPayout} className="mt-6 space-y-5">
              {/* Amount Input with Fast Percentage Chips */}
              <div>
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-content-primary">Withdrawal Amount (INR)</label>
                  <span className="text-content-secondary font-medium">
                    Available: <strong className="text-emerald-600 dark:text-emerald-400">{formatMinor(balance.availableBalanceMinor)}</strong>
                  </span>
                </div>

                <div className="relative mt-2">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-base font-bold text-content-tertiary">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="500"
                    placeholder="500.00"
                    required
                    value={requestAmountMajor}
                    onChange={(e) => setRequestAmountMajor(e.target.value)}
                    className="w-full rounded-2xl border border-border-control bg-surface-sunken py-3 pl-8 pr-4 text-base font-extrabold text-content-primary focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Percentage Chips */}
                <div className="mt-2.5 flex items-center gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPercentageAmount(pct)}
                      className="rounded-xl border border-border-control bg-surface-sunken px-3 py-1 text-xs font-bold text-content-secondary hover:bg-surface-raised hover:text-content-primary transition-colors cursor-pointer"
                    >
                      {pct === 100 ? 'Max (100%)' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Beneficiary Selector */}
              <div>
                <label className="block text-xs font-bold text-content-primary">Destination Account</label>
                <select
                  value={selectedBeneficiaryId}
                  onChange={(e) => setSelectedBeneficiaryId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-3 text-xs font-semibold text-content-primary focus:border-indigo-500 focus:outline-none"
                >
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.accountHolderName} &bull; {b.accountType === 'vpa' ? b.vpa : `${b.maskedAccountNumber} (${b.ifscCode})`} {b.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-content-primary">Memo / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Creator sales payout"
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-content-secondary hover:bg-surface-sunken transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/25 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isPending ? 'Submitting...' : 'Confirm Withdrawal Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: Beneficiary Accounts List & Manager --- */}
      {isBeneficiaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-surface-raised p-6 shadow-2xl border border-border-subtle">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Manage Disbursement Accounts</h3>
                <p className="text-xs text-content-secondary">Bank accounts and UPI IDs verified for payout disbursements.</p>
              </div>
              <button
                onClick={() => setIsBeneficiaryModalOpen(false)}
                className="rounded-xl p-1 text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="mt-6 space-y-3 max-h-80 overflow-y-auto pr-1">
              {beneficiaries.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-2xl border p-4 transition-all ${
                    b.isDefault
                      ? 'border-emerald-500/40 bg-emerald-500/10 shadow-xs'
                      : 'border-border-subtle bg-surface-sunken hover:border-border-control'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-raised border border-border-subtle text-content-primary font-bold text-xs">
                      {b.accountType === 'vpa' ? 'UPI' : 'Bank'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-content-primary text-xs">{b.accountHolderName}</span>
                        {b.isDefault && (
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-bold text-white">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-content-secondary font-mono mt-0.5">
                        {b.accountType === 'vpa' ? b.vpa : `${b.maskedAccountNumber} &bull; ${b.ifscCode}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!b.isDefault && (
                      <button
                        onClick={() => handleSetDefault(b.id)}
                        className="rounded-lg border border-border-control bg-surface-raised px-2.5 py-1 text-[11px] font-semibold text-content-secondary hover:bg-surface-sunken cursor-pointer"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteAccount(b.id)}
                      className="rounded-lg p-1 text-content-tertiary hover:text-rose-500 transition-colors cursor-pointer"
                      title="Remove Account"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border-subtle pt-4">
              <button
                onClick={() => {
                  setIsBeneficiaryModalOpen(false)
                  setIsAddAccountOpen(true)
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-colors cursor-pointer"
              >
                + Add New Bank Account / UPI
              </button>

              <button
                onClick={() => setIsBeneficiaryModalOpen(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-content-secondary hover:bg-surface-sunken cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: Add Beneficiary Account Modal --- */}
      {isAddAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-surface-raised p-6 shadow-2xl border border-border-subtle">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Add Disbursement Account</h3>
                <p className="text-xs text-content-secondary">Configure an Indian Bank Account (IMPS/NEFT) or UPI ID.</p>
              </div>
              <button
                onClick={() => setIsAddAccountOpen(false)}
                className="rounded-xl p-1 text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Account Type Tabs */}
            <div className="mt-6 flex rounded-2xl bg-surface-sunken p-1 border border-border-subtle">
              <button
                type="button"
                onClick={() => setAccountType('bank_account')}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                  accountType === 'bank_account'
                    ? 'bg-surface-raised text-content-primary shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Bank Account (IMPS / NEFT)
              </button>
              <button
                type="button"
                onClick={() => setAccountType('vpa')}
                className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
                  accountType === 'vpa'
                    ? 'bg-surface-raised text-content-primary shadow-xs'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                UPI ID (VPA)
              </button>
            </div>

            <form onSubmit={handleAddBeneficiary} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-content-primary">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Studio Private Limited"
                  required
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {accountType === 'bank_account' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-content-primary">Account Number</label>
                    <input
                      type="password"
                      placeholder="Enter bank account number"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-content-primary">Confirm Account Number</label>
                    <input
                      type="text"
                      placeholder="Re-enter bank account number"
                      required
                      value={confirmAccountNumber}
                      onChange={(e) => setConfirmAccountNumber(e.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-content-primary">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0000060"
                      maxLength={11}
                      required
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                      className="mt-1.5 w-full uppercase rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs font-mono text-content-primary focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-content-primary">UPI ID / VPA</label>
                  <input
                    type="text"
                    placeholder="e.g. yourname@okhdfcbank"
                    required
                    value={vpa}
                    onChange={(e) => setVpa(e.target.value.toLowerCase())}
                    className="mt-1.5 w-full lowercase rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs font-mono text-content-primary focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isDefaultAccount"
                  checked={isDefaultAccount}
                  onChange={(e) => setIsDefaultAccount(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isDefaultAccount" className="text-xs font-medium text-content-secondary cursor-pointer">
                  Set as default account for future payouts
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddAccountOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-content-secondary hover:bg-surface-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isPending ? 'Saving...' : 'Verify & Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 4: Review Drawer --- */}
      {reviewingPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-surface-raised p-6 shadow-2xl border border-border-subtle">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Payout Review
                </span>
                <h3 className="mt-1 text-lg font-bold text-content-primary">
                  Review Payout #{reviewingPayout.id.slice(0, 8)}
                </h3>
              </div>
              <button
                onClick={() => setReviewingPayout(null)}
                className="rounded-xl p-1 text-content-tertiary hover:text-content-primary cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 rounded-2xl bg-surface-sunken p-4 border border-border-subtle">
                <div>
                  <span className="text-content-secondary font-medium">Requested Amount</span>
                  <p className="mt-0.5 text-base font-extrabold text-content-primary">
                    {formatMinor(reviewingPayout.amountMinor, reviewingPayout.currency)}
                  </p>
                </div>
                <div>
                  <span className="text-content-secondary font-medium">Requested By</span>
                  <p className="mt-0.5 font-mono text-content-secondary font-bold">
                    #{reviewingPayout.requestedBy.slice(0, 8)}
                  </p>
                </div>
                <div>
                  <span className="text-content-secondary font-medium">Destination</span>
                  <p className="mt-0.5 font-semibold text-content-primary">
                    {reviewingPayout.beneficiary?.accountHolderName ?? 'Beneficiary'}
                  </p>
                  <p className="font-mono text-content-secondary">
                    {reviewingPayout.beneficiary?.accountType === 'vpa'
                      ? reviewingPayout.beneficiary.vpa
                      : `${reviewingPayout.beneficiary?.maskedAccountNumber} (${reviewingPayout.beneficiary?.ifscCode})`}
                  </p>
                </div>
                <div>
                  <span className="text-content-secondary font-medium">Requested At</span>
                  <p className="mt-0.5 text-content-secondary">
                    {formatDate(reviewingPayout.requestedAt)}
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-bold text-content-primary">Review Remarks / Approval Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Verified monthly earnings"
                  value={reviewRemarks}
                  onChange={(e) => setReviewRemarks(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-border-control bg-surface-sunken px-4 py-2.5 text-xs text-content-primary focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => handleReject(reviewingPayout.id)}
                  disabled={isPending}
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                >
                  Reject Request
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(reviewingPayout.id)}
                  disabled={isPending}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-500/25 hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer"
                >
                  {isPending ? 'Processing...' : 'Approve & Release Funds'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
