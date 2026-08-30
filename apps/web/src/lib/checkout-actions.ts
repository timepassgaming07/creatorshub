/**
 * Server Actions for Checkout Sessions & Payments (Slice 5 §5.6).
 *
 * Responsibilities:
 * 1. Validate public checkout input requests with Zod.
 * 2. Resolve storefront and workspace context.
 * 3. Enforce server-authoritative pricing and discount evaluation.
 * 4. Compute GST/VAT tax breakdowns.
 * 5. Create `pending` orders and payment intent tracking in `@creatorhub/db`.
 * 6. Dispatch checkout session creation to `PaymentProvider` and return hosted redirect URL.
 */
'use server'

import { randomUUID } from 'node:crypto'
import {
  type CurrencyCode,
  type DiscountRecord,
  type StorefrontTheme,
  currency,
  discountId,
  money,
  orderId,
  productId,
  requestId,
  userId,
  variantId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import {
  auditLog,
  catalogue,
  discounts,
  orders,
  payments,
  storefronts,
  workspaces,
} from '@creatorhub/db'
import {
  calculateOrderTax,
  calculateServerOrderPricing,
  evaluateDiscount,
  type ServerProductPriceInfo,
} from '@creatorhub/domain'
import { z } from 'zod'

import { getDatabase } from './db'
import { fulfillPaidOrder } from './order-fulfillment'
import { getPaymentProvider } from './payments'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const checkoutItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().min(1).max(100),
})

const createCheckoutSessionInputSchema = z.object({
  storefrontIdentifier: z.object({
    type: z.enum(['subdomain', 'customDomain', 'workspaceId']),
    value: z.string().min(1),
  }),
  items: z.array(checkoutItemSchema).min(1, 'Order must have at least one item.'),
  customerEmail: z.email('Please enter a valid email address.'),
  customerName: z.string().max(255).nullable().optional(),
  customerPhone: z.string().max(50).nullable().optional(),
  discountCode: z.string().max(50).nullable().optional(),
  customerCountry: z.string().max(2).default('IN'),
  customerState: z.string().max(50).nullable().optional(),
  customerGstin: z.string().max(15).nullable().optional(),
  successUrl: z.url().optional(),
  cancelUrl: z.url().optional(),
})

export type CreateCheckoutSessionActionInput = z.infer<typeof createCheckoutSessionInputSchema>

export type CheckoutSessionResult =
  | {
      readonly ok: true
      readonly data: {
        readonly orderId: string
        readonly checkoutSessionId: string
        readonly checkoutUrl: string
        readonly totalAmount: string
        readonly currency: string
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
      }
    }

/**
 * Creates a server-authoritative checkout session and hosted payment redirect.
 */
export async function createCheckoutSessionAction(
  rawInput: CreateCheckoutSessionActionInput,
): Promise<CheckoutSessionResult> {
  const parsed = createCheckoutSessionInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid checkout submission.',
      },
    }
  }

  const input = parsed.data
  const db = getDatabase()
  const paymentProvider = getPaymentProvider()
  const reqId = requestId(`req-chk-${randomUUID().slice(0, 8)}`)

  // 1. Resolve storefront and workspace
  let targetWorkspaceId: string | null = null

  if (input.storefrontIdentifier.type === 'workspaceId') {
    targetWorkspaceId = input.storefrontIdentifier.value
  } else {
    const resolved = await db.resolveStorefrontByHostname(input.storefrontIdentifier.value)
    if (!resolved) {
      return {
        ok: false,
        error: {
          code: 'STOREFRONT_NOT_FOUND',
          message: 'Storefront not found.',
        },
      }
    }
    targetWorkspaceId = resolved.workspaceId
  }

  const wsId = workspaceId(targetWorkspaceId)
  const context = workspaceContext({
    workspaceId: wsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: reqId,
  })

  // 2. Execute authoritative checkout transaction
  try {
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }

      // 2a. Fetch catalog prices
      const catalog = new Map<string, ServerProductPriceInfo>()
      const requestedProductIds = [...new Set(input.items.map((it) => it.productId))]

      for (const prodId of requestedProductIds) {
        const prod = await catalogue.findProductById(scope, productId(prodId))
        if (prod) {
          catalog.set(prod.id, {
            productId: productId(prod.id),
            title: prod.title,
            price: money(prod.basePrice, currency(prod.currency)),
            isPublished: prod.status === 'published',
          })
        }
      }

      // 2b. Calculate provisional subtotal and evaluate discount if supplied
      let subtotalEstimate = 0n
      let orderCurrencyCode: CurrencyCode = currency('INR')

      for (const item of input.items) {
        const p = catalog.get(item.productId)
        if (p) {
          subtotalEstimate += p.price.amount * BigInt(item.quantity)
          orderCurrencyCode = p.price.currency
        }
      }

      let evaluatedDiscount = null
      if (input.discountCode) {
        const discountRec = await discounts.findDiscountByCode(scope, input.discountCode)
        if (discountRec) {
          const mappedDiscount: DiscountRecord = {
            id: discountId(discountRec.id),
            workspaceId: workspaceId(discountRec.workspaceId),
            code: discountRec.code,
            discountType: discountRec.discountType,
            discountValue: discountRec.discountValue,
            currency: discountRec.currency ? currency(discountRec.currency) : null,
            maxUses: discountRec.maxUses,
            usesCount: discountRec.usesCount,
            startsAt: discountRec.startsAt,
            expiresAt: discountRec.expiresAt,
            minOrderAmount: discountRec.minOrderAmount,
            isActive: discountRec.isActive,
            createdAt: discountRec.createdAt,
            updatedAt: discountRec.updatedAt,
          }

          const discountEval = evaluateDiscount(mappedDiscount, {
            subtotal: subtotalEstimate,
            currency: orderCurrencyCode,
            productIds: requestedProductIds.map((id) => productId(id)),
          })

          if (discountEval.valid) {
            evaluatedDiscount = discountEval
          }
        }
      }

      // 2c. Calculate taxes
      const taxableEstimate = evaluatedDiscount
        ? subtotalEstimate - evaluatedDiscount.discountAmount.amount
        : subtotalEstimate

      const taxResult = calculateOrderTax({
        taxableAmount: taxableEstimate > 0n ? taxableEstimate : 0n,
        currency: orderCurrencyCode,
        sellerCountry: 'IN',
        buyerCountry: input.customerCountry,
        buyerState: input.customerState,
        buyerGstin: input.customerGstin,
      })

      const taxRateBasisPoints = taxResult.ok ? taxResult.value.rateBasisPoints : 0

      // 2d. Compute authoritative order pricing
      const pricingResult = calculateServerOrderPricing({
        items: input.items.map((it) => ({
          productId: productId(it.productId),
          variantId: it.variantId ? variantId(it.variantId) : undefined,
          quantity: it.quantity,
        })),
        catalog,
        discount: evaluatedDiscount,
        taxRateBasisPoints,
      })

      if (!pricingResult.ok) {
        return {
          ok: false,
          error: {
            code: pricingResult.error.code,
            message: pricingResult.error.detail,
          },
        }
      }

      const pricing = pricingResult.value

      // 2e. Create connected checkout session with PaymentProvider
      const hostUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
      const successUrl =
        input.successUrl ?? `${hostUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
      const cancelUrl =
        input.cancelUrl ?? `${hostUrl}/checkout/cancel?session_id={CHECKOUT_SESSION_ID}`

      const tentativeOrderId = orderId(
        `018f9e2b-7c5e-7a2e-8c3b-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      )

      const providerSession = await paymentProvider.createCheckoutSession({
        workspaceId: wsId,
        orderId: tentativeOrderId,
        totalAmount: money(pricing.totalAmount, pricing.currency),
        currency: pricing.currency,
        customer: {
          email: input.customerEmail,
          ...(input.customerName ? { name: input.customerName } : {}),
          ...(input.customerPhone ? { phone: input.customerPhone } : {}),
        },
        successUrl,
        cancelUrl,
        lineItems: pricing.items.map((it) => ({
          name: it.title,
          unitAmount: money(it.unitAmount, pricing.currency),
          totalAmount: money(it.totalAmount, pricing.currency),
          quantity: it.quantity,
          productId: it.productId,
          ...(it.variantId ? { variantId: it.variantId } : {}),
        })),
        metadata: {
          customerState: input.customerState ?? '',
          customerGstin: input.customerGstin ?? '',
        },
      })

      // 2f. Create Order in Database
      const { order: createdOrder } = await orders.createOrder(scope, {
        customerEmail: input.customerEmail,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        currency: pricing.currency,
        subtotalAmount: pricing.subtotalAmount,
        discountAmount: pricing.discountAmount,
        taxAmount: pricing.taxAmount,
        totalAmount: pricing.totalAmount,
        checkoutSessionId: providerSession.id,
        items: pricing.items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId ?? null,
          productTitle: it.title,
          unitAmount: it.unitAmount,
          quantity: it.quantity,
          subtotalAmount: it.subtotalAmount,
          discountAmount: it.discountAmount,
          taxAmount: it.taxAmount,
          totalAmount: it.totalAmount,
        })),
        metadata: {
          discountCode: input.discountCode ?? null,
          taxBreakdown: taxResult.ok ? taxResult.value.components : [],
        },
      })

      // 2g. Record transition to requires_payment
      await orders.recordOrderTransition(scope, {
        orderId: createdOrder.id,
        fromStatus: 'pending',
        toStatus: 'requires_payment',
        actorType: 'customer',
        reason: 'Checkout session created',
      })
      await orders.updateOrderStatus(scope, createdOrder.id, 'requires_payment', 'unpaid')

      // 2h. Track initial payment record
      await payments.createPayment(scope, {
        orderId: createdOrder.id,
        provider: 'razorpay',
        providerPaymentId: providerSession.id,
        amount: pricing.totalAmount,
        currency: pricing.currency,
        status: 'pending',
        metadata: {
          checkoutUrl: providerSession.checkoutUrl,
        },
      })

      // 2i. Audit log entry
      await auditLog.writeAuditLog(scope, auditOptions, {
        action: 'order.checkout_session_created',
        targetType: 'order',
        targetId: createdOrder.id,
        actorType: 'user',
        actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        metadata: {
          totalAmount: pricing.totalAmount.toString(),
          currency: pricing.currency,
          checkoutSessionId: providerSession.id,
        },
      })

      return {
        ok: true,
        data: {
          orderId: createdOrder.id,
          checkoutSessionId: providerSession.id,
          checkoutUrl: providerSession.checkoutUrl,
          totalAmount: pricing.totalAmount.toString(),
          currency: pricing.currency,
        },
      }
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Checkout initiation failed.'
    return {
      ok: false,
      error: {
        code: 'CHECKOUT_CREATION_FAILED',
        message: errMessage,
      },
    }
  }
}

export type VerifyCheckoutResult =
  | {
      readonly ok: true
      readonly data: {
        readonly orderId: string
        readonly status: string
        readonly paymentStatus: string
        readonly totalAmount: string
        readonly currency: string
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
      }
    }

/**
 * Verifies a checkout session with the payment provider and fulfills the order if captured.
 */
export async function verifyAndFulfillCheckoutSessionAction(
  checkoutSessionId: string,
  workspaceIdParam?: string,
): Promise<VerifyCheckoutResult> {
  if (!checkoutSessionId) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SESSION_ID',
        message: 'Checkout session ID is required.',
      },
    }
  }

  const db = getDatabase()
  const paymentProvider = getPaymentProvider()
  const reqId = requestId(`req-vfy-${randomUUID().slice(0, 8)}`)

  try {
    const wsId = workspaceId(workspaceIdParam ?? '018f9e2b-7c5e-7a2e-8c3b-000000000001')
    const context = workspaceContext({
      workspaceId: wsId,
      actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
      requestId: reqId,
    })

    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const orderRecord = await orders.findOrderByCheckoutSessionId(scope, checkoutSessionId)

      if (!orderRecord) {
        return {
          ok: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order for this session was not found.',
          },
        }
      }

      if (orderRecord.status === 'paid') {
        return {
          ok: true,
          data: {
            orderId: orderRecord.id,
            status: orderRecord.status,
            paymentStatus: orderRecord.paymentStatus,
            totalAmount: orderRecord.totalAmount.toString(),
            currency: orderRecord.currency,
          },
        }
      }

      // Check payment status with provider
      const paymentSnapshot = await paymentProvider.getPayment(checkoutSessionId).catch(() => null)

      if (paymentSnapshot?.status === 'captured') {
        const fulfillResult = await fulfillPaidOrder(scope, {
          orderId: orderRecord.id,
          provider: paymentSnapshot.provider,
          providerPaymentId: paymentSnapshot.providerPaymentId,
          amount: paymentSnapshot.amount.amount,
          currency: paymentSnapshot.amount.currency,
          method: paymentSnapshot.method,
          capturedAt: paymentSnapshot.capturedAt,
        })

        return {
          ok: true,
          data: {
            orderId: fulfillResult.order.id,
            status: fulfillResult.order.status,
            paymentStatus: fulfillResult.order.paymentStatus,
            totalAmount: fulfillResult.order.totalAmount.toString(),
            currency: fulfillResult.order.currency,
          },
        }
      }

      return {
        ok: true,
        data: {
          orderId: orderRecord.id,
          status: orderRecord.status,
          paymentStatus: orderRecord.paymentStatus,
          totalAmount: orderRecord.totalAmount.toString(),
          currency: orderRecord.currency,
        },
      }
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Verification failed.'
    return {
      ok: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: errMessage,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Additional Checkout Actions (Slice 5 §5.11)
// ---------------------------------------------------------------------------

export type GetPublicCheckoutProductDataInput = {
  readonly productId: string
  readonly storefrontId?: string | null | undefined
  readonly workspaceId?: string | null | undefined
  readonly subdomain?: string | null | undefined
  readonly customDomain?: string | null | undefined
}

export type PublicCheckoutProductData = {
  readonly product: {
    readonly id: string
    readonly title: string
    readonly slug: string
    readonly description: string | null
    readonly basePrice: string
    readonly compareAtPrice: string | null
    readonly currency: string
    readonly assetsCount: number
    readonly deliverableAssets: readonly {
      readonly id: string
      readonly originalFilename: string
      readonly byteSize: number
    }[]
  }
  readonly storefront: {
    readonly id: string
    readonly title: string
    readonly subdomain: string
    readonly customDomain: string | null
    readonly themeConfig: StorefrontTheme
  }
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly defaultCurrency: string
  }
}

/**
 * Public Data Loader: Fetches product, storefront, and workspace for checkout rendering.
 */
export async function getPublicCheckoutProductData(
  input: GetPublicCheckoutProductDataInput,
): Promise<
  | { readonly ok: true; readonly data: PublicCheckoutProductData }
  | { readonly ok: false; readonly error: string }
> {
  if (!input.productId) {
    return { ok: false, error: 'Product ID is required.' }
  }

  const db = getDatabase()
  let resolvedWorkspaceId: string | null = null

  if (input.subdomain) {
    const resolved = await db.resolveStorefrontByHostname(input.subdomain)
    if (resolved) {
      resolvedWorkspaceId = resolved.workspaceId
    }
  } else if (input.customDomain) {
    const resolved = await db.resolveStorefrontByHostname(input.customDomain)
    if (resolved) {
      resolvedWorkspaceId = resolved.workspaceId
    }
  } else if (input.workspaceId) {
    resolvedWorkspaceId = input.workspaceId
  }

  // Fallback to default workspace if not determined via hostname
  const targetWsId = workspaceId(resolvedWorkspaceId ?? '018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const reqId = requestId(`req-chk-dat-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: targetWsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: reqId,
  })

  try {
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const prod = await catalogue.findProductById(scope, productId(input.productId))
      if (prod?.status !== 'published') {
        return { ok: false, error: 'Product not found or not currently available for purchase.' }
      }

      const rawAssets = await catalogue.listAssetsForProduct(scope, productId(prod.id))
      const deliverableAssets = rawAssets
        .filter((a) => a.productAsset.role === 'deliverable')
        .map((a) => ({
          id: a.asset.id,
          originalFilename: a.asset.originalFilename,
          byteSize: Number(a.asset.byteSize),
        }))

      const sf = await storefronts.findStorefrontByWorkspaceId(scope)
      const ws = await workspaces.findCurrentWorkspace(scope)

      return {
        ok: true,
        data: {
          product: {
            id: prod.id,
            title: prod.title,
            slug: prod.slug,
            description: prod.description,
            basePrice: prod.basePrice.toString(),
            compareAtPrice: prod.compareAtPrice?.toString() ?? null,
            currency: prod.currency,
            assetsCount: rawAssets.length,
            deliverableAssets,
          },
          storefront: {
            id: sf?.id ?? 'sf-default',
            title: sf?.title ?? ws?.name ?? 'Creator Store',
            subdomain: sf?.subdomain ?? 'store',
            customDomain: sf?.customDomain ?? null,
            themeConfig: sf
              ? sf.themeConfig
              : {
                  accentColor: '#4f46e5',
                  fontPreset: 'sans',
                  layoutPreset: 'showcase',
                },
          },
          workspace: {
            id: ws?.id ?? targetWsId,
            name: ws?.name ?? 'Creator Workspace',
            defaultCurrency: ws?.defaultCurrency ?? prod.currency,
          },
        },
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load checkout details.'
    return { ok: false, error: message }
  }
}

export type CalculateCheckoutEstimateInput = {
  readonly workspaceId: string
  readonly productId: string
  readonly variantId?: string | null | undefined
  readonly quantity: number
  readonly discountCode?: string | null | undefined
  readonly customerCountry?: string | undefined
  readonly customerState?: string | null | undefined
  readonly customerGstin?: string | null | undefined
}

export type CheckoutEstimateResult =
  | {
      readonly ok: true
      readonly data: {
        readonly subtotalAmount: string
        readonly discountAmount: string
        readonly taxAmount: string
        readonly totalAmount: string
        readonly currency: string
        readonly discountCode: string | null
        readonly discountSavingsText: string | null
        readonly taxBreakdown: readonly {
          readonly name: string
          readonly rateBasisPoints: number
          readonly amount: string
        }[]
        readonly isExport: boolean
      }
    }
  | {
      readonly ok: false
      readonly error: {
        readonly code: string
        readonly message: string
      }
    }

/**
 * Calculates real-time checkout estimation with dynamic discount evaluation & GST calculation.
 */
export async function calculateCheckoutEstimateAction(
  input: CalculateCheckoutEstimateInput,
): Promise<CheckoutEstimateResult> {
  const db = getDatabase()
  const reqId = requestId(`req-est-${randomUUID().slice(0, 8)}`)
  const targetWsId = workspaceId(input.workspaceId || '018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const context = workspaceContext({
    workspaceId: targetWsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: reqId,
  })

  try {
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const prod = await catalogue.findProductById(scope, productId(input.productId))
      if (!prod) {
        return {
          ok: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'Product could not be found.',
          },
        }
      }

      const prodCurrency = currency(prod.currency)
      const qty = Math.max(1, Math.min(100, input.quantity || 1))
      const subtotal = prod.basePrice * BigInt(qty)

      // Evaluate discount if provided
      let evaluatedDiscount: ReturnType<typeof evaluateDiscount> | null = null
      let discountSavingsText: string | null = null
      let discountAmount = 0n

      if (input.discountCode && input.discountCode.trim().length > 0) {
        const discountRec = await discounts.findDiscountByCode(scope, input.discountCode.trim())
        if (discountRec) {
          const mappedDiscount: DiscountRecord = {
            id: discountId(discountRec.id),
            workspaceId: workspaceId(discountRec.workspaceId),
            code: discountRec.code,
            discountType: discountRec.discountType,
            discountValue: discountRec.discountValue,
            currency: discountRec.currency ? currency(discountRec.currency) : null,
            maxUses: discountRec.maxUses,
            usesCount: discountRec.usesCount,
            startsAt: discountRec.startsAt,
            expiresAt: discountRec.expiresAt,
            minOrderAmount: discountRec.minOrderAmount,
            isActive: discountRec.isActive,
            createdAt: discountRec.createdAt,
            updatedAt: discountRec.updatedAt,
          }

          const res = evaluateDiscount(mappedDiscount, {
            subtotal,
            currency: prodCurrency,
            productIds: [productId(prod.id)],
          })

          if (res.valid) {
            evaluatedDiscount = res
            discountAmount = res.discountAmount.amount
            discountSavingsText =
              mappedDiscount.discountType === 'percentage'
                ? `${(mappedDiscount.discountValue / 100n).toString()}% off`
                : 'Discount applied'
          }
        }
      }

      // Compute GST tax
      const taxableAmount = subtotal > discountAmount ? subtotal - discountAmount : 0n
      const taxResult = calculateOrderTax({
        taxableAmount,
        currency: prodCurrency,
        sellerCountry: 'IN',
        buyerCountry: input.customerCountry ?? 'IN',
        buyerState: input.customerState ?? null,
        buyerGstin: input.customerGstin ?? null,
      })

      const taxAmount = taxResult.ok ? taxResult.value.totalTax.amount : 0n
      const totalAmount = taxableAmount + taxAmount

      const taxBreakdown = taxResult.ok
        ? taxResult.value.components.map((c) => ({
            name: c.name,
            rateBasisPoints: c.rateBasisPoints,
            amount: c.amount.toString(),
          }))
        : []

      return {
        ok: true,
        data: {
          subtotalAmount: subtotal.toString(),
          discountAmount: discountAmount.toString(),
          taxAmount: taxAmount.toString(),
          totalAmount: totalAmount.toString(),
          currency: prod.currency,
          discountCode: evaluatedDiscount?.valid ? (input.discountCode?.trim() ?? null) : null,
          discountSavingsText,
          taxBreakdown,
          isExport: taxResult.ok ? taxResult.value.isExport : false,
        },
      }
    })
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Estimate failed.'
    return {
      ok: false,
      error: {
        code: 'ESTIMATE_FAILED',
        message: errMessage,
      },
    }
  }
}

export type PublicOrderSummary = {
  readonly orderId: string
  readonly status: string
  readonly paymentStatus: string
  readonly customerEmail: string
  readonly customerName: string | null
  readonly subtotalAmount: string
  readonly discountAmount: string
  readonly taxAmount: string
  readonly totalAmount: string
  readonly currency: string
  readonly createdAt: string
  readonly items: readonly {
    readonly id: string
    readonly productId: string
    readonly productTitle: string
    readonly quantity: number
    readonly unitAmount: string
    readonly totalAmount: string
  }[]
  readonly deliverables: readonly {
    readonly id: string
    readonly originalFilename: string
    readonly byteSize: number
  }[]
  readonly checkoutSessionId: string | null
  readonly failureReason?: string | null
}

/**
 * Public Data Loader: Fetches order summary for confirmation, receipt, and failure review.
 */
export async function getPublicOrderSummaryAction(
  orderIdString: string,
  workspaceIdParam?: string,
): Promise<
  | { readonly ok: true; readonly data: PublicOrderSummary }
  | { readonly ok: false; readonly error: string }
> {
  if (!orderIdString) {
    return { ok: false, error: 'Order ID is required.' }
  }

  const db = getDatabase()
  const reqId = requestId(`req-ord-sum-${randomUUID().slice(0, 8)}`)
  const targetWsId = workspaceId(workspaceIdParam ?? '018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const context = workspaceContext({
    workspaceId: targetWsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: reqId,
  })

  try {
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const orderWithItems = await orders.findOrderWithItems(scope, orderId(orderIdString))
      if (!orderWithItems) {
        return { ok: false, error: 'Order not found.' }
      }

      const { order, items } = orderWithItems
      const deliverables: {
        readonly id: string
        readonly originalFilename: string
        readonly byteSize: number
      }[] = []

      // If order is paid, retrieve deliverables for digital fulfillment download
      if (order.status === 'paid') {
        for (const item of items) {
          const rawAssets = await catalogue.listAssetsForProduct(scope, productId(item.productId))
          for (const a of rawAssets) {
            if (a.productAsset.role === 'deliverable') {
              deliverables.push({
                id: a.asset.id,
                originalFilename: a.asset.originalFilename,
                byteSize: Number(a.asset.byteSize),
              })
            }
          }
        }
      }

      // Check payment failure reason if any
      let failureReason: string | null = null
      if (order.status === 'requires_payment' || order.paymentStatus === 'failed') {
        const paymentList = await payments.listPaymentsForOrder(scope, order.id)
        const latestFailed = paymentList.find((p) => p.status === 'failed')
        failureReason = latestFailed?.failureReason ?? null
      }

      return {
        ok: true,
        data: {
          orderId: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          customerEmail: order.customerEmail,
          customerName: order.customerName,
          subtotalAmount: order.subtotalAmount.toString(),
          discountAmount: order.discountAmount.toString(),
          taxAmount: order.taxAmount.toString(),
          totalAmount: order.totalAmount.toString(),
          currency: order.currency,
          createdAt: order.createdAt.toISOString(),
          items: items.map((it) => ({
            id: it.id,
            productId: it.productId,
            productTitle: it.productTitle,
            quantity: it.quantity,
            unitAmount: it.unitAmount.toString(),
            totalAmount: it.totalAmount.toString(),
          })),
          deliverables,
          checkoutSessionId: order.checkoutSessionId,
          ...(failureReason !== null ? { failureReason } : {}),
        },
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve order summary.'
    return { ok: false, error: message }
  }
}

/**
 * Retries payment on an existing order that requires payment.
 */
export async function retryPaymentAction(
  orderIdString: string,
  workspaceIdParam?: string,
): Promise<CheckoutSessionResult> {
  const db = getDatabase()
  const paymentProvider = getPaymentProvider()
  const reqId = requestId(`req-rty-${randomUUID().slice(0, 8)}`)
  const targetWsId = workspaceId(workspaceIdParam ?? '018f9e2b-7c5e-7a2e-8c3b-000000000001')
  const context = workspaceContext({
    workspaceId: targetWsId,
    actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
    requestId: reqId,
  })

  try {
    return await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const ord = await orders.findOrderById(scope, orderId(orderIdString))
      if (!ord) {
        return {
          ok: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: 'Order was not found.',
          },
        }
      }

      if (ord.status === 'paid') {
        return {
          ok: false,
          error: {
            code: 'ALREADY_PAID',
            message: 'This order is already paid.',
          },
        }
      }

      const ordCurrency = currency(ord.currency)
      const hostUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
      const successUrl = `${hostUrl}/checkout/${ord.id}`
      const cancelUrl = `${hostUrl}/checkout/${ord.id}`

      const providerSession = await paymentProvider.createCheckoutSession({
        workspaceId: targetWsId,
        orderId: orderId(ord.id),
        totalAmount: money(ord.totalAmount, ordCurrency),
        currency: ordCurrency,
        customer: {
          email: ord.customerEmail,
          ...(ord.customerName ? { name: ord.customerName } : {}),
        },
        successUrl,
        cancelUrl,
        lineItems: [
          {
            name: 'Order Payment Retry',
            unitAmount: money(ord.totalAmount, ordCurrency),
            totalAmount: money(ord.totalAmount, ordCurrency),
            quantity: 1,
          },
        ],
      })

      // Update payment record & order checkout session
      await payments.createPayment(scope, {
        orderId: orderId(ord.id),
        provider: 'razorpay',
        providerPaymentId: providerSession.id,
        amount: ord.totalAmount,
        currency: ord.currency,
        status: 'pending',
        metadata: {
          checkoutUrl: providerSession.checkoutUrl,
          isRetry: true,
        },
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        action: 'order.payment_retried',
        targetType: 'order',
        targetId: ord.id,
        actorType: 'user',
        actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
        metadata: {
          orderId: ord.id,
          checkoutSessionId: providerSession.id,
        },
      })

      return {
        ok: true,
        data: {
          orderId: ord.id,
          checkoutSessionId: providerSession.id,
          checkoutUrl: providerSession.checkoutUrl,
          totalAmount: ord.totalAmount.toString(),
          currency: ord.currency,
        },
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Retry payment initiation failed.'
    return {
      ok: false,
      error: {
        code: 'PAYMENT_RETRY_FAILED',
        message,
      },
    }
  }
}
