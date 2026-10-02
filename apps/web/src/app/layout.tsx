import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'CreatorHub',
    template: '%s · CreatorHub',
  },
  description: 'The operating system for digital businesses.',
  // Storefronts opt into indexing individually once published. The dashboard
  // never should, so the default is closed and slice 4 opens it deliberately.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled. Blocking it fails WCAG 1.4.4 and is one of the most
  // common accessibility mistakes in a mobile layout.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1d21' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased bg-[#07080b] text-slate-100">
        {/* The first focusable element on every page. Keyboard and screen-reader
            users should not have to traverse navigation to reach content. */}
        <a
          href="#main"
          className="bg-surface-raised text-content-primary focus:ring-border-strong sr-only rounded-md px-4 py-2 focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
