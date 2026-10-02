/**
 * Storefront theme tokens unit tests (Item 4.5).
 */
import type { StorefrontTheme } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import {
  FONT_PRESET_MAP,
  getContrastTextColor,
  getStorefrontThemeTokens,
  hexLuminance,
  hexToRgb,
  LAYOUT_PRESET_MAP,
} from './theme'

describe('Hex Color and Luminance Maths', () => {
  it('parses standard 6-character hex colors', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#4f46e5')).toEqual([79, 70, 229])
  })

  it('parses 3-character short hex colors', () => {
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#000')).toEqual([0, 0, 0])
    expect(hexToRgb('#f00')).toEqual([255, 0, 0])
  })

  it('falls back safely for invalid hex strings', () => {
    expect(hexToRgb('invalid')).toEqual([79, 70, 229])
  })

  it('calculates correct relative luminance', () => {
    expect(hexLuminance('#ffffff')).toBeCloseTo(1.0, 2)
    expect(hexLuminance('#000000')).toBeCloseTo(0.0, 2)
    expect(hexLuminance('#4f46e5')).toBeLessThan(0.35)
  })

  it('selects contrast-safe text colors according to WCAG thresholds', () => {
    // Dark backgrounds need white text
    expect(getContrastTextColor('#000000')).toBe('#ffffff')
    expect(getContrastTextColor('#4f46e5')).toBe('#ffffff')
    expect(getContrastTextColor('#1e1b4b')).toBe('#ffffff')
    expect(getContrastTextColor('#047857')).toBe('#ffffff')

    // Light backgrounds need dark text
    expect(getContrastTextColor('#ffffff')).toBe('#0f172a')
    expect(getContrastTextColor('#fef08a')).toBe('#0f172a')
    expect(getContrastTextColor('#a7f3d0')).toBe('#0f172a')
    expect(getContrastTextColor('#fbcfe8')).toBe('#0f172a')
  })
})

describe('getStorefrontThemeTokens', () => {
  it('generates tokens with default theme settings', () => {
    const theme: StorefrontTheme = {
      accentColor: '#4f46e5',
      fontPreset: 'sans',
      layoutPreset: 'showcase',
      socialLinks: [],
      customLinks: [],
    }

    const tokens = getStorefrontThemeTokens(theme)
    expect(tokens.fontClass).toBe('font-sans')
    expect(tokens.contrastTextColor).toBe('#ffffff')
    expect(tokens.layoutClass).toContain('layout-showcase')
    expect((tokens.style as Record<string, string>)['--accent-primary']).toBe('#4f46e5')
    expect((tokens.style as Record<string, string>)['--accent-contrast']).toBe('#ffffff')
    expect((tokens.style as Record<string, string>)['--font-storefront']).toBe(FONT_PRESET_MAP.sans)
  })

  it('generates tokens for serif font and editorial layout', () => {
    const theme: StorefrontTheme = {
      accentColor: '#fbbf24', // Light amber
      fontPreset: 'serif',
      layoutPreset: 'editorial',
      socialLinks: [],
      customLinks: [],
    }

    const tokens = getStorefrontThemeTokens(theme)
    expect(tokens.fontClass).toBe('font-serif')
    expect(tokens.contrastTextColor).toBe('#0f172a')
    expect(tokens.layoutClass).toContain('layout-editorial')
    expect(tokens.layoutConfig.gridCols).toBe(LAYOUT_PRESET_MAP.editorial.gridCols)
  })

  it('generates tokens for mono font and minimal layout', () => {
    const theme: StorefrontTheme = {
      accentColor: '#10b981',
      fontPreset: 'mono',
      layoutPreset: 'minimal',
      socialLinks: [],
      customLinks: [],
    }

    const tokens = getStorefrontThemeTokens(theme)
    expect(tokens.fontClass).toBe('font-mono')
    expect(tokens.layoutClass).toContain('layout-minimal')
  })
})
