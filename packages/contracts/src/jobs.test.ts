/**
 * Unit tests for job contracts, backoff calculations, and schema validation.
 */
import { describe, expect, it } from 'vitest'

import { calculateExponentialBackoff, enqueueJobInputSchema, jobId, jobIdSchema } from './index.js'

describe('Job Contracts and Backoff', () => {
  it('validates valid UUIDv7 job id', () => {
    const valid = '018f3a55-6b5c-7e82-8411-2e63973fa934'
    expect(jobId(valid)).toBe(valid)
    expect(jobIdSchema.parse(valid)).toBe(valid)
  })

  it('rejects malformed job id', () => {
    expect(() => jobId('invalid-id')).toThrow()
    expect(() => jobIdSchema.parse('invalid-id')).toThrow()
  })

  it('validates enqueue job input schema', () => {
    const parsed = enqueueJobInputSchema.parse({
      queue: 'default',
      type: 'send_email',
      payload: { to: 'creator@example.com' },
      maxAttempts: 3,
    })

    expect(parsed.queue).toBe('default')
    expect(parsed.type).toBe('send_email')
    expect(parsed.maxAttempts).toBe(3)
  })

  it('calculates exponential backoff within expected bounds and jitter', () => {
    // Attempt 1: ~1000ms
    const b1 = calculateExponentialBackoff(1, {
      baseMs: 1000,
      maxMs: 10_000,
      factor: 2,
      jitterRatio: 0.1,
    })
    expect(b1).toBeGreaterThanOrEqual(900)
    expect(b1).toBeLessThanOrEqual(1100)

    // Attempt 2: ~2000ms
    const b2 = calculateExponentialBackoff(2, {
      baseMs: 1000,
      maxMs: 10_000,
      factor: 2,
      jitterRatio: 0.1,
    })
    expect(b2).toBeGreaterThanOrEqual(1800)
    expect(b2).toBeLessThanOrEqual(2200)

    // Attempt 3: ~4000ms
    const b3 = calculateExponentialBackoff(3, {
      baseMs: 1000,
      maxMs: 10_000,
      factor: 2,
      jitterRatio: 0.1,
    })
    expect(b3).toBeGreaterThanOrEqual(3600)
    expect(b3).toBeLessThanOrEqual(4400)

    // High attempt capped at maxMs
    const b10 = calculateExponentialBackoff(10, {
      baseMs: 1000,
      maxMs: 10_000,
      factor: 2,
      jitterRatio: 0.1,
    })
    expect(b10).toBeGreaterThanOrEqual(9000)
    expect(b10).toBeLessThanOrEqual(11_000)
  })
})
