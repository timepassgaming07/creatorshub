'use client'

/**
 * Checkout success & order fulfillment view component (Slice 5 §5.11).
 *
 * Displays instant digital fulfillment downloads, receipt details,
 * order reference, and creator support contact.
 */
import Link from 'next/link'
import { money, type CurrencyCode } from '@creatorhub/contracts'
import { MoneyDisplay } from '@creatorhub/ui'
import type { PublicOrderSummary } from '@/lib/checkout-actions'

type CheckoutSuccessViewProps = {
  readonly order: PublicOrderSummary
  readonly storefrontTitle?: string
  readonly returnUrl?: string
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes.toString()} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CheckoutSuccessView({
  order,
  storefrontTitle = 'Creator Store',
  returnUrl = '/',
}: CheckoutSuccessViewProps) {
  const totalMoney = money(BigInt(order.totalAmount), order.currency as CurrencyCode)
  const subtotalMoney = money(BigInt(order.subtotalAmount), order.currency as CurrencyCode)
  const discountMoney =
    BigInt(order.discountAmount) > 0n
      ? money(BigInt(order.discountAmount), order.currency as CurrencyCode)
      : null
  const taxMoney =
    BigInt(order.taxAmount) > 0n
      ? money(BigInt(order.taxAmount), order.currency as CurrencyCode)
      : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-100">
        {/* Header Celebration Banner */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-10 text-center text-white sm:px-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
            <svg
              className="h-9 w-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
            Payment Successful!
          </h1>
          <p className="mt-2 text-sm text-emerald-50">
            Thank you for your purchase from {storefrontTitle}.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1 text-xs font-medium backdrop-blur-sm">
            <span>Order #{order.orderId.slice(0, 8)}</span>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          {/* Digital Deliverables Download Box */}
          {order.deliverables.length > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <h2 className="text-base font-bold text-slate-900">Your Digital Files Are Ready</h2>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Click below to download your purchased files immediately. A receipt has also been
                sent to <span className="font-semibold text-slate-900">{order.customerEmail}</span>.
              </p>

              <div className="mt-4 space-y-2.5">
                {order.deliverables.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-white p-3.5 shadow-sm transition-all hover:border-emerald-300"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {file.originalFilename}
                        </p>
                        <p className="text-xs text-slate-500">{formatByteSize(file.byteSize)}</p>
                      </div>
                    </div>

                    <a
                      href={`/api/assets/${file.id}/download?orderId=${order.orderId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                      download
                    >
                      <span>Download</span>
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm font-semibold text-slate-900">Access Granted</p>
              <p className="mt-1 text-xs text-slate-600">
                Your order is confirmed. Digital access instructions have been sent to{' '}
                <span className="font-semibold">{order.customerEmail}</span>.
              </p>
            </div>
          )}

          {/* Receipt Breakdown & Automated Invoice */}
          <div className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Automated Invoice & Receipt
              </h3>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span>📄 Print / Save Invoice</span>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-800 font-medium">
                    {item.productTitle} <span className="text-slate-400">x{item.quantity}</span>
                  </span>
                  <span className="font-semibold text-slate-900">
                    <MoneyDisplay
                      value={money(BigInt(item.totalAmount), order.currency as CurrencyCode)}
                    />
                  </span>
                </div>
              ))}

              <div className="border-t border-slate-100 pt-3 space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>
                    <MoneyDisplay value={subtotalMoney} />
                  </span>
                </div>
                {discountMoney && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Discount</span>
                    <span>
                      -<MoneyDisplay value={discountMoney} />
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                  <span>Total Paid (Invoice Settled)</span>
                  <span className="text-base text-emerald-600 font-black">
                    <MoneyDisplay value={totalMoney} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href={returnUrl}
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              &larr; Return to {storefrontTitle}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
