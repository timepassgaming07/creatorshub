'use client'

/**
 * Checkout.
 *
 * Every number on this screen comes from the server: the quote is recomputed
 * whenever something that affects price changes (discount code, country,
 * state, GSTIN), and the order is priced again from scratch when the buyer
 * pays. The browser only ever sends a product id and who is buying.
 *
 * Paid orders open Razorpay Checkout in the page. Its signed result is sent
 * back to the server, which verifies it with Razorpay before delivering
 * anything. Free products skip payment entirely.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FlaskConical,
  Lock,
  Mail,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react'

import { Spinner } from '@/components/ds'
import {
  completeTestPaymentAction,
  confirmPaymentAction,
  getCheckoutQuoteAction,
  startCheckoutAction,
} from '@/lib/checkout-actions'
import type { CheckoutQuote, ConfirmPaymentResult, SerializedDownload } from '@/lib/checkout'
import { formatAmount, formatBytes } from '@/lib/format'

import { ProductCover } from './ProductCard'

type Stage = 'form' | 'paying' | 'test-payment' | 'confirming' | 'done'

type RazorpayResponse = {
  readonly razorpay_payment_id: string
  readonly razorpay_order_id: string
  readonly razorpay_signature: string
}

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: unknown) => void) => void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

let razorpayScript: Promise<RazorpayConstructor> | null = null

function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  razorpayScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay)
      else reject(new Error('Razorpay did not load'))
    }
    script.onerror = () => {
      razorpayScript = null
      reject(new Error('Razorpay did not load'))
    }
    document.head.appendChild(script)
  })
  return razorpayScript
}

export type CheckoutClientProps = {
  readonly host: string
  readonly basePath: string
  readonly storeTitle: string
  readonly accent: string
  readonly product: {
    readonly id: string
    readonly slug: string
    readonly title: string
    readonly coverUrl: string | null
    readonly currency: string
  }
  readonly variant: { readonly id: string; readonly title: string } | null
  readonly initialQuote: CheckoutQuote
  readonly states: readonly { readonly code: string; readonly name: string }[]
  readonly testMode: boolean
  readonly initialDiscount?: string
  /** The platform origin, for links to the legal pages from a creator's own host. */
  readonly appUrl: string
}

const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NP', name: 'Nepal' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'JP', name: 'Japan' },
]

const fieldClass =
  'h-11 w-full rounded-xl border border-border-control bg-surface-raised px-3.5 text-[15px] text-content-primary placeholder:text-content-tertiary transition-colors focus:border-[var(--store-accent)] focus:outline-none focus:ring-4 focus:ring-[color-mix(in_oklch,var(--store-accent)_18%,transparent)]'

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly optional?: boolean
  readonly error?: string | undefined
  readonly children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center justify-between text-[13px] font-medium text-content-primary">
        {label}
        {optional && <span className="font-normal text-content-tertiary">Optional</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-critical">
          {error}
        </p>
      )}
    </div>
  )
}

export function CheckoutClient(props: CheckoutClientProps) {
  const { host, product, variant, testMode } = props
  const [stage, setStage] = useState<Stage>('form')
  const [quote, setQuote] = useState<CheckoutQuote>(props.initialQuote)
  const [quoting, setQuoting] = useState(false)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('IN')
  const [stateCode, setStateCode] = useState('')
  const [gstin, setGstin] = useState('')
  const [showBusiness, setShowBusiness] = useState(false)
  const [codeInput, setCodeInput] = useState(props.initialDiscount ?? '')
  const [appliedCode, setAppliedCode] = useState(props.initialDiscount ?? '')
  const [showCode, setShowCode] = useState(Boolean(props.initialDiscount))

  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [orderId, setOrderId] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<readonly SerializedDownload[]>([])

  const isFree = BigInt(quote.total) === 0n
  const needsState = quote.gstRegistered && country === 'IN' && !gstin
  const requestSeq = useRef(0)

  // Re-quote whenever a price input changes.
  const refreshQuote = useCallback(async () => {
    const seq = ++requestSeq.current
    setQuoting(true)
    const result = await getCheckoutQuoteAction({
      host,
      line: { productId: product.id, variantId: variant?.id ?? null },
      discountCode: appliedCode || null,
      buyer: {
        country,
        stateCode: stateCode || null,
        gstin: gstin.length === 15 ? gstin : null,
      },
    })
    if (seq !== requestSeq.current) return
    setQuoting(false)
    if (result.ok) setQuote(result.quote)
  }, [host, product.id, variant?.id, appliedCode, country, stateCode, gstin])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshQuote()
    }, 250)
    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshQuote])

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors['email'] = 'Enter the email your files should go to.'
    if (!name.trim()) errors['name'] = 'Enter your name.'
    if (needsState && !stateCode) errors['state'] = 'Choose your state so the right GST applies.'
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      errors['gstin'] = 'Enter a valid 15-character GSTIN, or leave it blank.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function finish(result: ConfirmPaymentResult, id: string) {
    if (!result.ok) {
      setStage('form')
      setFormError(result.message)
      return
    }
    if (result.status === 'paid') {
      setDownloads(result.downloads)
      setOrderId(id)
      setStage('done')
      return
    }
    // Captured but not yet confirmed: the order page waits for the webhook.
    window.location.assign(`${props.basePath}/order/${id}`)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    setStage('paying')
    const started = await startCheckoutAction({
      host,
      line: { productId: product.id, variantId: variant?.id ?? null },
      discountCode: appliedCode || null,
      buyer: { country, stateCode: stateCode || null, gstin: gstin || null },
      email: email.trim(),
      name: name.trim(),
      phone: phone.trim() || null,
    })

    if (!started.ok) {
      setStage('form')
      setFormError(started.message)
      return
    }

    setOrderId(started.orderId)

    if (started.kind === 'free') {
      setDownloads(started.downloads)
      setStage('done')
      return
    }

    if (started.testMode) {
      setStage('test-payment')
      return
    }

    try {
      const Razorpay = await loadRazorpay()
      const checkout = new Razorpay({
        key: started.publicKey,
        order_id: started.sessionId,
        amount: Number(started.amount),
        currency: started.currency,
        name: started.storeName,
        description: started.description,
        prefill: started.prefill,
        notes: { order_id: started.orderId },
        theme: { color: props.accent },
        handler: (response: RazorpayResponse) => {
          setStage('confirming')
          void confirmPaymentAction({
            host,
            orderId: started.orderId,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          }).then((result) => {
            finish(result, started.orderId)
          })
        },
        modal: {
          ondismiss: () => {
            setStage('form')
            setFormError('Payment was not completed. You have not been charged. You can try again.')
          },
          confirm_close: true,
        },
      })
      checkout.on('payment.failed', (failure) => {
        const reason = (failure as { error?: { description?: string } }).error?.description
        setFormError(reason ? `Payment failed: ${reason}` : 'Payment failed. Try another method.')
      })
      checkout.open()
    } catch {
      setStage('form')
      setFormError('The payment window could not open. Check your connection and try again.')
    }
  }

  async function completeTestPayment() {
    if (!orderId) return
    setStage('confirming')
    const result = await completeTestPaymentAction({ host, orderId })
    finish(result, orderId)
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------

  if (stage === 'done') {
    return (
      <div className="mx-auto w-full max-w-xl px-5 pb-20">
        <div className="rounded-3xl border border-border-subtle bg-surface-raised p-7 text-center shadow-elevation-3 sm:p-10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--store-accent)] text-[var(--store-accent-fg)]">
            <Check className="size-7" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight store-heading">
            {isFree ? 'It’s yours.' : 'Payment received.'}
          </h1>
          <p className="mt-2 text-[15px] text-content-secondary">
            We sent your download links to <span className="font-medium text-content-primary">{email}</span>. Save them
            here too.
          </p>

          {downloads.length > 0 ? (
            <ul className="mt-7 space-y-2.5 text-left">
              {downloads.map((file) => (
                <li
                  key={file.url}
                  className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-base p-3 pl-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{file.originalFilename}</p>
                    <p className="text-[12px] text-content-tertiary">
                      {formatBytes(file.byteSize)} · {String(file.maxDownloads)} downloads
                    </p>
                  </div>
                  <a
                    href={file.url}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--store-accent)] px-4 text-[14px] font-semibold text-[var(--store-accent-fg)]"
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Download
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-2xl bg-surface-sunken px-4 py-3 text-[14px] text-content-secondary">
              The creator is still preparing the files. They will arrive by email as soon as they are ready.
            </p>
          )}

          {orderId && (
            <Link
              href={`${props.basePath}/order/${orderId}`}
              className="mt-7 inline-flex items-center gap-1.5 text-[14px] font-medium text-content-secondary hover:text-content-primary"
            >
              View your order
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------

  const busy = stage === 'paying' || stage === 'confirming'

  const summary = (
    <div className="rounded-3xl border border-border-subtle bg-surface-raised p-5 shadow-elevation-1 sm:p-6">
      <div className="flex gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-2xl">
          <ProductCover product={product} className="aspect-square h-full" />
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-medium tracking-wide text-content-tertiary uppercase">{props.storeTitle}</p>
          <p className="mt-1 font-semibold leading-snug store-heading">{product.title}</p>
          {variant && <p className="mt-0.5 text-[13px] text-content-secondary">{variant.title}</p>}
        </div>
      </div>

      <dl className={`mt-6 space-y-2.5 text-[14px] transition-opacity ${quoting ? 'opacity-60' : ''}`}>
        <div className="flex justify-between">
          <dt className="text-content-secondary">Subtotal</dt>
          <dd className="tabular-nums">{formatAmount(quote.subtotal, quote.currency)}</dd>
        </div>
        {BigInt(quote.discount) > 0n && (
          <div className="flex justify-between text-positive">
            <dt className="flex items-center gap-1.5">
              <Tag className="size-3.5" aria-hidden="true" />
              {quote.discountCode}
            </dt>
            <dd className="tabular-nums">−{formatAmount(quote.discount, quote.currency)}</dd>
          </div>
        )}
        {quote.taxLines.map((line) => (
          <div key={line.label} className="flex justify-between">
            <dt className="text-content-secondary">
              {line.label} ({(line.rateBps / 100).toString()}%)
            </dt>
            <dd className="tabular-nums">{formatAmount(line.amount, quote.currency)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-border-subtle pt-3.5">
          <dt className="font-semibold">Total</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">
            {isFree ? 'Free' : formatAmount(quote.total, quote.currency)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[12px] text-content-tertiary">{quote.taxNote}</p>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-5xl px-5 pb-20">
      {testMode && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-caution/30 bg-caution-subtle px-4 py-3 text-[14px]">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden="true" />
          <p>
            <span className="font-semibold">Test mode.</span>{' '}
            <span className="text-content-secondary">No real money moves. Payments are simulated end to end.</span>
          </p>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:gap-12">
        <aside className="md:sticky md:top-8 md:self-start" aria-label="Order summary">
          {summary}
          <ul className="mt-5 grid gap-2.5 px-1 text-[13px] text-content-secondary">
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-content-tertiary" aria-hidden="true" />
              {isFree ? 'No payment details needed' : 'Payments processed by Razorpay, PCI DSS compliant'}
            </li>
            <li className="flex items-center gap-2.5">
              <Mail className="size-4 text-content-tertiary" aria-hidden="true" />
              Instant delivery to your inbox
            </li>
          </ul>
        </aside>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight store-heading">
              {isFree ? 'Get your free download' : 'Checkout'}
            </h1>
            <p className="mt-1 text-[14px] text-content-secondary">
              {isFree ? 'Tell us where to send it.' : 'Your files arrive by email the moment payment clears.'}
            </p>
          </div>

          {formError && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-critical/25 bg-critical-subtle px-4 py-3 text-[14px]">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
              <p>{formError}</p>
            </div>
          )}

          <div className="grid gap-4">
            <Field id="email" label="Email" error={fieldErrors['email']}>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                }}
                aria-invalid={fieldErrors['email'] ? true : undefined}
                aria-describedby={fieldErrors['email'] ? 'email-error' : undefined}
                className={fieldClass}
                placeholder="you@example.com"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="name" label="Full name" error={fieldErrors['name']}>
                <input
                  id="name"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                  }}
                  aria-invalid={fieldErrors['name'] ? true : undefined}
                  aria-describedby={fieldErrors['name'] ? 'name-error' : undefined}
                  className={fieldClass}
                />
              </Field>
              <Field id="phone" label="Phone" optional>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                  }}
                  className={fieldClass}
                  placeholder="+91"
                />
              </Field>
            </div>
            {!isFree || quote.gstRegistered ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="country" label="Country">
                  <select
                    id="country"
                    autoComplete="country"
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value)
                      if (e.target.value !== 'IN') {
                        setStateCode('')
                        setGstin('')
                      }
                    }}
                    className={fieldClass}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {quote.gstRegistered && country === 'IN' && (
                  <Field id="state" label="State" error={fieldErrors['state']}>
                    <select
                      id="state"
                      value={stateCode}
                      onChange={(e) => {
                        setStateCode(e.target.value)
                      }}
                      aria-invalid={fieldErrors['state'] ? true : undefined}
                      className={fieldClass}
                    >
                      <option value="">Select state</option>
                      {props.states.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            ) : null}
          </div>

          {/* Optional extras */}
          <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle">
            {!isFree || appliedCode ? (
              <div className="p-4">
                <button
                  type="button"
                  aria-expanded={showCode}
                  onClick={() => {
                    setShowCode((v) => !v)
                  }}
                  className="flex w-full items-center justify-between text-[14px] font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Tag className="size-4 text-content-tertiary" aria-hidden="true" />
                    Discount code
                  </span>
                  <ChevronDown className={`size-4 transition-transform ${showCode ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {showCode && (
                  <div className="mt-3">
                    <div className="flex gap-2">
                      <input
                        aria-label="Discount code"
                        value={codeInput}
                        onChange={(e) => {
                          setCodeInput(e.target.value.toUpperCase())
                        }}
                        className={`${fieldClass} uppercase`}
                        placeholder="CODE"
                      />
                      {appliedCode ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedCode('')
                            setCodeInput('')
                          }}
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border-control px-4 text-[14px] font-medium"
                        >
                          <X className="size-4" aria-hidden="true" />
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!codeInput.trim()}
                          onClick={() => {
                            setAppliedCode(codeInput.trim())
                          }}
                          className="h-11 shrink-0 rounded-xl border border-border-control px-4 text-[14px] font-medium disabled:opacity-50"
                        >
                          Apply
                        </button>
                      )}
                    </div>
                    {appliedCode && quote.discountProblem && (
                      <p role="alert" className="mt-2 text-[13px] text-critical">
                        {quote.discountProblem}
                      </p>
                    )}
                    {appliedCode && quote.discountCode && (
                      <p className="mt-2 text-[13px] text-positive">
                        {quote.discountCode} applied. You save {formatAmount(quote.discount, quote.currency)}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {quote.gstRegistered && country === 'IN' && !isFree && (
              <div className="p-4">
                <button
                  type="button"
                  aria-expanded={showBusiness}
                  onClick={() => {
                    setShowBusiness((v) => !v)
                  }}
                  className="flex w-full items-center justify-between text-[14px] font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="size-4 text-content-tertiary" aria-hidden="true" />
                    Buying for a business? Add your GSTIN
                  </span>
                  <ChevronDown className={`size-4 transition-transform ${showBusiness ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {showBusiness && (
                  <div className="mt-3">
                    <Field id="gstin" label="GSTIN" optional error={fieldErrors['gstin']}>
                      <input
                        id="gstin"
                        value={gstin}
                        maxLength={15}
                        onChange={(e) => {
                          setGstin(e.target.value.toUpperCase().replace(/\s/g, ''))
                        }}
                        className={`${fieldClass} font-mono uppercase`}
                        placeholder="22AAAAA0000A1Z5"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>

          {stage === 'test-payment' ? (
            <div className="rounded-2xl border border-caution/30 bg-caution-subtle p-5">
              <p className="font-semibold">Simulate the payment</p>
              <p className="mt-1 text-[14px] text-content-secondary">
                In test mode the payment step is simulated. The order, ledger entries, and delivery all run for real.
              </p>
              <button
                type="button"
                onClick={() => void completeTestPayment()}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--store-accent)] font-semibold text-[var(--store-accent-fg)]"
              >
                Complete test payment of {formatAmount(quote.total, quote.currency)}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy || undefined}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--store-accent)] text-[16px] font-semibold text-[var(--store-accent-fg)] shadow-elevation-2 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-80"
            >
              {busy ? (
                <>
                  <Spinner className="size-5" />
                  {stage === 'confirming' ? 'Confirming payment…' : 'Preparing your order…'}
                </>
              ) : isFree ? (
                <>
                  Send it to me
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              ) : (
                <>
                  <Lock className="size-4" aria-hidden="true" />
                  Pay {formatAmount(quote.total, quote.currency)}
                </>
              )}
            </button>
          )}

          <p className="text-center text-[12px] leading-relaxed text-content-tertiary">
            By continuing you agree to the{' '}
            <a href={`${props.appUrl}/legal/terms`} className="underline underline-offset-2">
              terms
            </a>{' '}
            and{' '}
            <a href={`${props.appUrl}/legal/refunds`} className="underline underline-offset-2">
              refund policy
            </a>
            . Sold by {props.storeTitle}.
          </p>
        </form>
      </div>
    </div>
  )
}
