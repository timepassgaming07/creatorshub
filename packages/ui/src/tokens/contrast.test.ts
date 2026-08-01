import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AA_NON_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  extractTokens,
  parseOklch,
  type Oklch,
} from './contrast.js'

/**
 * Token contrast verification.
 *
 * Reads the real tokens.css so this cannot drift from what ships. Axe covers what
 * a page renders; this covers every token pair whether or not a component uses it
 * yet. Both are needed: the `caution` token shipped at 4.25:1 precisely because
 * nothing rendered it, so axe had nothing to check.
 */

// Resolved from the package root rather than import.meta.url: these tests run in
// the jsdom environment, where import.meta.url is an http URL, not a file one.
const css = readFileSync(resolve(process.cwd(), 'src/tokens/tokens.css'), 'utf8')

/** Tokens are declared once for light and again inside the dark override block. */
const darkBlockStart = css.indexOf("[data-theme='dark']")
const lightTokens = extractTokens(css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)')))
const darkTokens = extractTokens(css.slice(darkBlockStart))

function colour(tokens: Map<string, string>, name: string): Oklch {
  const raw = tokens.get(name)
  if (raw === undefined) throw new Error(`Token ${name} is not defined.`)

  const parsed = parseOklch(raw)
  if (parsed === null) throw new Error(`Token ${name} is not an oklch value: ${raw}`)

  return parsed
}

/**
 * Every surface a foreground can land on.
 *
 * Tested exhaustively rather than in hand-picked pairs. The worst case differs
 * per theme — in light mode it is the darkest surface, in dark mode the lightest —
 * and hand-picking is how `content-tertiary` passed on `surface-base` while
 * failing on `surface-sunken`.
 */
const SURFACES = ['--surface-base', '--surface-raised', '--surface-sunken'] as const

/** Foreground tokens that carry normal-size text. */
const TEXT_FOREGROUNDS = [
  '--content-primary',
  '--content-secondary',
  '--content-tertiary',
  '--accent',
  '--positive',
  '--caution',
  '--critical',
  '--info',
] as const

/**
 * Foregrounds that identify a user interface component or its state, which
 * WCAG 1.4.11 requires to meet 3:1.
 *
 * `--border-default` and `--border-subtle` are deliberately absent. They are
 * decorative separation — card edges and table rules — which the success
 * criterion explicitly exempts. That is precisely why `--border-control` exists
 * as a separate token: an input outline is not decorative, and one token serving
 * both roles cannot satisfy both.
 */
const NON_TEXT_FOREGROUNDS = ['--border-control', '--border-strong'] as const

const TEXT_PAIRS = TEXT_FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const))
const NON_TEXT_PAIRS = NON_TEXT_FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const))

describe.each([
  ['light', lightTokens],
  ['dark', darkTokens],
])('%s theme', (themeName, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s meets AA for normal text', (foreground, background) => {
    const ratio = contrastRatio(colour(tokens, foreground), colour(tokens, background))
    expect(
      ratio,
      `${foreground} on ${background} in ${themeName} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it.each(NON_TEXT_PAIRS)('%s on %s meets AA for non-text', (foreground, background) => {
    const ratio = contrastRatio(colour(tokens, foreground), colour(tokens, background))
    expect(
      ratio,
      `${foreground} on ${background} in ${themeName} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NON_TEXT)
  })

  it('content-inverse is readable on the accent it sits on', () => {
    const ratio = contrastRatio(colour(tokens, '--accent-content'), colour(tokens, '--accent'))
    expect(ratio, `accent-content on accent in ${themeName}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('keeps a visible step between the three content levels', () => {
    // Tertiary must be subtler than secondary, or the hierarchy the tokens claim
    // to encode does not exist. Raising tertiary for contrast must not flatten it.
    const base = colour(tokens, '--surface-base')
    const primary = contrastRatio(colour(tokens, '--content-primary'), base)
    const secondary = contrastRatio(colour(tokens, '--content-secondary'), base)
    const tertiary = contrastRatio(colour(tokens, '--content-tertiary'), base)

    expect(primary).toBeGreaterThan(secondary)
    expect(secondary).toBeGreaterThan(tertiary)
  })
})

describe('contrast maths', () => {
  it('computes the known ratio for black on white', () => {
    const white = parseOklch('oklch(100% 0 0)')
    const black = parseOklch('oklch(0% 0 0)')
    expect(white).not.toBeNull()
    expect(black).not.toBeNull()
    expect(contrastRatio(white!, black!)).toBeCloseTo(21, 1)
  })

  it('gives a ratio of 1 for a colour against itself', () => {
    const colourValue = parseOklch('oklch(50% 0.1 250)')
    expect(contrastRatio(colourValue!, colourValue!)).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    const a = parseOklch('oklch(23% 0.008 75)')!
    const b = parseOklch('oklch(99% 0.003 85)')!
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
  })

  it('returns null for a value that is not oklch', () => {
    expect(parseOklch('#ffffff')).toBeNull()
    expect(parseOklch('rgb(0 0 0)')).toBeNull()
  })
})

describe('token file integrity', () => {
  it('defines every colour token in both themes', () => {
    const colourTokens = [...TEXT_FOREGROUNDS, ...NON_TEXT_FOREGROUNDS, ...SURFACES]
    for (const token of new Set(colourTokens)) {
      expect(lightTokens.has(token), `${token} missing from light`).toBe(true)
      expect(darkTokens.has(token), `${token} missing from dark`).toBe(true)
    }
  })

  it('uses no raw hex colours', () => {
    // A hex value here is a colour outside the semantic system.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
