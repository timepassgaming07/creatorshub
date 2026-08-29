/**
 * Idempotency contracts and canonical serialization (ADR-0004, ADR-0009).
 *
 * Responsibilities:
 * 1. Define standard idempotency error classes per IETF Idempotency-Key specification.
 * 2. Deterministic JSON canonicalization for request hashing.
 * 3. Zod schemas and types for idempotency scopes and records.
 *
 * Dependencies: zod, ./identifiers.js.
 */
import { z } from 'zod'

import { workspaceIdSchema } from './identifiers.js'

export class IdempotencyConflictError extends Error {
  constructor(message = 'Idempotency key was previously used with a different request payload.') {
    super(message)
    this.name = 'IdempotencyConflictError'
  }
}

export class IdempotencyInProgressError extends Error {
  constructor(message = 'A request with this idempotency key is currently being processed.') {
    super(message)
    this.name = 'IdempotencyInProgressError'
  }
}

/**
 * Produces a deterministic string representation of any JSON-serializable value
 * with sorted keys for consistent hashing across different serialization orders.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',')}}`
}

export const idempotencyScopeSchema = z.string().min(1).max(128)
export const idempotencyKeyStringSchema = z.string().min(1).max(255)

export const idempotencyOptionsSchema = z.object({
  workspaceId: workspaceIdSchema.optional(),
  scope: idempotencyScopeSchema,
  key: idempotencyKeyStringSchema,
  ttlSeconds: z.number().int().positive().optional(),
})

export type IdempotencyOptions = z.infer<typeof idempotencyOptionsSchema>

export type IdempotencyRecord = {
  readonly id: string
  readonly workspaceId: string | null
  readonly scope: string
  readonly key: string
  readonly requestHash: string
  readonly responseStatus: number | null
  readonly responseBody: unknown
  readonly createdAt: Date
  readonly expiresAt: Date
}
