/**
 * Storefront theme token override generator (Implementation Plan §4.5).
 *
 * Responsibilities:
 * 1. Calculate WCAG-safe contrast text colors for creator accent colors.
 * 2. Map font presets ('sans' | 'serif' | 'mono') to system typography stacks.
 * 3. Map layout presets ('minimal' | 'showcase' | 'grid' | 'editorial') to CSS styles and grid configurations.
 * 4. Generate CSS Custom Properties for theme tokens.
 */
import type React from 'react'
import type { StorefrontTheme, ThemeLayoutPreset } from '@creatorhub/contracts'

export const FONT_PRESET_MAP = {
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Source Code Pro", Menlo, monospace',
} as const

export const LAYOUT_PRESET_MAP: Record<
  ThemeLayoutPreset,
  {
    readonly containerClass: string
    readonly heroStyle: 'compact' | 'prominent' | 'minimal' | 'editorial'
    readonly gridCols: string
    readonly cardPadding: string
  }
> = {
  minimal: {
    containerClass: 'layout-minimal max-w-4xl',
    heroStyle: 'compact',
    gridCols: 'grid-cols-1 sm:grid-cols-2',
    cardPadding: 'p-4',
  },
  showcase: {
    containerClass: 'layout-showcase max-w-6xl',
    heroStyle: 'prominent',
    gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    cardPadding: 'p-5',
  },
  grid: {
    containerClass: 'layout-grid max-w-7xl',
    heroStyle: 'minimal',
    gridCols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    cardPadding: 'p-4',
  },
  editorial: {
    containerClass: 'layout-editorial max-w-5xl',
    heroStyle: 'editorial',
    gridCols: 'grid-cols-1 sm:grid-cols-2',
    cardPadding: 'p-6',
  },
}

/**
 * Parses a hex color string into [r, g, b] (0..255).
 */
export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '').trim()
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const num = parseInt(clean, 16)
  if (Number.isNaN(num) || (clean.length !== 6 && clean.length !== 8)) {
    return [79, 70, 229] // fallback #4f46e5
  }
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return [r, g, b]
}

/**
 * Computes standard WCAG relative luminance of a hex color.
 */
export function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

/**
 * Computes contrast-safe text color for an accent background.
 */
export function getContrastTextColor(hex: string): string {
  const lum = hexLuminance(hex)
  // Contrast ratio against white (lum=1.0): (1.0 + 0.05) / (lum + 0.05)
  // Contrast ratio against dark text #0f172a (lum≈0.01): (lum + 0.05) / (0.01 + 0.05)
  return lum > 0.35 ? '#0f172a' : '#ffffff'
}

export type StorefrontThemeTokens = {
  readonly style: React.CSSProperties
  readonly fontClass: string
  readonly layoutClass: string
  readonly contrastTextColor: string
  readonly layoutConfig: (typeof LAYOUT_PRESET_MAP)[ThemeLayoutPreset]
}

/**
 * Generates custom properties and layout classes from a StorefrontTheme.
 */
export function getStorefrontThemeTokens(theme: StorefrontTheme): StorefrontThemeTokens {
  const accent = theme.accentColor
  const contrastText = getContrastTextColor(accent)
  const fontPreset = theme.fontPreset
  const layoutPreset = theme.layoutPreset
  const fontFamily = FONT_PRESET_MAP[fontPreset]
  const layoutConfig = LAYOUT_PRESET_MAP[layoutPreset]

  return {
    style: {
      '--accent-primary': accent,
      '--accent-contrast': contrastText,
      '--font-storefront': fontFamily,
      fontFamily,
    } as React.CSSProperties,
    fontClass: `font-${fontPreset}`,
    layoutClass: layoutConfig.containerClass,
    contrastTextColor: contrastText,
    layoutConfig,
  }
}
