/**
 * Idempotency repository and execution wrapper (ADR-0004, ADR-0009).
 *
 * Responsibilities:
 * 1. Enforce atomic request deduplication across HTTP routes and business operations.
 * 2. Return previously cached response without re-executing for identical keys.
 * 3. Reject mismatching payloads with IdempotencyConflictError.
 * 4. Reject in-flight concurrent attempts with IdempotencyInProgressError.
 *
 * Dependencies: @creatorhub/contracts, node:crypto, drizzle-orm, schema.
 */
import { createHash } from 'node:crypto'

import {
  IdempotencyConflictError,
  IdempotencyInProgressError,
  canonicalizeJson,
} from '@creatorhub/contracts'
import { and, eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues } from '../repository.js'
import { type NewIdempotencyKeyRecord, idempotencyKeys } from '../schema/index.js'

export type IdempotencyAcquireResult =
  | { readonly state: 'new'; readonly recordId: string }
  | { readonly state: 'completed'; readonly status: number; readonly body: unknown }
  | { readonly state: 'in_progress' }

export type IdempotencyExecutionResult<T> = {
  readonly replayed: boolean
  readonly status: number
  readonly body: T
}

/**
 * Computes a SHA-256 hash of a normalized/canonicalized request payload.
 */
export function hashPayload(payload: unknown): string {
  const canonical = canonicalizeJson(payload)
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Attempts to claim or reserve an idempotency key.
 */
export async function acquireIdempotencyKey(
  scope: RepositoryScope,
  params: {
    readonly scope: string
    readonly key: string
    readonly requestHash: string
    readonly ttlSeconds?: number | undefined
  },
): Promise<IdempotencyAcquireResult> {
  const ttlSeconds = params.ttlSeconds ?? 86_400
  const now = new Date()

  const [existing] = await scope.tx
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.scope, params.scope), eq(idempotencyKeys.key, params.key)))

  if (existing) {
    const isExpired = existing.expiresAt.getTime() <= now.getTime()

    if (!isExpired) {
      // Check for payload hash mismatch
      if (existing.requestHash !== params.requestHash) {
        throw new IdempotencyConflictError()
      }

      // If completed, return cached response
      if (existing.responseStatus !== null) {
        return {
          state: 'completed',
          status: existing.responseStatus,
          body: existing.responseBody,
        }
      }

      // If responseStatus is null, request is still in-flight
      return { state: 'in_progress' }
    }

    // If expired, delete the old row so we can acquire a fresh reservation
    await scope.tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id))
  }

  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

  const [created] = await scope.tx
    .insert(idempotencyKeys)
    .values(
      insertValues<NewIdempotencyKeyRecord>(scope, {
        scope: params.scope,
        key: params.key,
        requestHash: params.requestHash,
        responseStatus: null,
        responseBody: null,
        expiresAt,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to acquire idempotency key '${params.key}' for scope '${params.scope}'`)
  }

  return { state: 'new', recordId: created.id }
}

/**
 * Saves the response status and body for a completed idempotent operation.
 */
export async function recordIdempotencyResponse(
  scope: RepositoryScope,
  params: {
    readonly scope: string
    readonly key: string
    readonly status: number
    readonly body: unknown
  },
): Promise<void> {
  await scope.tx
    .update(idempotencyKeys)
    .set({
      responseStatus: params.status,
      responseBody: params.body,
    })
    .where(and(eq(idempotencyKeys.scope, params.scope), eq(idempotencyKeys.key, params.key)))
}

/**
 * Releases an in-flight idempotency key on failure so subsequent retries can proceed.
 */
export async function releaseIdempotencyKey(
  scope: RepositoryScope,
  params: {
    readonly scope: string
    readonly key: string
  },
): Promise<void> {
  await scope.tx
    .delete(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, params.scope),
        eq(idempotencyKeys.key, params.key),
        sql`${idempotencyKeys.responseStatus} IS NULL`,
      ),
    )
}

/**
 * Executes an operation with full idempotency guarantee:
 * - If key has been completed with the same payload: returns cached response without executing.
 * - If key is currently in progress: throws IdempotencyInProgressError.
 * - If key was previously used with a different payload: throws IdempotencyConflictError.
 * - If new: executes the operation and caches the response status & body.
 */
export async function withIdempotency<T>(
  scope: RepositoryScope,
  options: {
    readonly scope: string
    readonly key: string
    readonly payload: unknown
    readonly ttlSeconds?: number | undefined
  },
  execute: () => Promise<{ status: number; body: T }>,
): Promise<IdempotencyExecutionResult<T>> {
  const requestHash = hashPayload(options.payload)

  const acquire = await acquireIdempotencyKey(scope, {
    scope: options.scope,
    key: options.key,
    requestHash,
    ttlSeconds: options.ttlSeconds,
  })

  if (acquire.state === 'completed') {
    return {
      replayed: true,
      status: acquire.status,
      body: acquire.body as T,
    }
  }

  if (acquire.state === 'in_progress') {
    throw new IdempotencyInProgressError()
  }

  try {
    const result = await execute()
    await recordIdempotencyResponse(scope, {
      scope: options.scope,
      key: options.key,
      status: result.status,
      body: result.body,
    })
    return {
      replayed: false,
      status: result.status,
      body: result.body,
    }
  } catch (error: unknown) {
    await releaseIdempotencyKey(scope, {
      scope: options.scope,
      key: options.key,
    })
    throw error
  }
}
