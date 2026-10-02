'use client'

/**
 * The page a buyer lands on after paying, and returns to from their receipt.
 *
 * While a payment is still settling it refreshes itself for two minutes, so a
 * confirmation that arrives by webhook shows up without a manual reload. A
 * paid order offers fresh download links, which go to the buyer's inbox only.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, Mail, RefreshCw, Undo2 } from 'lucide-react'

import { Spinner } from '@/components/ds'
import type { BuyerOrderView } from '@/lib/checkout'
import { resendBuyerLinksAction } from '@/lib/checkout-actions'
import { formatAmount, formatDateTime } from '@/lib/format'

export function OrderStatus({
  order,
  host,
}: {
  readonly order: BuyerOrderView
  readonly host: string
}) {
  const router = useRouter()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const pending = order.status === 'pending' || order.status === 'requires_payment'

  useEffect(() => {
    if (!pending) return
    let ticks = 0
    const timer = window.setInterval(() => {
      ticks += 1
      if (ticks > 30) {
        window.clearInterval(timer)
        return
      }
      router.refresh()
    }, 4000)
    return () => {
      window.clearInterval(timer)
    }
  }, [pending, router])

  async function resend() {
    setSending(true)
    const result = await resendBuyerLinksAction({ host, orderId: order.orderId })
    setSending(false)
    setMessage({ ok: result.ok, text: result.message })
  }

  const paid = order.status === 'paid'
  const refunded = order.status === 'refunded' || order.status === 'partially_refunded'

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-20">
      <div className="rounded-3xl border border-border-subtle bg-surface-raised p-7 shadow-elevation-2 sm:p-9">
        <div
          className={`flex size-12 items-center justify-center rounded-full ${
            paid
              ? 'bg-[var(--store-accent)] text-[var(--store-accent-fg)]'
              : 'bg-surface-sunken text-content-secondary'
          }`}
        >
          {paid ? (
            <Check className="size-6" strokeWidth={2.5} aria-hidden="true" />
          ) : refunded ? (
            <Undo2 className="size-5" aria-hidden="true" />
          ) : (
            <Clock className="size-5" aria-hidden="true" />
          )}
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight store-heading">
          {paid ? 'Order complete' : refunded ? 'Order refunded' : 'Confirming your payment'}
        </h1>
        <p className="mt-2 text-[15px] text-content-secondary" aria-live="polite">
          {paid
            ? `Your download links were emailed to ${order.maskedEmail}.`
            : refunded
              ? 'This order was refunded. Access to the files has ended.'
              : 'This usually takes a few seconds. This page updates by itself. If you were charged, your files will arrive by email.'}
        </p>
        {pending && (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-content-tertiary">
            <Spinner className="size-3.5" /> Waiting for the payment provider
          </p>
        )}

        <div className="mt-7 rounded-2xl bg-surface-base p-4">
          <ul className="space-y-2 text-[14px]">
            {order.items.map((item) => (
              <li key={item.title} className="flex justify-between gap-4">
                <span className="min-w-0 truncate">{item.title}</span>
                <span className="shrink-0 tabular-nums">
                  {formatAmount(item.amount, order.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-border-subtle pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatAmount(order.total, order.currency)}</span>
          </div>
          <p className="mt-3 text-[12px] text-content-tertiary">
            Order {order.orderId.slice(-8).toUpperCase()} · {formatDateTime(order.createdAt)}
          </p>
        </div>

        {paid && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void resend()}
              disabled={sending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-control text-[14px] font-medium transition-colors hover:bg-surface-sunken disabled:opacity-60"
            >
              {sending ? <Spinner /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Email me fresh download links
            </button>
            {message && (
              <p
                role="status"
                className={`mt-3 flex items-center gap-2 text-[13px] ${message.ok ? 'text-positive' : 'text-content-secondary'}`}
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {message.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
