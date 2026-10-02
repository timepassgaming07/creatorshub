/**
 * Storefront theming: the creator's accent colour and layout preset turned
 * into CSS variables and class names.
 *
 * The accent is creator-chosen, so the text on it is computed, not assumed:
 * a pale yellow accent gets dark button text, a deep blue gets white. WCAG
 * relative luminance decides.
 */
import type { CSSProperties } from 'react'
import type { StorefrontTheme } from '@creatorhub/contracts'

export type StoreLayout = 'minimal' | 'showcase' | 'grid' | 'editorial'

function expandHex(hex: string): string {
  const clean = hex.replace('#', '')
  return clean.length === 3
    ? clean
        .split('')
        .map((c) => c + c)
        .join('')
    : clean
}

function channel(value: number): number {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const full = expandHex(hex)
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return 0
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Black or white, whichever reads better on the accent. */
export function textOn(accent: string): '#ffffff' | '#111111' {
  return contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#111111') ? '#ffffff' : '#111111'
}

const DEFAULT_ACCENT = '#e2541c'

export function storeAccent(theme: Partial<StorefrontTheme>): string {
  const value = theme.accentColor
  return value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? `#${expandHex(value)}` : DEFAULT_ACCENT
}

export function storeLayout(theme: Partial<StorefrontTheme>): StoreLayout {
  return theme.layoutPreset ?? 'showcase'
}

export function storeStyle(theme: Partial<StorefrontTheme>): CSSProperties {
  const accent = storeAccent(theme)
  const font =
    theme.fontPreset === 'serif'
      ? 'var(--font-display)'
      : theme.fontPreset === 'mono'
        ? 'var(--font-mono)'
        : 'var(--font-body)'
  return {
    '--store-accent': accent,
    '--store-accent-fg': textOn(accent),
    '--store-heading-font': font,
  } as CSSProperties
}

/** Editorial is the dark preset; the rest are light. */
export function storeModeClass(theme: Partial<StorefrontTheme>): string {
  return storeLayout(theme) === 'editorial' ? 'store-dark' : 'store-light'
}

/** Starting points for a creator's accent. Creator data, not design tokens. */
export const ACCENT_PRESETS: readonly { readonly name: string; readonly hex: string }[] = [
  { name: 'Ember', hex: '#e2541c' },
  { name: 'Marigold', hex: '#e8a317' },
  { name: 'Jade', hex: '#13855c' },
  { name: 'Lagoon', hex: '#0f7c90' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Orchid', hex: '#a23ec2' },
  { name: 'Rose', hex: '#d6336c' },
  { name: 'Ink', hex: '#18181b' },
]
