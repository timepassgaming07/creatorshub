/**
 * Jobs contracts — schemas, types, and backoff calculations for asynchronous work queue (ADR-0009).
 *
 * Responsibilities:
 * 1. Define job statuses, enqueue input schemas, and execution record types.
 * 2. Pure bounded exponential backoff calculator with jitter to prevent stampedes.
 *
 * Dependencies: zod, ./identifiers.js.
 */
import { z } from 'zod'

import { type JobId, workspaceIdSchema } from './identifiers.js'

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const jobStatusSchema = z.enum(JOB_STATUSES)

export const enqueueJobInputSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  queue: z.string().min(1).max(64),
  type: z.string().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
  runAfter: z.date().optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  idempotencyKey: z.string().min(1).max(255).optional(),
})

export type EnqueueJobInput = z.infer<typeof enqueueJobInputSchema>

export type JobRecord = {
  readonly id: JobId
  readonly workspaceId: string | null
  readonly queue: string
  readonly type: string
  readonly payload: Record<string, unknown>
  readonly status: JobStatus
  readonly runAfter: Date
  readonly attempts: number
  readonly maxAttempts: number
  readonly lockedAt: Date | null
  readonly lockedBy: string | null
  readonly lastError: string | null
  readonly idempotencyKey: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type BackoffOptions = {
  /** Base delay in milliseconds for attempt 1 (default: 1000ms = 1s). */
  readonly baseMs?: number
  /** Maximum delay cap in milliseconds (default: 300,000ms = 5 minutes). */
  readonly maxMs?: number
  /** Exponential growth multiplier (default: 2). */
  readonly factor?: number
  /** Random jitter ratio between 0 and 1 to prevent thundering herd (default: 0.2). */
  readonly jitterRatio?: number
}

/**
 * Calculates exponential backoff with jitter for a failed job attempt.
 *
 * formula: min(maxMs, baseMs * factor^(attempt - 1)) +/- jitter
 */
export function calculateExponentialBackoff(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 1000
  const maxMs = options.maxMs ?? 300_000
  const factor = options.factor ?? 2
  const jitterRatio = options.jitterRatio ?? 0.2

  const safeAttempt = Math.max(1, attempt)
  const exponential = baseMs * Math.pow(factor, safeAttempt - 1)
  const capped = Math.min(maxMs, exponential)

  // Apply deterministic or bounded random jitter
  const jitterRange = capped * jitterRatio
  const delta = (Math.random() * 2 - 1) * jitterRange
  return Math.max(baseMs, Math.round(capped + delta))
}
