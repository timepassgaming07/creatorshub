import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { POSTGRES_IMAGE } from './postgres-image.js'

/**
 * Keeps the integration test image and the compose image identical.
 *
 * Compose cannot import TypeScript, so the tag is necessarily written twice. If
 * the two drift, a migration can pass locally and fail in CI, and the cause is
 * invisible in the failure. Resolved from the package root the same way
 * packages/ui reads its real tokens.css.
 */
const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.yml'), 'utf8')

describe('POSTGRES_IMAGE', () => {
  it('matches the image pinned in docker-compose.yml', () => {
    const match = /^\s*image:\s*(\S+)\s*$/m.exec(compose)

    expect(match?.[1]).toBe(POSTGRES_IMAGE)
  })

  it('pins an exact patch version', () => {
    // `postgres:18` would silently move to a new patch release, which defeats
    // the point of pinning at all.
    expect(POSTGRES_IMAGE).toMatch(/^postgres:\d+\.\d+-\w+$/)
  })

  it('is Postgres 18 or later, because uuidv7() is native there', () => {
    // The data model requires UUIDv7 primary keys. Below 18 that means an
    // extension or generating them in application code.
    const major = Number(/^postgres:(\d+)\./.exec(POSTGRES_IMAGE)?.[1])

    expect(major).toBeGreaterThanOrEqual(18)
  })
})
