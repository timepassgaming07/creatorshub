/**
 * Colour contrast maths for token verification.
 *
 * Responsibilities: convert an oklch token to sRGB and compute a WCAG contrast
 * ratio between two colours.
 * Dependencies: none.
 *
 * The design system says contrast is "verified, not assumed". Axe verifies what a
 * page actually renders, which means a token that no component uses yet is
 * unverified — that is exactly how a `caution` token shipped at 4.25:1. This
 * module lets the tokens be checked directly, independent of any screen.
 *
 * Conversion follows the CSS Color 4 definition of oklch: oklch → oklab → LMS →
 * linear sRGB. Values are kept in linear light for the luminance calculation,
 * which is what WCAG 2 requires.
 */

export type Oklch = { readonly l: number; readonly c: number; readonly h: number }

/** Parse `oklch(55% 0.008 75)`. Returns null for anything else. */
export function parseOklch(value: string): Oklch | null {
  const match = /oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(value)
  if (!match) return null

  const [, lightness, chroma, hue] = match
  return {
    l: Number(lightness) / 100,
    c: Number(chroma),
    h: Number(hue),
  }
}

/** oklch to linear-light sRGB. Components may fall outside 0..1 when out of gamut. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b

  const lms = [lRoot ** 3, mRoot ** 3, sRoot ** 3] as const
  const [long, medium, short] = lms

  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

/** WCAG relative luminance. Input is linear-light sRGB, clamped into gamut. */
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb
  return 0.2126 * clampUnit(r) + 0.7152 * clampUnit(g) + 0.0722 * clampUnit(b)
}

/** WCAG 2 contrast ratio, from 1 to 21. Order of arguments does not matter. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const first = relativeLuminance(oklchToLinearSrgb(a))
  const second = relativeLuminance(oklchToLinearSrgb(b))
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Extract custom properties from a CSS block.
 *
 * Deliberately simple: the token file is ours and its shape is known. A real CSS
 * parser here would be a dependency bought to solve a problem we do not have.
 */
export function extractTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi

  let match = pattern.exec(css)
  while (match !== null) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim())
    match = pattern.exec(css)
  }

  return tokens
}

/** WCAG 2.2 AA thresholds. */
export const AA_NORMAL_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_NON_TEXT = 3
