/**
 * Inbound Webhook Ingestion API Route (Slice 5 §5.7, §5.9).
 *
 * Responsibilities:
 * 1. Receive signed webhook POST requests from payment providers (Razorpay, Stripe, Memory).
 * 2. Cryptographically verify signature using `PaymentProvider.verifyWebhook`.
 * 3. Enforce exactly-once deduplication via `webhooks.recordWebhookEvent`.
 * 4. Fulfill paid orders atomically with balanced ledger transactions on `payment.captured`.
 * 5. Track failed attempts on `payment.failed`.
 * 6. Return 200 OK fast to acknowledge delivery to the provider.
 */
import { randomUUID } from 'node:crypto'
import {
  paymentProviderSchema,
  requestId,
  userId,
  workspaceContext,
  workspaceId,
} from '@creatorhub/contracts'
import { webhooks } from '@creatorhub/db'
import { NextResponse, type NextRequest } from 'next/server'

import { getDatabase } from '../../../../lib/db'
import { fulfillPaidOrder, processPaymentFailure } from '../../../../lib/order-fulfillment'
import { getPaymentProvider } from '../../../../lib/payments'
import { fulfillRefund } from '../../../../lib/refund-fulfillment'

export async function POST(
  request: NextRequest,
  contextProps: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: rawProvider } = await contextProps.params
  const providerParse = paymentProviderSchema.safeParse(rawProvider)

  if (!providerParse.success) {
    return NextResponse.json(
      { error: `Unsupported payment provider: ${rawProvider}` },
      { status: 400 },
    )
  }

  const provider = providerParse.data
  const paymentProvider = getPaymentProvider()
  const db = getDatabase()

  try {
    const rawBody = await request.text()

    const signature =
      request.headers.get('x-razorpay-signature') ??
      request.headers.get('stripe-signature') ??
      request.headers.get('x-payment-signature') ??
      ''

    const webhookSecret =
      process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`] ??
      process.env['PAYMENT_WEBHOOK_SECRET'] ??
      'whsec_test_secret_32_chars_long_12345'

    const verified = await paymentProvider.verifyWebhook({
      rawPayload: rawBody,
      signature,
      secret: webhookSecret,
    })

    const payload = verified.payload
    const targetWsId =
      (payload['workspace_id'] as string | undefined) ??
      (payload['workspaceId'] as string | undefined) ??
      ((payload['notes'] as Record<string, unknown> | undefined)?.['workspace_id'] as
        string | undefined) ??
      '018f9e2b-7c5e-7a2e-8c3b-000000000001'

    const wsId = workspaceId(targetWsId)
    const context = workspaceContext({
      workspaceId: wsId,
      actorId: userId('018f9e2b-7c5e-7a2e-8c3b-000000000001'),
      requestId: requestId(`req-whk-${randomUUID().slice(0, 8)}`),
    })

    const domainEvent = paymentProvider.toDomainEvent(verified)

    const recordResult = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const recorded = await webhooks.recordWebhookEvent(scope, {
        provider,
        providerEventId: verified.id,
        eventType: verified.eventType,
        signatureVerified: true,
        payload: verified.payload,
      })

      // If duplicate, do not re-execute side effects
      if (recorded.isDuplicate) {
        return recorded
      }

      // Process domain events atomically in the same database transaction
      if (domainEvent) {
        if (domainEvent.type === 'payment.captured') {
          if (domainEvent.orderId) {
            await fulfillPaidOrder(scope, {
              orderId: domainEvent.orderId,
              provider: domainEvent.provider,
              providerPaymentId: domainEvent.providerPaymentId,
              amount: domainEvent.amount.amount,
              currency: domainEvent.amount.currency,
              method: domainEvent.method,
              capturedAt: domainEvent.occurredAt,
            })
            await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'processed')
          }
        } else if (domainEvent.type === 'payment.failed') {
          if (domainEvent.orderId) {
            await processPaymentFailure(scope, {
              orderId: domainEvent.orderId,
              provider: domainEvent.provider,
              providerPaymentId: domainEvent.providerPaymentId,
              reason: domainEvent.reason,
              failedAt: domainEvent.occurredAt,
            })
            await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'processed')
          }
        } else if (domainEvent.type === 'refund.processed') {
          if (domainEvent.orderId) {
            await fulfillRefund(scope, {
              orderId: domainEvent.orderId,
              providerRefundId: domainEvent.providerRefundId,
              amount: domainEvent.amount.amount,
              currency: domainEvent.amount.currency,
            })
            await webhooks.updateWebhookEventStatus(scope, recorded.event.id, 'processed')
          }
        }
      }

      return recorded
    })

    return NextResponse.json(
      {
        received: true,
        eventId: recordResult.event.id,
        isDuplicate: recordResult.isDuplicate,
      },
      { status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
