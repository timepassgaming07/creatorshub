'use client'

/**
 * Checkout payment failure & retry component (Slice 5 §5.11).
 *
 * Provides a clear, non-intimidating explanation for why payment failed,
 * with immediate 1-click retry actions preserving customer inputs.
 */
type CheckoutFailureViewProps = {
  readonly errorMessage: string
  readonly onRetry: () => void
  readonly onBackToCheckout: () => void
}

export function CheckoutFailureView({
  errorMessage,
  onRetry,
  onBackToCheckout,
}: CheckoutFailureViewProps) {
  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-lg shadow-rose-50/50">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="mt-5 text-xl font-bold text-slate-900">Payment Could Not Be Completed</h3>
      <p className="mt-2 text-sm text-slate-600">
        {errorMessage ||
          'Your payment was declined or could not be processed by your bank/UPI provider.'}
      </p>

      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-left text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Common reasons and fixes:</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-500">
          <li>UPI PIN timed out or was entered incorrectly in GPay/PhonePe.</li>
          <li>Daily bank transaction limit exceeded.</li>
          <li>Card international/online transaction switch was disabled.</li>
        </ul>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-98"
        >
          Try Again Now
        </button>
        <button
          type="button"
          onClick={onBackToCheckout}
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Change Payment Method
        </button>
      </div>
    </div>
  )
}
