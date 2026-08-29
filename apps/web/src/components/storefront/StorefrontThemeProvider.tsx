/**
 * Storefront theme provider container (Item 4.5).
 * Injects CSS token overrides (accent color, safe contrast, font family) into the storefront DOM subtree.
 */
import type { StorefrontTheme } from '@creatorhub/contracts'
import { getStorefrontThemeTokens } from '@/lib/theme'

type StorefrontThemeProviderProps = {
  readonly theme: StorefrontTheme
  readonly children: React.ReactNode
  readonly className?: string
}

export function StorefrontThemeProvider({
  theme,
  children,
  className = '',
}: StorefrontThemeProviderProps) {
  const tokens = getStorefrontThemeTokens(theme)

  return (
    <div
      style={tokens.style}
      className={`min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] ${tokens.fontClass} ${tokens.layoutClass} ${className}`}
    >
      {children}
    </div>
  )
}
