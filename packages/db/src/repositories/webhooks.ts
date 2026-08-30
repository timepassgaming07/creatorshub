/**
 * Webhook Events Repository (Slice 5 §5.7).
 *
 * Responsibilities:
 * - Persist inbound webhook payloads with provider signature verification status.
 * - Idempotency and deduplication on `(workspace_id, provider, provider_event_id)`.
 * - Exactly-once processing state tracking (`received`, `processing`, `processed`, `failed`, `ignored`).
 * - Retry scheduling and error tracking.
 * - Strict multi-tenant isolation with tenant-scoped transactions.
 */
import type { PaymentProviderType } from '@creatorhub/contracts'
import { and, desc, eq, sql } from 'drizzle-orm'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import {
  webhookEvents,
  type NewWebhookEventRecord,
  type WebhookEventRecord,
} from '../schema/webhooks.js'

export type RecordWebhookEventParams = {
  readonly provider: PaymentProviderType
  readonly providerEventId: string
  readonly eventType: string
  readonly signatureVerified: boolean
  readonly payload: Record<string, unknown>
}

export type RecordWebhookEventResult = {
  readonly event: WebhookEventRecord
  readonly isDuplicate: boolean
}

export type UpdateWebhookEventStatusOptions = {
  readonly error?: string | null
  readonly nextRetryAt?: Date | null
  readonly processedAt?: Date | null
  readonly incrementRetry?: boolean
}

/**
 * Records an inbound webhook event with deduplication.
 * Returns the existing event if already received, ensuring idempotent ingestion.
 */
export async function recordWebhookEvent(
  scope: RepositoryScope,
  params: RecordWebhookEventParams,
): Promise<RecordWebhookEventResult> {
  // Check if already exists for this tenant
  const existing = await findWebhookEventByProviderEventId(
    scope,
    params.provider,
    params.providerEventId,
  )

  if (existing) {
    return {
      event: existing,
      isDuplicate: true,
    }
  }

  const [created] = await scope.tx
    .insert(webhookEvents)
    .values(
      insertValues<NewWebhookEventRecord>(scope, {
        provider: params.provider,
        providerEventId: params.providerEventId,
        eventType: params.eventType,
        status: 'received',
        signatureVerified: params.signatureVerified,
        payload: params.payload,
        retryCount: 0,
      }),
    )
    .onConflictDoNothing({
      target: [webhookEvents.workspaceId, webhookEvents.provider, webhookEvents.providerEventId],
    })
    .returning()

  if (!created) {
    // Race condition: another thread inserted between check and insert
    const fetched = await findWebhookEventByProviderEventId(
      scope,
      params.provider,
      params.providerEventId,
    )
    if (!fetched) {
      throw new Error(`Failed to insert or find webhook event: ${params.providerEventId}`)
    }
    return {
      event: fetched,
      isDuplicate: true,
    }
  }

  return {
    event: created,
    isDuplicate: false,
  }
}

/**
 * Finds a webhook event by its provider and provider event ID within the tenant scope.
 */
export async function findWebhookEventByProviderEventId(
  scope: RepositoryScope,
  provider: PaymentProviderType,
  providerEventId: string,
): Promise<WebhookEventRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(webhookEvents)
    .where(
      and(
        scoped(scope, webhookEvents),
        eq(webhookEvents.provider, provider),
        eq(webhookEvents.providerEventId, providerEventId),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * Finds a webhook event by its internal primary key ID within the tenant scope.
 */
export async function findWebhookEventById(
  scope: RepositoryScope,
  id: string,
): Promise<WebhookEventRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(webhookEvents)
    .where(and(scoped(scope, webhookEvents), eq(webhookEvents.id, id)))
    .limit(1)

  return row ?? null
}

/**
 * Updates the processing status, error, and retry metadata of a webhook event.
 */
export async function updateWebhookEventStatus(
  scope: RepositoryScope,
  id: string,
  status: 'received' | 'processing' | 'processed' | 'failed' | 'ignored',
  options: UpdateWebhookEventStatusOptions = {},
): Promise<WebhookEventRecord> {
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  }

  if (options.error !== undefined) {
    updateData['error'] = options.error
  }
  if (options.nextRetryAt !== undefined) {
    updateData['nextRetryAt'] = options.nextRetryAt
  }
  if (options.processedAt !== undefined) {
    updateData['processedAt'] = options.processedAt
  }
  if (options.incrementRetry) {
    updateData['retryCount'] = sql`${webhookEvents.retryCount} + 1`
  }

  const [updated] = await scope.tx
    .update(webhookEvents)
    .set(updateData)
    .where(and(scoped(scope, webhookEvents), eq(webhookEvents.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Webhook event ${id} not found for update.`)
  }

  return updated
}

/**
 * Lists webhook events for a tenant by status.
 */
export async function listWebhookEvents(
  scope: RepositoryScope,
  options: {
    status?: 'received' | 'processing' | 'processed' | 'failed' | 'ignored'
    limit?: number
  } = {},
): Promise<WebhookEventRecord[]> {
  const conditions = [scoped(scope, webhookEvents)]

  if (options.status) {
    conditions.push(eq(webhookEvents.status, options.status))
  }

  return scope.tx
    .select()
    .from(webhookEvents)
    .where(and(...conditions))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(options.limit ?? 50)
}
