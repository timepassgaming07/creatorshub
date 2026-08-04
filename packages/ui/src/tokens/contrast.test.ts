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

/**
 * Dark is declared twice: once for the system preference and once for the
 * explicit override. Both are read, because a token declared in one and omitted
 * from the other is invisible to a check that reads only one of them. That is
 * exactly how `--border-control` kept its light value on a dark surface for every
 * user who had never touched a theme toggle.
 */
const mediaBlockStart = css.indexOf('@media (prefers-color-scheme: dark)')
const explicitBlockStart = css.indexOf("[data-theme='dark']")
const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)')

const lightTokens = extractTokens(css.slice(0, mediaBlockStart))
const systemDarkTokens = extractTokens(css.slice(mediaBlockStart, explicitBlockStart))
const explicitDarkTokens = extractTokens(css.slice(explicitBlockStart, reducedMotionStart))

/**
 * What a browser actually resolves for a user on system dark: the media block
 * over `:root`, so an omitted token silently keeps its light value. Testing the
 * resolved map rather than the block in isolation is what makes an omission show
 * up as a contrast failure instead of as a missing key nobody asserted on.
 */
const resolvedSystemDark = new Map([...lightTokens, ...systemDarkTokens])
const resolvedExplicitDark = new Map([...lightTokens, ...explicitDarkTokens])

const THEMES = [
  ['light', lightTokens],
  ['system dark', resolvedSystemDark],
  ['explicit dark', resolvedExplicitDark],
] as const

function colour(tokens: ReadonlyMap<string, string>, name: string): Oklch {
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
 *
 * `--surface-overlay` is here because Dialog and the Select listbox sit on it.
 * Before those components existed nothing rendered it, which is the condition
 * under which a token goes unverified.
 */
const SURFACES = [
  '--surface-base',
  '--surface-raised',
  '--surface-overlay',
  '--surface-sunken',
] as const

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

/**
 * A semantic colour on its own tinted background.
 *
 * Toast, Banner, and the Input error state all pair these, and nothing did
 * before, so no pairing here had ever been checked. The tinted background is the
 * hard case: a subtle tint is close in lightness to the surface it replaces, so
 * a foreground tuned against `--surface-base` can fail against it.
 */
const SUBTLE_PAIRS = [
  ['--accent', '--accent-subtle'],
  ['--positive', '--positive-subtle'],
  ['--caution', '--caution-subtle'],
  ['--critical', '--critical-subtle'],
  ['--info', '--info-subtle'],
] as const

/**
 * Text that sits on a filled semantic background rather than beside it. The
 * primary Button is the reason this pairing exists.
 */
const FILLED_PAIRS = [['--accent-content', '--accent']] as const

/**
 * A tinted background still has to be distinguishable from the surface behind
 * it, or the region it marks is invisible. Only 3:1 applies: this is a graphical
 * boundary, not text.
 */
const SUBTLE_BACKGROUNDS = [
  '--accent-subtle',
  '--positive-subtle',
  '--caution-subtle',
  '--critical-subtle',
  '--info-subtle',
] as const

const TEXT_PAIRS = TEXT_FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const))
const NON_TEXT_PAIRS = NON_TEXT_FOREGROUNDS.flatMap((fg) => SURFACES.map((bg) => [fg, bg] as const))

describe.each(THEMES)('%s theme', (themeName, tokens) => {
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

  it.each(SUBTLE_PAIRS)('%s reads as text on %s', (foreground, background) => {
    const ratio = contrastRatio(colour(tokens, foreground), colour(tokens, background))
    expect(
      ratio,
      `${foreground} on ${background} in ${themeName} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it.each(FILLED_PAIRS)('%s reads as text on %s', (foreground, background) => {
    const ratio = contrastRatio(colour(tokens, foreground), colour(tokens, background))
    expect(
      ratio,
      `${foreground} on ${background} in ${themeName} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it.each(SUBTLE_BACKGROUNDS)('%s is distinguishable from the base surface', (background) => {
    const ratio = contrastRatio(colour(tokens, background), colour(tokens, '--surface-base'))
    expect(
      ratio,
      `${background} against --surface-base in ${themeName} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThan(1.05)
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

  it('keeps the control border stronger than the decorative one', () => {
    // If these two ever resolve to the same value, the second token has stopped
    // earning its existence and one of the two WCAG rules is going unmet.
    const base = colour(tokens, '--surface-base')
    const control = contrastRatio(colour(tokens, '--border-control'), base)
    const decorative = contrastRatio(colour(tokens, '--border-default'), base)

    expect(control).toBeGreaterThan(decorative)
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
  const ALL_COLOUR_TOKENS = [
    ...TEXT_FOREGROUNDS,
    ...NON_TEXT_FOREGROUNDS,
    ...SURFACES,
    ...SUBTLE_BACKGROUNDS,
    '--border-default',
    '--border-subtle',
    '--accent-content',
  ]

  it.each(THEMES)('%s defines every colour token', (themeName, tokens) => {
    for (const token of new Set(ALL_COLOUR_TOKENS)) {
      expect(tokens.has(token), `${token} missing from ${themeName}`).toBe(true)
    }
  })

  it('declares the same token set in both dark blocks', () => {
    // The two dark declarations are maintained by hand, so they drift. A token in
    // one and not the other means the two dark experiences are different
    // products, and only one of them was ever looked at.
    const systemOnly = [...systemDarkTokens.keys()].filter((t) => !explicitDarkTokens.has(t))
    const explicitOnly = [...explicitDarkTokens.keys()].filter((t) => !systemDarkTokens.has(t))

    expect(systemOnly, 'declared for the system preference but not the explicit override').toEqual(
      [],
    )
    expect(
      explicitOnly,
      'declared for the explicit override but not the system preference',
    ).toEqual([])
  })

  it('gives both dark blocks the same value for every colour they share', () => {
    for (const token of new Set(ALL_COLOUR_TOKENS)) {
      const system = systemDarkTokens.get(token)
      const explicit = explicitDarkTokens.get(token)
      if (system === undefined || explicit === undefined) continue
      expect(system, `${token} differs between the two dark blocks`).toBe(explicit)
    }
  })

  it('uses no raw hex colours', () => {
    // A hex value here is a colour outside the semantic system.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
