'use client'

/**
 * Modern Creator Checkout Form Component (Slice 5 §5.11).
 *
 * Designed with a stunning, high-converting light aesthetic inspired by
 * Stan.store, Lemon Squeezy, and Linear.
 *
 * Features:
 * - Dynamic Indian GST Tax calculation (CGST/SGST vs IGST) with state picker.
 * - Live coupon code evaluation with instant discount feedback.
 * - B2B GSTIN input for business purchases.
 * - 1-click UPI and Card payment initialization.
 * - Graceful failure & retry recovery paths.
 */
import { useEffect, useState, useTransition } from 'react'
import type { CurrencyCode } from '@creatorhub/contracts'
import { money } from '@creatorhub/contracts'
import { MoneyDisplay } from '@creatorhub/ui'
import {
  calculateCheckoutEstimateAction,
  createCheckoutSessionAction,
  getPublicOrderSummaryAction,
  type PublicCheckoutProductData,
  type PublicOrderSummary,
} from '@/lib/checkout-actions'
import { CheckoutPendingPoll } from './CheckoutPendingPoll'
import { CheckoutFailureView } from './CheckoutFailureView'
import { CheckoutSuccessView } from './CheckoutSuccessView'

const INDIAN_STATES = [
  'Delhi',
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'Telangana',
  'Uttar Pradesh',
  'Gujarat',
  'West Bengal',
  'Rajasthan',
  'Kerala',
  'Haryana',
  'Punjab',
  'Madhya Pradesh',
  'Bihar',
  'Odisha',
  'Andhra Pradesh',
  'Assam',
  'Jharkhand',
  'Chhattisgarh',
  'Uttarakhand',
  'Goa',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Chandigarh',
  'Puducherry',
  'Other',
] as const

type CheckoutFormProps = {
  readonly checkoutData: PublicCheckoutProductData
  readonly initialDiscountCode?: string
}

export function CheckoutForm({ checkoutData, initialDiscountCode = '' }: CheckoutFormProps) {
  const [isPending, startTransition] = useTransition()

  const { product, storefront, workspace } = checkoutData
  const accentColor = storefront.themeConfig.accentColor || '#6366F1'

  // Customer Form State
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [customerState, setCustomerState] = useState('Delhi')
  const [isB2B, setIsB2B] = useState(false)
  const [gstin, setGstin] = useState('')

  // Discount Code State
  const [discountCodeInput, setDiscountCodeInput] = useState(initialDiscountCode)
  const [appliedDiscountCode, setAppliedDiscountCode] = useState(initialDiscountCode)
  const [discountError, setDiscountError] = useState<string | null>(null)

  // Pricing State
  const [subtotalAmount, setSubtotalAmount] = useState(product.basePrice)
  const [discountAmount, setDiscountAmount] = useState('0')
  const [taxAmount, setTaxAmount] = useState('0')
  const [totalAmount, setTotalAmount] = useState(product.basePrice)
  const [taxBreakdown, setTaxBreakdown] = useState<
    readonly { readonly name: string; readonly amount: string }[]
  >([])
  const [discountSavingsText, setDiscountSavingsText] = useState<string | null>(null)

  // Checkout Flow Lifecycle States
  const [checkoutStep, setCheckoutStep] = useState<
    'form' | 'processing' | 'pending_upi' | 'failed' | 'success'
  >('form')
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirmedOrderSummary, setConfirmedOrderSummary] = useState<PublicOrderSummary | null>(
    null,
  )

  // Recalculate price estimation whenever parameters change
  useEffect(() => {
    let active = true

    async function updateEstimate() {
      const res = await calculateCheckoutEstimateAction({
        workspaceId: workspace.id,
        productId: product.id,
        quantity: 1,
        discountCode: appliedDiscountCode ? appliedDiscountCode : null,
        customerCountry: 'IN',
        customerState,
        customerGstin: isB2B && gstin.trim().length > 0 ? gstin.trim() : null,
      })

      if (!active) return

      if (res.ok) {
        setSubtotalAmount(res.data.subtotalAmount)
        setDiscountAmount(res.data.discountAmount)
        setTaxAmount(res.data.taxAmount)
        setTotalAmount(res.data.totalAmount)
        setTaxBreakdown(res.data.taxBreakdown)
        setDiscountSavingsText(res.data.discountSavingsText)
      }
    }

    void updateEstimate()
    return () => {
      active = false
    }
  }, [workspace.id, product.id, appliedDiscountCode, customerState, isB2B, gstin])

  // Handle discount code submission
  const handleApplyDiscount = () => {
    setDiscountError(null)
    const code = discountCodeInput.trim().toUpperCase()
    if (!code) {
      setAppliedDiscountCode('')
      return
    }

    startTransition(async () => {
      const res = await calculateCheckoutEstimateAction({
        workspaceId: workspace.id,
        productId: product.id,
        quantity: 1,
        discountCode: code,
        customerCountry: 'IN',
        customerState,
      })

      if (res.ok && res.data.discountCode) {
        setAppliedDiscountCode(code)
        setDiscountError(null)
      } else {
        setDiscountError('Coupon code is invalid or expired.')
      }
    })
  }

  const handleRemoveDiscount = () => {
    setDiscountCodeInput('')
    setAppliedDiscountCode('')
    setDiscountError(null)
  }

  // Submit checkout and trigger payment
  const handleSubmitPayment = (e: React.SyntheticEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email.includes('@')) {
      setErrorMessage('Please enter a valid email address for digital delivery.')
      return
    }

    setCheckoutStep('processing')

    startTransition(async () => {
      const result = await createCheckoutSessionAction({
        storefrontIdentifier: {
          type: 'workspaceId',
          value: workspace.id,
        },
        items: [{ productId: product.id, quantity: 1 }],
        customerEmail: email.trim(),
        customerName: name.trim() ? name.trim() : null,
        customerPhone: phone.trim() ? phone.trim() : null,
        discountCode: appliedDiscountCode ? appliedDiscountCode : null,
        customerCountry: 'IN',
        customerState,
        customerGstin: isB2B && gstin.trim().length > 0 ? gstin.trim() : null,
      })

      if (!result.ok) {
        setErrorMessage(result.error.message)
        setCheckoutStep('failed')
        return
      }

      setActiveOrderId(result.data.orderId)
      setActiveSessionId(result.data.checkoutSessionId)

      // If checkout URL is an external hosted redirect (e.g. Razorpay payment page), redirect
      if (result.data.checkoutUrl.startsWith('http')) {
        window.location.href = result.data.checkoutUrl
        return
      }

      // For local memory adapter / mock flows or UPI collect polling
      if (result.data.checkoutUrl.includes('collect') || result.data.checkoutUrl.includes('upi')) {
        setCheckoutStep('pending_upi')
        return
      }

      // Default to polling or verification transition
      setCheckoutStep('pending_upi')
    })
  }

  const handlePaymentConfirmed = () => {
    void (async () => {
      if (activeOrderId) {
        const summaryRes = await getPublicOrderSummaryAction(activeOrderId, workspace.id)
        if (summaryRes.ok) {
          setConfirmedOrderSummary(summaryRes.data)
        }
      }
      setCheckoutStep('success')
    })()
  }

  const handlePaymentFailed = (reason: string) => {
    setErrorMessage(reason)
    setCheckoutStep('failed')
  }

  // Render Step: Payment Success
  if (checkoutStep === 'success' && confirmedOrderSummary) {
    return (
      <CheckoutSuccessView
        order={confirmedOrderSummary}
        storefrontTitle={storefront.title}
        returnUrl={`/s/${storefront.subdomain}`}
      />
    )
  }

  // Render Step: Pending UPI Polling
  if (checkoutStep === 'pending_upi' && activeSessionId && activeOrderId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <CheckoutPendingPoll
          checkoutSessionId={activeSessionId}
          orderId={activeOrderId}
          workspaceId={workspace.id}
          totalAmountFormatted={`₹${(Number(totalAmount) / 100).toLocaleString('en-IN')}`}
          onConfirmed={handlePaymentConfirmed}
          onFailed={handlePaymentFailed}
          onCancel={() => {
            setCheckoutStep('form')
          }}
        />
      </div>
    )
  }

  // Render Step: Payment Failed
  if (checkoutStep === 'failed') {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <CheckoutFailureView
          errorMessage={errorMessage ?? 'Payment was declined.'}
          onRetry={() => {
            setCheckoutStep('form')
          }}
          onBackToCheckout={() => {
            setCheckoutStep('form')
          }}
        />
      </div>
    )
  }

  const totalMoney = money(BigInt(totalAmount), product.currency as CurrencyCode)
  const subtotalMoney = money(BigInt(subtotalAmount), product.currency as CurrencyCode)
  const discountMoney =
    BigInt(discountAmount) > 0n
      ? money(BigInt(discountAmount), product.currency as CurrencyCode)
      : null
  const taxMoney =
    BigInt(taxAmount) > 0n ? money(BigInt(taxAmount), product.currency as CurrencyCode) : null

  return (
    <div className="min-h-screen bg-[#FBFBFC] text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white shadow-sm"
              style={{ backgroundColor: accentColor }}
            >
              {storefront.title.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <span className="text-sm font-bold text-slate-900">{storefront.title}</span>
              <p className="text-[11px] text-slate-500">Secure Checkout</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>256-Bit SSL Encrypted</span>
          </div>
        </div>
      </header>

      {/* Main 2-Column Layout */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Form Steps (7 cols) */}
          <form onSubmit={handleSubmitPayment} className="space-y-6 lg:col-span-7">
            {/* Step 1: Customer Details */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                  1
                </span>
                Contact Information
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Your purchase receipt and instant download links will be sent to this email.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="checkout-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                    }}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="checkout-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Full Name
                    </label>
                    <input
                      id="checkout-name"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                      }}
                      placeholder="Jane Doe"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="checkout-phone"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Phone / WhatsApp (Optional)
                    </label>
                    <input
                      id="checkout-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                      }}
                      placeholder="+91 98765 43210"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Location & GST */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                  2
                </span>
                Tax & Location
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Select your billing state for accurate GST calculation.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="checkout-state"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    State (India)
                  </label>
                  <select
                    id="checkout-state"
                    value={customerState}
                    onChange={(e) => {
                      setCustomerState(e.target.value)
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isB2B}
                      onChange={(e) => {
                        setIsB2B(e.target.checked)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>I am purchasing for a registered business (Claim GST Input Credit)</span>
                  </label>

                  {isB2B && (
                    <div className="mt-3">
                      <label
                        htmlFor="checkout-gstin"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        GSTIN
                      </label>
                      <input
                        id="checkout-gstin"
                        type="text"
                        value={gstin}
                        onChange={(e) => {
                          setGstin(e.target.value.toUpperCase())
                        }}
                        placeholder="22AAAAA0000A1Z5"
                        maxLength={15}
                        className="mt-1.5 w-full uppercase tracking-wider font-mono rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50 transition-all"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-700">
                {errorMessage}
              </div>
            )}

            {/* Step 3: Payment CTA */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs text-white">
                  3
                </span>
                Payment Options
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Instant UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards, and Netbanking.
              </p>

              <div className="mt-5">
                <button
                  type="submit"
                  disabled={isPending || checkoutStep === 'processing'}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-lg transition-all hover:opacity-95 active:scale-98 disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  {isPending || checkoutStep === 'processing' ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
                      <span>Securing Order...</span>
                    </span>
                  ) : (
                    <span>
                      Pay {`₹${(Number(totalAmount) / 100).toLocaleString('en-IN')}`} & Complete
                      Order
                    </span>
                  )}
                </button>

                <div className="mt-4 flex items-center justify-center gap-4 text-xs font-semibold text-slate-400">
                  <span>⚡ Instant Delivery</span>
                  <span>•</span>
                  <span>🔒 UPI & Cards</span>
                  <span>•</span>
                  <span>📄 GST Invoice</span>
                </div>
              </div>
            </div>
          </form>

          {/* Right Column: Order Summary & Product Card (5 cols) */}
          <div className="space-y-6 lg:col-span-5">
            {/* Product Summary Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Order Summary
              </h3>

              <div className="mt-4 flex items-start gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-black text-white text-lg shadow-sm"
                  style={{ backgroundColor: accentColor }}
                >
                  {product.title.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">
                    {product.title}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {product.deliverableAssets.length > 0
                      ? `${product.deliverableAssets.length.toString()} Digital File(s)`
                      : 'Digital Product'}
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">
                    <MoneyDisplay value={subtotalMoney} />
                  </p>
                </div>
              </div>

              {/* Deliverable File Items Preview */}
              {product.deliverableAssets.length > 0 && (
                <div className="mt-4 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-[11px] font-semibold text-slate-600">Included Assets:</p>
                  {product.deliverableAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between text-xs text-slate-500"
                    >
                      <span className="truncate pr-2">{asset.originalFilename}</span>
                      <span className="shrink-0 font-mono text-[10px]">
                        {(asset.byteSize / (1024 * 1024)).toFixed(1)} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Coupon Code Section */}
              <div className="mt-6 border-t border-slate-100 pt-5">
                {appliedDiscountCode ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-700">{appliedDiscountCode}</span>
                      {discountSavingsText && (
                        <span className="text-[11px] text-emerald-600">
                          ({discountSavingsText})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      className="font-semibold text-emerald-800 hover:text-emerald-950 underline transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountCodeInput}
                        onChange={(e) => {
                          setDiscountCodeInput(e.target.value.toUpperCase())
                        }}
                        placeholder="Discount code"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs uppercase tracking-wider text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleApplyDiscount}
                        disabled={!discountCodeInput.trim() || isPending}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                    {discountError && (
                      <p className="mt-1.5 text-xs text-rose-500">{discountError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Price Calculation Breakdown */}
              <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">
                    <MoneyDisplay value={subtotalMoney} />
                  </span>
                </div>

                {discountMoney && (
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Discount ({appliedDiscountCode})</span>
                    <span className="font-semibold">
                      -<MoneyDisplay value={discountMoney} />
                    </span>
                  </div>
                )}

                {taxMoney && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>
                      Estimated GST ({customerState === 'Delhi' ? 'CGST+SGST 18%' : 'IGST 18%'})
                    </span>
                    <span className="font-semibold text-slate-900">
                      <MoneyDisplay value={taxMoney} />
                    </span>
                  </div>
                )}

                {taxBreakdown.length > 0 && (
                  <div className="pl-2 space-y-1 text-[11px] text-slate-400">
                    {taxBreakdown.map((tx) => (
                      <div key={tx.name} className="flex items-center justify-between">
                        <span>{tx.name}</span>
                        <span>₹{(Number(tx.amount) / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-slate-950">
                  <span>Total Amount</span>
                  <span>
                    <MoneyDisplay value={totalMoney} />
                  </span>
                </div>
              </div>
            </div>

            {/* Money-Back & Guarantees */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 text-xs text-slate-600 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Immediate digital download and email receipt after payment</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Direct dispute & refund support via creator workspace</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Authorized payment processing via Razorpay</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
