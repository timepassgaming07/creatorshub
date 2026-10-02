'use client'

import { Moon, Sun } from 'lucide-react'

import { useTheme } from './ThemeProvider'

export function ThemeToggle({ className = '' }: { readonly className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(dark ? 'light' : 'dark')
      }}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content-primary ${className}`}
    >
      {dark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </button>
  )
}
