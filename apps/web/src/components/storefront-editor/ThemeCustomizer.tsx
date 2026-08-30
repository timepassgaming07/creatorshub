'use client'

/**
 * Theme & Visual Styling Customizer for Storefront Studio (Item 4.8).
 *
 * Responsibilities:
 * - Curated preset palette selector and custom hex color picker.
 * - Live WCAG contrast ratio calculation with accessibility pill.
 * - Font family preset selector (Sans, Serif, Mono).
 * - Layout preset selector (Minimal, Showcase, Grid, Editorial) with visual wireframe badges.
 */
import type { StorefrontTheme, ThemeLayoutPreset } from '@creatorhub/contracts'

import { getContrastTextColor } from '../../lib/theme'

export type ThemeFontPreset = 'sans' | 'serif' | 'mono'

type ThemeCustomizerProps = {
  readonly themeConfig: StorefrontTheme
  readonly onChange: (updated: StorefrontTheme) => void
  readonly disabled?: boolean
}

const PRESET_COLORS = [
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Sky', hex: '#0284c7' },
  { name: 'Obsidian', hex: '#18181b' },
]

const FONT_PRESETS: {
  readonly id: ThemeFontPreset
  readonly label: string
  readonly description: string
  readonly fontClass: string
}[] = [
  {
    id: 'sans',
    label: 'Modern Sans',
    description: 'Clean, universal, highly readable modern grotesque stack.',
    fontClass: 'font-sans',
  },
  {
    id: 'serif',
    label: 'Editorial Serif',
    description: 'Refined, elegant, and literary editorial typography.',
    fontClass: 'font-serif',
  },
  {
    id: 'mono',
    label: 'Technical Mono',
    description: 'Precise, developer-focused, monospace geometric typeface.',
    fontClass: 'font-mono',
  },
]

const LAYOUT_PRESETS: {
  readonly id: ThemeLayoutPreset
  readonly label: string
  readonly description: string
  readonly badge: string
}[] = [
  {
    id: 'showcase',
    label: 'Showcase Grid',
    description: 'Hero featured card followed by 2-column balanced grid.',
    badge: 'Popular',
  },
  {
    id: 'grid',
    label: 'Standard Grid',
    description: 'Symmetric 3-column product showcase for larger catalogues.',
    badge: '3 Columns',
  },
  {
    id: 'editorial',
    label: 'Editorial Feed',
    description: 'Full-width magazine story style cards for high-detail offerings.',
    badge: 'Single Stream',
  },
  {
    id: 'minimal',
    label: 'Minimalist',
    description: 'Compact, streamlined 2-column view with tight margins.',
    badge: 'Compact',
  },
]

export function ThemeCustomizer({ themeConfig, onChange, disabled = false }: ThemeCustomizerProps) {
  const accentColor = themeConfig.accentColor
  const fontPreset = themeConfig.fontPreset
  const layoutPreset = themeConfig.layoutPreset

  const contrastText = getContrastTextColor(accentColor)
  const isWhiteText = contrastText === '#ffffff'

  const handleColorChange = (hex: string) => {
    onChange({
      ...themeConfig,
      accentColor: hex,
    })
  }

  const handleFontChange = (font: ThemeFontPreset) => {
    onChange({
      ...themeConfig,
      fontPreset: font,
    })
  }

  const handleLayoutChange = (layout: ThemeLayoutPreset) => {
    onChange({
      ...themeConfig,
      layoutPreset: layout,
    })
  }

  return (
    <div className="space-y-8">
      {/* Accent Color Palette & Picker */}
      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="brand-accent-color-hex"
            className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
          >
            Brand Accent Color
          </label>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: accentColor,
              color: contrastText,
            }}
          >
            {isWhiteText ? 'Dark Accent · High Contrast' : 'Light Accent · Dark Text'}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Used for primary action buttons, purchase badges, and hover highlights.
        </p>

        {/* Palette Swatches */}
        <div className="mt-3 flex flex-wrap gap-2.5">
          {PRESET_COLORS.map((c) => {
            const isSelected = accentColor.toLowerCase() === c.hex.toLowerCase()
            return (
              <button
                key={c.hex}
                type="button"
                disabled={disabled}
                onClick={() => {
                  handleColorChange(c.hex)
                }}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isSelected ? 'ring-2 ring-neutral-900 dark:ring-white scale-110' : ''
                }`}
                style={{ backgroundColor: c.hex }}
                title={`${c.name} (${c.hex})`}
              >
                {isSelected && (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke={getContrastTextColor(c.hex)}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        {/* Custom Hex Color Input */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex items-center">
            <input
              id="brand-accent-color-picker"
              type="color"
              value={accentColor}
              disabled={disabled}
              onChange={(e) => {
                handleColorChange(e.target.value)
              }}
              className="h-9 w-9 cursor-pointer rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700 bg-transparent"
              aria-label="Color Picker"
            />
          </div>
          <div className="flex-1">
            <input
              id="brand-accent-color-hex"
              type="text"
              value={accentColor}
              disabled={disabled}
              onChange={(e) => {
                handleColorChange(e.target.value)
              }}
              placeholder="#4f46e5"
              className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-mono text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
        </div>
      </div>

      {/* Typography Presets */}
      <div>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Typography Stack
        </span>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Choose the font personality that represents your brand aesthetic.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FONT_PRESETS.map((f) => {
            const isSelected = fontPreset === f.id
            return (
              <button
                key={f.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  handleFontChange(f.id)
                }}
                className={`flex flex-col text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-800/80 dark:ring-white'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
                }`}
              >
                <span
                  className={`text-base font-semibold ${f.fontClass} text-neutral-900 dark:text-neutral-100`}
                >
                  {f.label}
                </span>
                <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {f.description}
                </span>
                <span
                  className={`mt-3 text-xs font-mono font-medium ${
                    isSelected ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'
                  }`}
                >
                  Aa Bb Gg 123
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Layout Presets */}
      <div>
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Storefront Layout
        </span>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Select how your products and digital goods are arranged on the storefront.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LAYOUT_PRESETS.map((l) => {
            const isSelected = layoutPreset === l.id
            return (
              <button
                key={l.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  handleLayoutChange(l.id)
                }}
                className={`flex flex-col text-left rounded-xl border p-4 transition-all ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900 dark:border-white dark:bg-neutral-800/80 dark:ring-white'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {l.label}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {l.badge}
                  </span>
                </div>
                <span className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {l.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
