'use client'

/**
 * Checkout pending payment polling component (Slice 5 §5.11).
 *
 * Used during asynchronous payment flows (such as UPI collect requests)
 * where the customer needs to approve the transaction in their UPI app.
 */
import { useEffect, useState, useTransition } from 'react'
import {
  simulateCheckoutPaymentSuccessAction,
  verifyAndFulfillCheckoutSessionAction,
} from '@/lib/checkout-actions'

type CheckoutPendingPollProps = {
  readonly checkoutSessionId: string
  readonly orderId: string
  readonly workspaceId: string
  readonly totalAmountFormatted: string
  readonly onConfirmed: () => void
  readonly onFailed: (reason: string) => void
  readonly onCancel: () => void
}

export function CheckoutPendingPoll({
  checkoutSessionId,
  orderId,
  workspaceId,
  totalAmountFormatted,
  onConfirmed,
  onFailed,
  onCancel,
}: CheckoutPendingPollProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(300) // 5 minutes
  const [pollCount, setPollCount] = useState(0)
  const [isSimulating, startSimulating] = useTransition()

  // Countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) {
      onFailed('Payment timed out. Please try again.')
      return
    }

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => prev - 1)
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [secondsRemaining, onFailed])

  // Polling verification loop
  useEffect(() => {
    let isSubscribed = true

    const checkStatus = async () => {
      try {
        const res = await verifyAndFulfillCheckoutSessionAction(checkoutSessionId, workspaceId)
        if (!isSubscribed) return

        if (res.ok) {
          if (res.data.status === 'paid' || res.data.paymentStatus === 'captured') {
            onConfirmed()
            return
          }
          if (res.data.status === 'cancelled' || res.data.paymentStatus === 'failed') {
            onFailed('Payment was declined or cancelled.')
            return
          }
        }
      } catch {
        // Continue polling on transient errors
      }

      if (isSubscribed) {
        setPollCount((c) => c + 1)
      }
    }

    const interval = setInterval(() => {
      void checkStatus()
    }, 3000)

    return () => {
      isSubscribed = false
      clearInterval(interval)
    }
  }, [checkoutSessionId, workspaceId, pollCount, onConfirmed, onFailed])

  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60
  const timeFormatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

  const handleSimulatePayment = () => {
    startSimulating(async () => {
      const res = await simulateCheckoutPaymentSuccessAction(checkoutSessionId, workspaceId)
      if (res.ok) {
        onConfirmed()
      } else {
        onFailed(res.error.message)
      }
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg shadow-slate-100">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>

      <h3 className="mt-5 text-xl font-bold text-slate-900">Approve Payment in Your UPI App</h3>
      <p className="mt-2 text-sm text-slate-600">
        Please open your UPI app (Google Pay, PhonePe, Paytm, or BHIM) to approve the request of{' '}
        <span className="font-semibold text-slate-900">{totalAmountFormatted}</span>.
      </p>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700">
        <svg
          className="h-4 w-4 text-amber-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Time remaining: {timeFormatted}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={handleSimulatePayment}
          disabled={isSimulating}
          className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer"
        >
          {isSimulating ? 'Confirming Payment...' : '⚡ Simulate Instant Payment (Test Mode)'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={isSimulating}
          className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          Cancel or Choose Other Method
        </button>
      </div>

      <p className="mt-6 text-xs text-slate-400">Order reference: {orderId.slice(0, 18)}...</p>
    </div>
  )
}
