/**
 * Checkout service: quote, start, and confirm a purchase.
 *
 * Responsibilities:
 * 1. Price an order from server state only: catalogue prices, the discount
 *    rules, and the creator's GST settings. The browser sends a product id, a
 *    quantity, and who is buying; never an amount (security.md §4).
 * 2. Commit the order before talking to the payment provider, then attach the
 *    provider session in a second short transaction (ADR-0009: no external I/O
 *    inside a transaction).
 * 3. Confirm a payment by verifying the provider's signed proof server-side,
 *    then fulfil the order, issue download links, and email them.
 *
 * Free products skip the provider entirely: the order is created and fulfilled
 * in one transaction, which is the lead-magnet flow.
 */
import { randomUUID } from 'node:crypto'
import {
  currency,
  discountId,
  gstStateCode,
  money,
  orderId as toOrderId,
  productId,
  requestId,
  variantId as toVariantId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type CurrencyCode,
  type DiscountRecord,
  type WorkspaceContext,
} from '@creatorhub/contracts'
import {
  auditLog,
  catalogue,
  discounts,
  fulfillment,
  orders,
  payments,
  storefronts,
  workspaces,
  type RepositoryScope,
} from '@creatorhub/db'
import {
  calculateOrderTax,
  calculateServerOrderPricing,
  evaluateDiscount,
  type CalculatedOrderPricing,
  type DiscountEvaluationFailure,
  type DiscountEvaluationSuccess,
  type ServerProductPriceInfo,
} from '@creatorhub/domain'
import {
  PaymentProviderError,
  type MemoryPaymentProvider,
  WebhookSignatureVerificationError,
  type PaymentProvider,
} from '@creatorhub/payments'

import { getDatabase } from './db'
import { issueDownloadGrants, sendPurchaseEmails, type IssuedDownload } from './delivery'
import { auditOptions, storefrontUrl } from './env'
import { formatAmount } from './format'
import { fulfillPaidOrder, PaymentAmountMismatchError } from './order-fulfillment'
import { getPaymentProvider } from './payments'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a buyer reached the store: its subdomain or a verified custom domain. */
export type StoreRef = { readonly host: string }

export type BuyerLocation = {
  /** ISO 3166-1 alpha-2. */
  readonly country: string
  /** GST state code, e.g. "29" for Karnataka. Indian buyers only. */
  readonly stateCode?: string | null | undefined
  readonly gstin?: string | null | undefined
}

export type CheckoutLineInput = {
  readonly productId: string
  readonly variantId?: string | null | undefined
}

export type CheckoutQuote = {
  readonly currency: string
  readonly subtotal: string
  readonly discount: string
  readonly tax: string
  readonly total: string
  readonly discountCode: string | null
  /** Why a code the buyer typed did not apply. Null when it applied or none was typed. */
  readonly discountProblem: string | null
  readonly taxLines: readonly {
    readonly label: string
    readonly rateBps: number
    readonly amount: string
  }[]
  /** One sentence explaining the tax treatment, shown under the total. */
  readonly taxNote: string
  readonly gstRegistered: boolean
}

export type CheckoutFailure = {
  readonly ok: false
  readonly code: string
  readonly message: string
}

export type SerializedDownload = {
  readonly url: string
  readonly productTitle: string
  readonly originalFilename: string
  readonly byteSize: string
  readonly maxDownloads: number
  readonly expiresAt: string
}

export type StartCheckoutResult =
  | {
      readonly ok: true
      readonly kind: 'free'
      readonly orderId: string
      readonly downloads: readonly SerializedDownload[]
    }
  | {
      readonly ok: true
      readonly kind: 'payment'
      readonly orderId: string
      readonly provider: string
      readonly publicKey: string | null
      readonly sessionId: string
      readonly amount: string
      readonly currency: string
      readonly storeName: string
      readonly description: string
      readonly prefill: { readonly name: string; readonly email: string; readonly contact: string }
      readonly testMode: boolean
    }
  | CheckoutFailure

export type ConfirmPaymentResult =
  | {
      readonly ok: true
      readonly status: 'paid'
      readonly orderId: string
      readonly downloads: readonly SerializedDownload[]
    }
  | { readonly ok: true; readonly status: 'pending'; readonly orderId: string }
  | CheckoutFailure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A blank GSTIN means the buyer has none. */
function normaliseGstin(raw: string | null | undefined): string | null {
  const gstin = raw?.trim().toUpperCase()
  return gstin?.length ? gstin : null
}

function fail(code: string, message: string): CheckoutFailure {
  return { ok: false, code, message }
}

function publicContext(rawWorkspaceId: string, label: string): WorkspaceContext {
  return workspaceContext({
    workspaceId: toWorkspaceId(rawWorkspaceId),
    requestId: requestId(`req-${label}-${randomUUID().slice(0, 8)}`),
  })
}

export function serializeDownloads(downloads: readonly IssuedDownload[]): SerializedDownload[] {
  return downloads.map((d) => ({
    url: d.url,
    productTitle: d.productTitle,
    originalFilename: d.originalFilename,
    byteSize: d.byteSize,
    maxDownloads: d.maxDownloads,
    expiresAt: d.expiresAt.toISOString(),
  }))
}

/** A published storefront by host. Drafts and suspended stores do not sell. */
export async function resolvePublishedStore(store: StoreRef) {
  const host = store.host.trim().toLowerCase()
  if (!host || host.length > 253) return null
  const resolved = await getDatabase().resolveStorefrontByHostname(host)
  return resolved?.status === 'published' ? resolved : null
}

/** What the buyer reads when a code does not apply. */
function discountProblemFor(
  code: DiscountEvaluationFailure['code'],
  record: DiscountRecord,
  orderCurrency: string,
): string {
  switch (code) {
    case 'INACTIVE':
    case 'NOT_STARTED':
      return 'That code is not active right now.'
    case 'EXPIRED':
      return 'That code has expired.'
    case 'USAGE_EXCEEDED':
      return 'That code has been used up.'
    case 'MIN_ORDER_NOT_MET':
      return `That code needs an order of at least ${formatAmount(record.minOrderAmount ?? 0n, orderCurrency)}.`
    case 'PRODUCT_NOT_APPLICABLE':
      return 'That code does not apply to this product.'
    case 'CURRENCY_MISMATCH':
      return 'That code cannot be used with this currency.'
  }
}

function toDiscountRecord(
  row: Awaited<ReturnType<typeof discounts.findDiscountByCode>>,
): DiscountRecord | null {
  if (!row) return null
  return {
    id: discountId(row.id),
    workspaceId: toWorkspaceId(row.workspaceId),
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    currency: row.currency ? currency(row.currency) : null,
    maxUses: row.maxUses,
    usesCount: row.usesCount,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    minOrderAmount: row.minOrderAmount,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

type PricedCheckout = {
  readonly pricing: CalculatedOrderPricing
  readonly quote: CheckoutQuote
  readonly discountId: string | null
}

/**
 * Price one product for one buyer. Shared by the live quote and the order
 * itself, so the total the buyer saw is the total they are charged.
 */
async function priceCheckout(
  scope: RepositoryScope,
  input: {
    readonly line: CheckoutLineInput
    readonly discountCode?: string | null | undefined
    readonly buyer: BuyerLocation
  },
): Promise<{ ok: true; value: PricedCheckout } | CheckoutFailure> {
  const ws = await workspaces.findCurrentWorkspace(scope)
  const product = await catalogue.findProductById(scope, productId(input.line.productId))
  if (!ws || product?.status !== 'published' || product.visibility === 'private') {
    return fail('PRODUCT_UNAVAILABLE', 'This product is not available right now.')
  }

  const productCurrency: CurrencyCode = currency(product.currency)
  const catalog = new Map<string, ServerProductPriceInfo>()
  catalog.set(product.id, {
    productId: productId(product.id),
    title: product.title,
    price: money(product.basePrice, productCurrency),
    isPublished: true,
  })

  let chosenVariant: string | null = null
  if (input.line.variantId) {
    const variants = await catalogue.listVariantsForProduct(scope, productId(product.id))
    const variant = variants.find((v) => v.id === input.line.variantId)
    if (!variant) return fail('VARIANT_UNAVAILABLE', 'That option is no longer available.')
    chosenVariant = variant.id
    catalog.set(`${product.id}:${variant.id}`, {
      productId: productId(product.id),
      variantId: toVariantId(variant.id),
      title: `${product.title} (${variant.title})`,
      price: money(variant.priceOverride ?? product.basePrice, productCurrency),
      isPublished: true,
    })
  }

  const unitPrice =
    catalog.get(chosenVariant ? `${product.id}:${chosenVariant}` : product.id)?.price.amount ?? 0n

  // Discount
  let evaluated: DiscountEvaluationSuccess | null = null
  let discountProblem: string | null = null
  let appliedCode: string | null = null
  let appliedDiscountId: string | null = null
  const typedCode = input.discountCode?.trim()
  if (typedCode) {
    const record = toDiscountRecord(await discounts.findDiscountByCode(scope, typedCode))
    if (!record) {
      discountProblem = 'That code does not exist for this store.'
    } else {
      const applicable = await discounts.listApplicableProductIdsForDiscount(scope, record.id)
      const result = evaluateDiscount(
        record,
        { subtotal: unitPrice, currency: productCurrency, productIds: [productId(product.id)] },
        applicable.map((id) => productId(id)),
      )
      if (result.valid) {
        evaluated = result
        appliedCode = record.code
        appliedDiscountId = record.id
      } else {
        discountProblem = discountProblemFor(result.code, record, productCurrency)
      }
    }
  }

  // GST, from the creator's own settings.
  const taxable = unitPrice - (evaluated?.discountAmount.amount ?? 0n)
  const settings = ws.taxSettings
  const buyerCountry = input.buyer.country.toUpperCase()
  const buyerGstin = normaliseGstin(input.buyer.gstin)
  const buyerState = buyerGstin ? gstStateCode(buyerGstin) : (input.buyer.stateCode ?? null)

  let rateBps = 0
  let scheme: 'none' | 'export' | 'intra' | 'inter' = 'none'
  if (settings.gstRegistered && taxable > 0n) {
    const tax = calculateOrderTax({
      taxableAmount: taxable,
      currency: productCurrency,
      sellerCountry: 'IN',
      sellerState: gstStateCode(settings.gstin),
      buyerCountry,
      buyerState,
      buyerGstin,
      defaultRateBasisPoints: settings.rateBasisPoints,
    })
    if (tax.ok) {
      rateBps = tax.value.rateBasisPoints
      scheme = tax.value.isExport
        ? 'export'
        : tax.value.scheme === 'gst_cgst_sgst'
          ? 'intra'
          : rateBps > 0
            ? 'inter'
            : 'none'
    }
  }

  const priced = calculateServerOrderPricing({
    items: [
      {
        productId: productId(product.id),
        variantId: chosenVariant ? toVariantId(chosenVariant) : null,
        quantity: 1,
      },
    ],
    catalog,
    discount: evaluated,
    taxRateBasisPoints: rateBps,
  })
  if (!priced.ok) return fail(priced.error.code, priced.error.detail)
  const pricing = priced.value

  // Split the tax the pricing engine actually charged, so the lines always
  // sum to the order's tax to the paisa.
  const taxLines: CheckoutQuote['taxLines'] =
    scheme === 'intra'
      ? [
          {
            label: 'CGST',
            rateBps: Math.floor(rateBps / 2),
            amount: (pricing.taxAmount / 2n).toString(),
          },
          {
            label: 'SGST',
            rateBps: rateBps - Math.floor(rateBps / 2),
            amount: (pricing.taxAmount - pricing.taxAmount / 2n).toString(),
          },
        ]
      : scheme === 'inter'
        ? [{ label: 'IGST', rateBps, amount: pricing.taxAmount.toString() }]
        : []

  const taxNote = !settings.gstRegistered
    ? 'No GST is charged by this seller.'
    : scheme === 'export'
      ? 'Zero-rated export. No GST for buyers outside India.'
      : scheme === 'intra'
        ? 'Includes CGST and SGST for a same-state purchase.'
        : 'Includes IGST for an inter-state purchase.'

  return {
    ok: true,
    value: {
      pricing,
      discountId: appliedDiscountId,
      quote: {
        currency: pricing.currency,
        subtotal: pricing.subtotalAmount.toString(),
        discount: pricing.discountAmount.toString(),
        tax: pricing.taxAmount.toString(),
        total: pricing.totalAmount.toString(),
        discountCode: appliedCode,
        discountProblem,
        taxLines,
        taxNote,
        gstRegistered: settings.gstRegistered,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

export async function quoteCheckout(input: {
  readonly store: StoreRef
  readonly line: CheckoutLineInput
  readonly discountCode?: string | null | undefined
  readonly buyer: BuyerLocation
}): Promise<{ ok: true; quote: CheckoutQuote } | CheckoutFailure> {
  const store = await resolvePublishedStore(input.store)
  if (!store) return fail('STORE_NOT_FOUND', 'This store is not open right now.')

  const context = publicContext(store.workspaceId, 'quote')
  return getDatabase().withWorkspace(context, async (tx) => {
    const priced = await priceCheckout({ tx, context }, input)
    return priced.ok ? { ok: true as const, quote: priced.value.quote } : priced
  })
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export type StartCheckoutInput = {
  readonly store: StoreRef
  readonly line: CheckoutLineInput
  readonly discountCode?: string | null | undefined
  readonly buyer: BuyerLocation
  readonly email: string
  readonly name: string
  readonly phone?: string | null | undefined
  /** `code|clickedAtIso` from the referral cookie for this store, if any. */
  readonly referral?: { readonly code: string; readonly clickedAt: string } | null | undefined
}

export async function startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
  const store = await resolvePublishedStore(input.store)
  if (!store) return fail('STORE_NOT_FOUND', 'This store is not open right now.')

  const db = getDatabase()
  const context = publicContext(store.workspaceId, 'chk')

  // Transaction 1: price and create the order. Free orders are fulfilled here.
  const created = await db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const priced = await priceCheckout(scope, input)
    if (!priced.ok) return priced
    const { pricing, quote, discountId: appliedDiscountId } = priced.value

    const { order } = await orders.createOrder(scope, {
      customerEmail: input.email,
      customerName: input.name,
      customerPhone: input.phone ?? null,
      currency: pricing.currency,
      subtotalAmount: pricing.subtotalAmount,
      discountAmount: pricing.discountAmount,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      items: pricing.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productTitle: item.title,
        unitAmount: item.unitAmount,
        quantity: item.quantity,
        subtotalAmount: item.subtotalAmount,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
        totalAmount: item.totalAmount,
      })),
      metadata: {
        discountCode: quote.discountCode,
        discountId: appliedDiscountId,
        buyerCountry: input.buyer.country.toUpperCase(),
        buyerStateCode: input.buyer.stateCode ?? null,
        buyerGstin: normaliseGstin(input.buyer.gstin),
        taxLines: quote.taxLines,
        ...(input.referral
          ? { referralCode: input.referral.code, referralClickedAt: input.referral.clickedAt }
          : {}),
      },
    })

    await auditLog.writeAuditLog(scope, auditOptions, {
      action: 'order.checkout_started',
      actorType: 'system',
      targetType: 'order',
      targetId: order.id,
      metadata: { totalAmount: pricing.totalAmount.toString(), currency: pricing.currency },
    })

    if (pricing.totalAmount === 0n) {
      const fulfilled = await fulfillPaidOrder(scope, {
        orderId: order.id,
        provider: 'memory',
        providerPaymentId: `free_${order.id}`,
        amount: 0n,
        currency: pricing.currency,
        method: 'free',
        capturedAt: new Date(),
      })
      return {
        ok: true as const,
        kind: 'free' as const,
        order,
        downloads: fulfilled.downloadGrants ?? [],
      }
    }

    await orders.recordOrderTransition(scope, {
      orderId: order.id,
      fromStatus: 'pending',
      toStatus: 'requires_payment',
      actorType: 'customer',
      reason: 'Checkout started',
    })
    await orders.updateOrderStatus(scope, order.id, 'requires_payment', 'unpaid')

    const ws = await workspaces.findCurrentWorkspace(scope)
    const sf = await storefronts.findStorefrontByWorkspaceId(scope)
    return {
      ok: true as const,
      kind: 'payment' as const,
      order,
      pricing,
      storeName: sf?.title ?? ws?.name ?? 'CreatorHub store',
    }
  })

  if (!created.ok) return created

  if (created.kind === 'free') {
    await sendPurchaseEmails({
      workspaceId: store.workspaceId,
      orderId: created.order.id,
      downloads: created.downloads,
    })
    return {
      ok: true,
      kind: 'free',
      orderId: created.order.id,
      downloads: serializeDownloads(created.downloads),
    }
  }

  // Outside any transaction: ask the provider for a session.
  const provider = getPaymentProvider()
  const orderCurrency = currency(created.order.currency)
  const successUrl = `${storefrontUrl(store.subdomain)}/order/${created.order.id}`
  let session
  try {
    session = await provider.createCheckoutSession({
      workspaceId: toWorkspaceId(store.workspaceId),
      orderId: toOrderId(created.order.id),
      currency: orderCurrency,
      totalAmount: money(created.order.totalAmount, orderCurrency),
      lineItems: created.pricing.items.map((item) => ({
        name: item.title,
        quantity: item.quantity,
        unitAmount: money(item.unitAmount, orderCurrency),
        totalAmount: money(item.totalAmount, orderCurrency),
        productId: item.productId,
      })),
      customer: {
        email: input.email,
        name: input.name,
        ...(input.phone ? { phone: input.phone } : {}),
      },
      successUrl,
      cancelUrl: successUrl,
    })
  } catch (error) {
    console.error('[checkout] provider session failed', {
      orderId: created.order.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return fail(
      'PROVIDER_UNAVAILABLE',
      'The payment service did not respond. Nothing was charged. Try again in a moment.',
    )
  }

  // Transaction 2: attach the session and record the pending payment.
  await db.withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    await orders.setCheckoutSession(scope, created.order.id, session.id)
    await payments.createPayment(scope, {
      orderId: created.order.id,
      provider: provider.name,
      providerPaymentId: session.id,
      providerOrderId: session.id,
      amount: created.order.totalAmount,
      currency: created.order.currency,
      status: 'pending',
    })
  })

  return {
    ok: true,
    kind: 'payment',
    orderId: created.order.id,
    provider: provider.name,
    publicKey: session.publicKey ?? null,
    sessionId: session.id,
    amount: created.order.totalAmount.toString(),
    currency: created.order.currency,
    storeName: created.storeName,
    description: created.pricing.items
      .map((i) => i.title)
      .join(', ')
      .slice(0, 250),
    prefill: { name: input.name, email: input.email, contact: input.phone ?? '' },
    testMode: provider.name === 'memory',
  }
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

export type ConfirmPaymentInput = {
  readonly store: StoreRef
  readonly orderId: string
  readonly providerPaymentId: string
  readonly signature: string
}

async function confirmWith(
  provider: PaymentProvider,
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const store = await resolvePublishedStore(input.store)
  if (!store) return fail('STORE_NOT_FOUND', 'This store is not open right now.')

  const db = getDatabase()
  const context = publicContext(store.workspaceId, 'cfm')
  const order = await db.withWorkspace(context, (tx) =>
    orders.findOrderById({ tx, context }, toOrderId(input.orderId)),
  )
  if (!order?.checkoutSessionId) return fail('ORDER_NOT_FOUND', 'We could not find this order.')
  if (order.status === 'paid') return { ok: true, status: 'paid', orderId: order.id, downloads: [] }

  let snapshot
  try {
    snapshot = await provider.confirmCheckoutPayment({
      sessionId: order.checkoutSessionId,
      providerPaymentId: input.providerPaymentId,
      signature: input.signature,
    })
  } catch (error) {
    if (
      error instanceof WebhookSignatureVerificationError ||
      (error as Error | null)?.name === 'WebhookSignatureVerificationError'
    ) {
      return fail(
        'PAYMENT_NOT_VERIFIED',
        'We could not verify this payment. If money left your account, the seller will see it and refund it automatically.',
      )
    }
    if (error instanceof PaymentProviderError) {
      // The webhook will settle it; tell the buyer to wait rather than retry.
      return { ok: true, status: 'pending', orderId: order.id }
    }
    throw error
  }

  if (snapshot.status !== 'captured') {
    return { ok: true, status: 'pending', orderId: order.id }
  }

  try {
    const result = await db.withWorkspace(context, (tx) =>
      fulfillPaidOrder(
        { tx, context },
        {
          orderId: order.id,
          provider: snapshot.provider,
          providerPaymentId: snapshot.providerPaymentId,
          amount: snapshot.amount.amount,
          currency: snapshot.amount.currency,
          method: snapshot.method,
          capturedAt: snapshot.capturedAt,
        },
      ),
    )
    const downloads = result.downloadGrants ?? []
    if (!result.idempotentReplay) {
      await sendPurchaseEmails({ workspaceId: store.workspaceId, orderId: order.id, downloads })
    }
    return { ok: true, status: 'paid', orderId: order.id, downloads: serializeDownloads(downloads) }
  } catch (error) {
    if (error instanceof PaymentAmountMismatchError) {
      console.error('[checkout] amount mismatch', error.message)
      return fail(
        'AMOUNT_MISMATCH',
        'The payment amount did not match this order. The seller has been notified and will refund you.',
      )
    }
    throw error
  }
}

export function confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
  return confirmWith(getPaymentProvider(), input)
}

/**
 * Complete a payment in test mode. Only possible when the memory provider is
 * active, which env.ts refuses in production. The proof is produced by the
 * provider itself and then verified like a real one.
 */
export async function completeTestPayment(input: {
  readonly store: StoreRef
  readonly orderId: string
}): Promise<ConfirmPaymentResult> {
  const provider = getPaymentProvider()
  // By name, not instanceof: server bundles can hold separate copies of a class.
  if (provider.name !== 'memory') {
    return fail('NOT_TEST_MODE', 'Test payments are turned off.')
  }
  const testProvider = provider as MemoryPaymentProvider

  const store = await resolvePublishedStore(input.store)
  if (!store) return fail('STORE_NOT_FOUND', 'This store is not open right now.')
  const context = publicContext(store.workspaceId, 'tst')
  const order = await getDatabase().withWorkspace(context, (tx) =>
    orders.findOrderById({ tx, context }, toOrderId(input.orderId)),
  )
  if (!order?.checkoutSessionId) return fail('ORDER_NOT_FOUND', 'We could not find this order.')

  const proof = testProvider.signTestPayment(order.checkoutSessionId)
  return confirmWith(provider, {
    store: input.store,
    orderId: input.orderId,
    providerPaymentId: proof.providerPaymentId,
    signature: proof.signature,
  })
}

// ---------------------------------------------------------------------------
// Order status (the page a buyer returns to)
// ---------------------------------------------------------------------------

export type BuyerOrderView = {
  readonly orderId: string
  readonly status: string
  readonly paymentStatus: string
  readonly maskedEmail: string
  readonly total: string
  readonly subtotal: string
  readonly discount: string
  readonly tax: string
  readonly currency: string
  readonly createdAt: string
  readonly items: readonly { readonly title: string; readonly amount: string }[]
}

/** Mask an email for a page anyone with the order link can open. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${shown}${'•'.repeat(Math.max(1, Math.min(6, local.length - shown.length)))}@${domain}`
}

export async function getBuyerOrder(input: {
  readonly store: StoreRef
  readonly orderId: string
}): Promise<BuyerOrderView | null> {
  const store = await resolvePublishedStore(input.store)
  if (!store) return null
  if (!/^[0-9a-f-]{36}$/i.test(input.orderId)) return null

  const context = publicContext(store.workspaceId, 'ord')
  return getDatabase().withWorkspace(context, async (tx) => {
    const found = await orders.findOrderWithItems({ tx, context }, toOrderId(input.orderId))
    if (!found) return null
    const { order, items } = found
    return {
      orderId: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      maskedEmail: maskEmail(order.customerEmail),
      total: order.totalAmount.toString(),
      subtotal: order.subtotalAmount.toString(),
      discount: order.discountAmount.toString(),
      tax: order.taxAmount.toString(),
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      items: items.map((item) => ({
        title: item.productTitle,
        amount: item.totalAmount.toString(),
      })),
    }
  })
}

// ---------------------------------------------------------------------------
// Resend links
// ---------------------------------------------------------------------------

const RESEND_COOLDOWN_MS = 10 * 60 * 1000

/**
 * Issue fresh download links for a paid order and email them to the address
 * on the order. Anyone holding the order link can ask, but the links only ever
 * go to the buyer's inbox, and only once every ten minutes.
 */
export async function resendBuyerLinks(input: {
  readonly store: StoreRef
  readonly orderId: string
}): Promise<{ ok: boolean; message: string }> {
  const store = await resolvePublishedStore(input.store)
  if (!store) return { ok: false, message: 'This store is not open right now.' }

  const context = publicContext(store.workspaceId, 'rsd')
  const outcome = await getDatabase().withWorkspace(context, async (tx) => {
    const scope = { tx, context }
    const order = await orders.findOrderById(scope, toOrderId(input.orderId))
    if (order?.status !== 'paid')
      return { ok: false as const, message: 'This order is not paid yet.' }

    const entitlementRows = await fulfillment.findEntitlementsByOrderId(scope, order.id)
    for (const entitlement of entitlementRows) {
      const [latest] = await fulfillment.findDownloadGrantsByEntitlementId(scope, entitlement.id)
      if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
        return {
          ok: false as const,
          message: 'New links were sent a few minutes ago. Check your inbox and spam folder.',
        }
      }
    }

    const downloads = await issueDownloadGrants(scope, order.id)
    return { ok: true as const, order, downloads }
  })

  if (!outcome.ok) return outcome

  await sendPurchaseEmails({
    workspaceId: store.workspaceId,
    orderId: outcome.order.id,
    downloads: outcome.downloads,
    notifyCreator: false,
  })
  return {
    ok: true,
    message: `Fresh links are on their way to ${maskEmail(outcome.order.customerEmail)}.`,
  }
}
