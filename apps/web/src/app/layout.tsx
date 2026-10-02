import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { headers } from 'next/headers'
import { connection } from 'next/server'

import './globals.css'
import { Providers } from './providers'

const sans = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' })
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' })
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
})

const siteUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CreatorHub — Sell digital products from one link',
    template: '%s · CreatorHub',
  },
  description:
    'Your link-in-bio, storefront, checkout, delivery, affiliates, and payouts in one place. UPI and cards through Razorpay, automatic GST, and a real double-entry ledger.',
  applicationName: 'CreatorHub',
  openGraph: {
    type: 'website',
    siteName: 'CreatorHub',
    title: 'CreatorHub — Sell digital products from one link',
    description:
      'Storefront, checkout, instant delivery, affiliates, and payouts for creators. Built for India, ready for the world.',
  },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled. Blocking it fails WCAG 1.4.4.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
  ],
}

/**
 * Applies the saved theme before first paint, so a dark-mode user never sees
 * a white flash. Runs with the request's CSP nonce; it reads one localStorage
 * key and sets one attribute.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('creatorhub-theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');if(d)r.classList.add('dark')}catch(e){}})()`

function nonceFrom(csp: string | null): string | undefined {
  return csp ? /'nonce-([^']+)'/.exec(csp)?.[1] : undefined
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The CSP is nonce-based (lib/csp.ts). Next can only stamp the per-request
  // nonce on its scripts when the page is rendered per request; a prerendered
  // page ships scripts with no nonce, the browser refuses all of them, and the
  // page never hydrates. Opting every route into request-time rendering here is
  // what keeps the policy and the framework agreeing.
  await connection()
  const nonce = nonceFrom((await headers()).get('content-security-policy'))

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-surface-base text-content-primary font-sans antialiased">
        {/* The first focusable element on every page. */}
        <a
          href="#main"
          className="bg-surface-raised text-content-primary sr-only rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100]"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
