import type { ReactNode } from 'react'

import { SitePage } from './SiteChrome'

/** Plain, readable layout for policy pages. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  readonly title: string
  readonly updated: string
  readonly children: ReactNode
}) {
  return (
    <SitePage>
      <article className="mx-auto max-w-2xl px-5 py-16 sm:py-20">
        <h1 className="text-[clamp(2rem,5vw,3rem)] font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-caption text-content-tertiary">Last updated {updated}</p>
        <div className="mt-10 space-y-5 text-[15px] leading-relaxed text-content-secondary [&_h2]:mt-10 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-content-primary [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-content-primary [&_ul]:space-y-2">
          {children}
        </div>
      </article>
    </SitePage>
  )
}

/** Who operates the platform. Set in the environment before launch. */
export function legalEntity(): {
  readonly name: string
  readonly email: string | null
  readonly address: string | null
} {
  return {
    name: process.env['LEGAL_ENTITY_NAME'] ?? 'CreatorHub',
    email: process.env['SUPPORT_EMAIL'] ?? null,
    address: process.env['LEGAL_ADDRESS'] ?? null,
  }
}

export function ContactLine() {
  const { email } = legalEntity()
  return email ? (
    <a href={`mailto:${email}`} className="font-medium text-accent underline underline-offset-2">
      {email}
    </a>
  ) : (
    <a href="/legal/contact" className="font-medium text-accent underline underline-offset-2">
      our contact page
    </a>
  )
}
