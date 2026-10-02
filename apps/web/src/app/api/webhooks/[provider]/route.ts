/**
 * Inbound payment webhooks.
 *
 * POST /api/webhooks/razorpay
 *
 * 1. Refuse when no webhook secret is configured. There is no default secret:
 *    a known fallback would let anyone sign a "payment captured" event.
 * 2. Verify the signature over the raw body before parsing anything else.
 * 3. Read the tenant from metadata this app attached to the provider order,
 *    which the signature covers, and open that workspace. No cross-tenant
 *    lookup is needed (ADR-0021).
 * 4. Record the event and process it in one transaction. The unique
 *    constraint on (workspace, provider, event id) makes redelivery a no-op.
 * 5. Send receipt emails only after that transaction commits.
 *
 * A transient failure returns 500 so the provider retries; the transaction
 * rolled back, so the retry starts clean. A permanent problem (an order that
 * is not ours, an amount that does not match) is recorded and acknowledged.
 */
import { randomUUID } from 'node:crypto'
import { orderId as toOrderId, requestId, workspaceContext, workspaceId } from '@creatorhub/contracts'
import { orders, webhooks } from '@creatorhub/db'
import { WebhookSignatureVerificationError } from '@creatorhub/payments'
import { NextResponse, type NextRequest } from 'next/server'

import { sendPurchaseEmails, type IssuedDownload } from '@/lib/delivery'
import { webhookSecret } from '@/lib/env'
import { getDatabase } from '@/lib/db'
import {
  fulfillPaidOrder,
  PaymentAmountMismatchError,
  processPaymentFailure,
} from '@/lib/order-fulfillment'
import { getPaymentProvider } from '@/lib/payments'
import { fulfillRefund } from '@/lib/refund-fulfillment'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ack(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: providerName } = await props.params
  const provider = getPaymentProvider()

  if (providerName !== provider.name) {
    return ack({ error: 'Unknown webhook endpoint.' }, 404)
  }

  const secret = webhookSecret(providerName)
  if (!secret) {
    console.error(`[webhook] ${providerName.toUpperCase()}_WEBHOOK_SECRET is not set; refusing delivery.`)
    return ack({ error: 'Webhook endpoint is not configured.' }, 503)
  }

  const rawBody = await request.text()
  let verified
  try {
    verified = await provider.verifyWebhook({
      rawPayload: rawBody,
      signature:
        request.headers.get('x-razorpay-signature') ??
        request.headers.get('x-payment-signature') ??
        '',
      secret,
      eventId: request.headers.get('x-razorpay-event-id') ?? undefined,
    })
  } catch (error) {
    if (error instanceof WebhookSignatureVerificationError) {
      return ack({ error: 'Signature verification failed.' }, 401)
    }
    return ack({ error: 'Malformed webhook payload.' }, 400)
  }

  // A signed event about something this app did not create (another product
  // on the same provider account) can fail to map. That is not a retryable
  // error, so it is acknowledged rather than left to throw a 500.
  let domainEvent
  try {
    domainEvent = provider.toDomainEvent(verified)
  } catch {
    domainEvent = null
  }
  if (
    !verified.workspaceId ||
    !UUID.test(verified.workspaceId) ||
    !domainEvent ||
    !('orderId' in domainEvent) ||
    !UUID.test(domainEvent.orderId)
  ) {
    // Not an event about an order this app created, or not one it acts on.
    return ack({ received: true, ignored: true })
  }

  const tenantId = verified.workspaceId
  const context = workspaceContext({
    workspaceId: workspaceId(tenantId),
    requestId: requestId(`req-whk-${randomUUID().slice(0, 8)}`),
  })

  try {
    const outcome = await getDatabase().withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const recorded = await webhooks.recordWebhookEvent(scope, {
        provider: provider.name,
        providerEventId: verified.id,
        eventType: verified.eventType,
        signatureVerified: true,
        payload: verified.payload,
      })
      if (recorded.isDuplicate) return { duplicate: true as const }

      const order = await orders.findOrderById(scope, toOrderId(domainEvent.orderId))
      if (!order) {
        await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'ignored', {
          error: 'Order not found in this workspace.',
        })
        return { duplicate: false as const }
      }

      let downloads: readonly IssuedDownload[] | null = null
      try {
        if (domainEvent.type === 'payment.captured') {
          const result = await fulfillPaidOrder(scope, {
            orderId: order.id,
            provider: domainEvent.provider,
            providerPaymentId: domainEvent.providerPaymentId,
            amount: domainEvent.amount.amount,
            currency: domainEvent.amount.currency,
            method: domainEvent.method,
            capturedAt: domainEvent.occurredAt,
          })
          if (!result.idempotentReplay) downloads = result.downloadGrants ?? []
        } else if (domainEvent.type === 'payment.failed') {
          if (order.status !== 'paid') {
            await processPaymentFailure(scope, {
              orderId: order.id,
              provider: domainEvent.provider,
              providerPaymentId: domainEvent.providerPaymentId,
              reason: domainEvent.reason,
              failedAt: domainEvent.occurredAt,
            })
          }
        } else if (domainEvent.type === 'refund.processed') {
          await fulfillRefund(scope, {
            orderId: order.id,
            providerRefundId: domainEvent.providerRefundId,
            amount: domainEvent.amount.amount,
            currency: domainEvent.amount.currency,
          })
        }
      } catch (error) {
        if (error instanceof PaymentAmountMismatchError) {
          await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'failed', {
            error: error.message,
          })
          return { duplicate: false as const }
        }
        throw error
      }

      await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'processed', {
        processedAt: new Date(),
      })
      return { duplicate: false as const, orderId: order.id, downloads }
    })

    if ('downloads' in outcome && outcome.downloads && outcome.orderId) {
      await sendPurchaseEmails({
        workspaceId: tenantId,
        orderId: outcome.orderId,
        downloads: outcome.downloads,
      })
    }

    return ack({ received: true, duplicate: outcome.duplicate })
  } catch (error) {
    console.error('[webhook] processing failed', {
      eventId: verified.id,
      error: error instanceof Error ? error.message : String(error),
    })
    // 500 asks the provider to redeliver; the transaction rolled back.
    return ack({ error: 'Processing failed; please retry.' }, 500)
  }
}
