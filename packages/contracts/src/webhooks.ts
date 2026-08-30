/**
 * Webhook Event domain contracts (Slice 5 §5.7).
 *
 * Responsibilities:
 * - Data transfer contracts and Zod schemas for webhook events ingestion and idempotency.
 */
import { z } from 'zod'

import { workspaceIdSchema } from './identifiers.js'
import { paymentProviderSchema } from './payments.js'

export const WEBHOOK_EVENT_STATUSES = [
  'received',
  'processing',
  'processed',
  'failed',
  'ignored',
] as const

export const webhookEventStatusSchema = z.enum(WEBHOOK_EVENT_STATUSES)

export type WebhookEventStatus = z.infer<typeof webhookEventStatusSchema>

export const webhookEventRecordSchema = z.object({
  id: z.uuid(),
  workspaceId: workspaceIdSchema,
  provider: paymentProviderSchema,
  providerEventId: z.string().min(1),
  eventType: z.string().min(1),
  status: webhookEventStatusSchema,
  signatureVerified: z.boolean(),
  payload: z.record(z.string(), z.unknown()),
  error: z.string().nullable(),
  retryCount: z.number().int().min(0),
  nextRetryAt: z.date().nullable(),
  processedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type WebhookEventRecord = z.infer<typeof webhookEventRecordSchema>

export const recordWebhookEventInputSchema = z.object({
  provider: paymentProviderSchema,
  providerEventId: z.string().min(1),
  eventType: z.string().min(1),
  signatureVerified: z.boolean(),
  payload: z.record(z.string(), z.unknown()),
})

export type RecordWebhookEventInput = z.infer<typeof recordWebhookEventInputSchema>
