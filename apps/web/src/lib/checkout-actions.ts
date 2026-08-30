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
import { auditLog, catalogue, discounts, orders, payments } from '@creatorhub/db'
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
