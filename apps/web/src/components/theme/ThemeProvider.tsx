'use client'

/**
 * Theme Provider & Manager.
 *
 * Supports 'light', 'dark', and 'system' modes, synchronizing with
 * `data-theme` on the root <html> element and persisting to localStorage.
 */
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeContextType = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'creatorhub-theme'

const ThemeContext = createContext<ThemeContextType>({
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => undefined,
})

// The saved choice and the OS preference live outside React, so they are read
// as external stores. The server snapshot matches what the server rendered;
// the pre-hydration script in app/layout.tsx has already set the real theme on
// <html>, and React re-renders with the client value right after hydrating.
const themeListeners = new Set<() => void>()
// Used when storage is unavailable (private mode): the choice then lasts this page only.
let unsavedTheme: Theme = 'system'

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return unsavedTheme
  }
}

function subscribeToSavedTheme(onChange: () => void): () => void {
  themeListeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    themeListeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToSavedTheme, readSavedTheme, () => 'system' as const)
  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => true,
  )
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const setTheme = (next: Theme) => {
    unsavedTheme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Kept in unsavedTheme instead.
    }
    for (const listener of themeListeners) listener()
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
