/**
 * Guards the drizzle migration journal against silently skipped migrations.
 *
 * Drizzle applies a migration only when its journal `when` is greater than the
 * `created_at` of the most recent row in `drizzle.__drizzle_migrations`. A new
 * entry stamped earlier than any existing entry is therefore never applied to
 * a database that already ran the older one, and the migrate command still
 * reports success. That is how 0026 shipped without its column existing.
 *
 * Entries 0015 to 0025 were stamped below 0014. A fresh database applies them
 * anyway, so they are grandfathered; everything from 0026 on must exceed every
 * entry before it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type JournalEntry = { readonly idx: number; readonly when: number; readonly tag: string }

const journal = JSON.parse(
  readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'),
) as { readonly entries: readonly JournalEntry[] }

const FIRST_ENFORCED_IDX = 26

describe('migration journal', () => {
  it('stamps every new migration later than every migration before it', () => {
    const late = journal.entries
      .filter((entry) => entry.idx >= FIRST_ENFORCED_IDX)
      .filter((entry) => {
        const earlier = journal.entries.filter((other) => other.idx < entry.idx)
        return earlier.some((other) => other.when >= entry.when)
      })
      .map((entry) => entry.tag)

    expect(late).toEqual([])
  })

  it('has a SQL file for every journal entry', () => {
    const missing = journal.entries.filter((entry) => {
      try {
        readFileSync(new URL(`../migrations/${entry.tag}.sql`, import.meta.url))
        return false
      } catch {
        return true
      }
    })

    expect(missing.map((entry) => entry.tag)).toEqual([])
  })
})
