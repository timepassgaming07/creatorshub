/**
 * Postgres-backed jobs repository and worker engine (ADR-0009).
 *
 * Responsibilities:
 * 1. Atomic job enqueueing inside database transactions.
 * 2. Concurrent job claiming with `FOR UPDATE SKIP LOCKED`.
 * 3. Exponential backoff retry with jitter on failure.
 * 4. Automatic dead-letter transition on exhausted retries or missing handler.
 *
 * Dependencies: @creatorhub/contracts, drizzle-orm, schema.
 */
import {
  type BackoffOptions,
  type EnqueueJobInput,
  calculateExponentialBackoff,
} from '@creatorhub/contracts'
import { eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues } from '../repository.js'
import { type JobTableRecord, type NewJobTableRecord, jobs } from '../schema/index.js'

export type JobHandler = (job: JobTableRecord) => Promise<void>
export type JobHandlerMap = Readonly<Record<string, JobHandler>>

export type WorkerBatchResult = {
  readonly processed: number
  readonly succeeded: number
  readonly failed: number
  readonly dead: number
}

/**
 * Enqueues a job inside the active database transaction.
 */
export async function enqueueJob(
  scope: RepositoryScope,
  input: EnqueueJobInput,
): Promise<JobTableRecord> {
  const [record] = await scope.tx
    .insert(jobs)
    .values(
      insertValues<NewJobTableRecord>(scope, {
        queue: input.queue,
        type: input.type,
        payload: input.payload,
        status: 'queued',
        runAfter: input.runAfter ?? new Date(Date.now() - 1000),
        maxAttempts: input.maxAttempts ?? 5,
        attempts: 0,
        idempotencyKey: input.idempotencyKey ?? null,
      }),
    )
    .returning()

  if (!record) {
    throw new Error(`Failed to enqueue job ${input.type} on queue ${input.queue}`)
  }

  return record
}

/**
 * Concurrently claims a batch of queued jobs whose `run_after <= now()` using `FOR UPDATE SKIP LOCKED`.
 * Transitions claimed jobs to status='running' and sets `locked_by` and `locked_at`.
 */
export async function claimJobs(
  scope: RepositoryScope,
  queue: string,
  workerId: string,
  limit = 10,
): Promise<JobTableRecord[]> {
  const query = sql`
    WITH claimable AS (
      SELECT id
      FROM ${jobs}
      WHERE ${jobs.queue} = ${queue}
        AND ${jobs.status} = 'queued'
        AND ${jobs.runAfter} <= now()
      ORDER BY ${jobs.runAfter} ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${jobs}
    SET status = 'running',
        locked_at = now(),
        locked_by = ${workerId},
        attempts = ${jobs.attempts} + 1,
        updated_at = now()
    FROM claimable
    WHERE ${jobs.id} = claimable.id
    RETURNING ${jobs.id} AS id,
              ${jobs.workspaceId} AS "workspaceId",
              ${jobs.queue} AS queue,
              ${jobs.type} AS type,
              ${jobs.payload} AS payload,
              ${jobs.status} AS status,
              ${jobs.runAfter} AS "runAfter",
              ${jobs.attempts} AS attempts,
              ${jobs.maxAttempts} AS "maxAttempts",
              ${jobs.lockedAt} AS "lockedAt",
              ${jobs.lockedBy} AS "lockedBy",
              ${jobs.lastError} AS "lastError",
              ${jobs.idempotencyKey} AS "idempotencyKey",
              ${jobs.createdAt} AS "createdAt",
              ${jobs.updatedAt} AS "updatedAt"
  `

  const result = await scope.tx.execute<JobTableRecord>(query)
  return Array.from(result)
}

/**
 * Marks a job as completed successfully.
 */
export async function completeJob(scope: RepositoryScope, jobId: string): Promise<void> {
  await scope.tx
    .update(jobs)
    .set({
      status: 'succeeded',
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
}

/**
 * Fails a job attempt. If attempts >= maxAttempts, dead-letters the job;
 * otherwise reschedules with exponential backoff and jitter.
 */
export async function failJob(
  scope: RepositoryScope,
  job: Pick<JobTableRecord, 'id' | 'attempts' | 'maxAttempts'>,
  errorMessage: string,
  backoffOptions?: BackoffOptions,
): Promise<{ status: 'queued' | 'dead'; nextRunAfter: Date | null }> {
  if (job.attempts >= job.maxAttempts) {
    await scope.tx
      .update(jobs)
      .set({
        status: 'dead',
        lastError: errorMessage,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id))

    return { status: 'dead', nextRunAfter: null }
  }

  const delayMs = calculateExponentialBackoff(job.attempts, backoffOptions)
  const nextRunAfter = new Date(Date.now() + delayMs)

  await scope.tx
    .update(jobs)
    .set({
      status: 'queued',
      lastError: errorMessage,
      runAfter: nextRunAfter,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id))

  return { status: 'queued', nextRunAfter }
}

/**
 * Runs a single worker pass over the given queue: claims jobs, executes handlers,
 * and updates job status with backoff or dead-letter transitions.
 */
export async function runWorkerBatch(
  scope: RepositoryScope,
  queue: string,
  workerId: string,
  handlers: JobHandlerMap,
  limit = 10,
  backoffOptions?: BackoffOptions,
): Promise<WorkerBatchResult> {
  const claimed = await claimJobs(scope, queue, workerId, limit)
  let succeeded = 0
  let failed = 0
  let dead = 0

  for (const job of claimed) {
    const handler = handlers[job.type]

    if (!handler) {
      // Deterministic failure: missing handler -> dead letter immediately
      await failJob(
        scope,
        { id: job.id, attempts: job.maxAttempts, maxAttempts: job.maxAttempts },
        `No handler registered for job type '${job.type}'`,
        backoffOptions,
      )
      dead += 1
      continue
    }

    try {
      await handler(job)
      await completeJob(scope, job.id)
      succeeded += 1
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const res = await failJob(scope, job, msg, backoffOptions)
      if (res.status === 'dead') {
        dead += 1
      } else {
        failed += 1
      }
    }
  }

  return {
    processed: claimed.length,
    succeeded,
    failed,
    dead,
  }
}
