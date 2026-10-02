'use server'

/**
 * Public checkout server actions.
 *
 * Thin by design: each validates its input with zod and calls the checkout
 * service (checkout.ts), which holds the rules. These are reachable by anyone
 * on the internet, so nothing here trusts an amount, a workspace id, or a
 * payment status from the browser. The store is named by host; the server
 * resolves the workspace from a published storefront.
 */
import { cookies } from 'next/headers'
import { z } from 'zod'

import {
  completeTestPayment,
  confirmPayment,
  quoteCheckout,
  resendBuyerLinks,
  startCheckout,
  type CheckoutFailure,
  type CheckoutQuote,
  type ConfirmPaymentResult,
  type StartCheckoutResult,
} from './checkout'
import { REFERRAL_COOKIE, readReferralCookie } from './referral'

const hostSchema = z.string().trim().min(1).max(253)
const idSchema = z.uuid()

const buyerSchema = z.object({
  country: z.string().trim().length(2).toUpperCase(),
  stateCode: z
    .string()
    .regex(/^\d{2}$/)
    .nullish(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN or leave it blank.')
    .nullish()
    .or(z.literal('')),
})

const lineSchema = z.object({
  productId: idSchema,
  variantId: idSchema.nullish(),
})

const quoteSchema = z.object({
  host: hostSchema,
  line: lineSchema,
  discountCode: z.string().trim().max(50).nullish(),
  buyer: buyerSchema,
})

const startSchema = quoteSchema.extend({
  email: z.email('Enter the email address your files should go to.').max(254),
  name: z.string().trim().min(1, 'Enter your name.').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number or leave it blank.')
    .nullish()
    .or(z.literal('')),
})

const confirmSchema = z.object({
  host: hostSchema,
  orderId: idSchema,
  providerPaymentId: z.string().trim().min(1).max(100),
  signature: z.string().trim().min(1).max(256),
})

function invalid(error: z.ZodError): CheckoutFailure {
  return {
    ok: false,
    code: 'VALIDATION_ERROR',
    message: error.issues[0]?.message ?? 'Check the details you entered.',
  }
}

export async function getCheckoutQuoteAction(
  raw: z.input<typeof quoteSchema>,
): Promise<{ ok: true; quote: CheckoutQuote } | CheckoutFailure> {
  const parsed = quoteSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const { host, line, discountCode, buyer } = parsed.data
  return quoteCheckout({
    store: { host },
    line,
    discountCode,
    buyer: { country: buyer.country, stateCode: buyer.stateCode, gstin: buyer.gstin || null },
  })
}

export async function startCheckoutAction(
  raw: z.input<typeof startSchema>,
): Promise<StartCheckoutResult> {
  const parsed = startSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const input = parsed.data

  try {
    const jar = await cookies()
    const referral = readReferralCookie(jar.get(REFERRAL_COOKIE)?.value, input.host)

    return await startCheckout({
      store: { host: input.host },
      line: input.line,
      discountCode: input.discountCode,
      buyer: {
        country: input.buyer.country,
        stateCode: input.buyer.stateCode,
        gstin: input.buyer.gstin || null,
      },
      email: input.email.toLowerCase(),
      name: input.name,
      phone: input.phone || null,
      referral,
    })
  } catch (error) {
    console.error('[checkout] start failed', error instanceof Error ? error.message : error)
    return {
      ok: false,
      code: 'CHECKOUT_FAILED',
      message: 'Checkout could not start. Nothing was charged. Try again in a moment.',
    }
  }
}

export async function confirmPaymentAction(
  raw: z.input<typeof confirmSchema>,
): Promise<ConfirmPaymentResult> {
  const parsed = confirmSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)

  try {
    return await confirmPayment({
      store: { host: parsed.data.host },
      orderId: parsed.data.orderId,
      providerPaymentId: parsed.data.providerPaymentId,
      signature: parsed.data.signature,
    })
  } catch (error) {
    console.error('[checkout] confirm failed', error instanceof Error ? error.message : error)
    return {
      ok: false,
      code: 'CONFIRM_FAILED',
      message:
        'Your payment is being confirmed. If it went through, your files will arrive by email within a few minutes.',
    }
  }
}

export async function completeTestPaymentAction(raw: {
  host: string
  orderId: string
}): Promise<ConfirmPaymentResult> {
  const parsed = z.object({ host: hostSchema, orderId: idSchema }).safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  try {
    return await completeTestPayment({ store: { host: parsed.data.host }, orderId: parsed.data.orderId })
  } catch (error) {
    console.error('[checkout] test payment failed', error instanceof Error ? error.message : error)
    return { ok: false, code: 'TEST_PAYMENT_FAILED', message: 'The test payment could not complete.' }
  }
}

export async function resendBuyerLinksAction(raw: {
  host: string
  orderId: string
}): Promise<{ ok: boolean; message: string }> {
  const parsed = z.object({ host: hostSchema, orderId: idSchema }).safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'This order link is not valid.' }
  return resendBuyerLinks({ store: { host: parsed.data.host }, orderId: parsed.data.orderId })
}
