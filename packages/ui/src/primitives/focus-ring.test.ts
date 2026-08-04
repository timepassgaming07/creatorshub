import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Focus is defined once, globally.
 *
 * CLAUDE.md §5c and the design system both say the ring lives in the `@layer
 * base` block of theme.css and nowhere else. A per-component ring is not a
 * cosmetic inconsistency: it is how one product ends up with two focus
 * treatments, and how a component quietly ships with none at all after somebody
 * removes an outline to fix a layout.
 *
 * Read from the source rather than the rendered output, because a rendered
 * assertion only covers the states a test happened to render. A ring declared on
 * a variant nothing exercises would pass every behavioural test in the package.
 */

const PRIMITIVES_DIR = resolve(process.cwd(), 'src/primitives')

const sourceFiles = readdirSync(PRIMITIVES_DIR)
  .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
  .map((name) => [name, readFileSync(resolve(PRIMITIVES_DIR, name), 'utf8')] as const)

/**
 * Patterns that would either draw a second ring or remove the global one.
 *
 * `focus-within:border-*` is deliberately absent: moving a wrapper's border when
 * the field inside it takes focus is a border change, not a ring, and the ring
 * still comes from theme.css.
 */
const FORBIDDEN = [
  { pattern: /focus-visible:(?:ring|outline|shadow)/, why: 'declares its own focus-visible ring' },
  { pattern: /focus:(?:ring|outline|shadow)/, why: 'declares its own focus ring' },
  { pattern: /focus-within:(?:ring|outline|shadow)/, why: 'declares its own focus-within ring' },
] as const

describe('focus styling stays in theme.css', () => {
  it('finds the primitive sources', () => {
    // Guards the guard. If the directory is renamed, the loop below silently
    // checks nothing and passes forever.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(6)
  })

  it.each(sourceFiles)('%s declares no focus ring of its own', (name, source) => {
    for (const { pattern, why } of FORBIDDEN) {
      expect(pattern.test(source), `${name} ${why}`).toBe(false)
    }
  })

  it.each(sourceFiles)('%s does not remove focus styling wholesale', (name, source) => {
    // `outline-none` on the element that receives focus removes the global ring.
    // It is legitimate on an inner input whose wrapper carries the visible
    // boundary, so this checks for the unqualified utility on a focus state.
    expect(
      /focus(?:-visible|-within)?:outline-none/.test(source),
      `${name} removes its focus ring`,
    ).toBe(false)
  })

  it('defines the ring exactly once, in the base layer', () => {
    const theme = readFileSync(resolve(process.cwd(), 'src/tokens/theme.css'), 'utf8')

    expect(theme).toContain('*:focus-visible')
    expect(theme).toContain('outline: var(--focus-ring-width)')
  })
})
