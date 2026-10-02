import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AffiliateDashboard } from '@/components/affiliates/AffiliateDashboard'
import { AuthShell } from '@/components/auth/AuthShell'
import { loadAffiliatePortal } from '@/lib/affiliate-portal'

export const metadata: Metadata = { title: 'Affiliate dashboard', robots: { index: false } }

const linkClass =
  'inline-flex h-10 items-center justify-center rounded-lg px-4 text-body font-medium transition-colors'

export default async function AffiliatePortalPage({
  params,
}: {
  readonly params: Promise<{ store: string; code: string }>
}) {
  const { store, code } = await params
  const result = await loadAffiliatePortal(store, code)
  const here = `/affiliate/${encodeURIComponent(store)}/${encodeURIComponent(code)}`

  switch (result.state) {
    case 'not_found':
      notFound()
    // falls through: notFound() never returns
    case 'ok':
      return <AffiliateDashboard data={result.data} />
    case 'signed_out':
      return (
        <AuthShell
          title="Your affiliate dashboard"
          subtitle={`See your clicks, sales, and earnings from ${result.storeTitle}. Sign in with ${result.maskedEmail}, the address your invitation was sent to.`}
        >
          <div className="flex flex-col gap-3">
            <Link
              href={`/sign-in?redirect=${encodeURIComponent(here)}`}
              className={`${linkClass} bg-accent text-accent-content hover:bg-accent-hover`}
            >
              Sign in
            </Link>
            <Link
              href={`/sign-up?redirect=${encodeURIComponent(here)}`}
              className={`${linkClass} border border-border-control hover:bg-surface-sunken`}
            >
              Create an account
            </Link>
          </div>
        </AuthShell>
      )
    case 'unverified':
      return (
        <AuthShell
          title="Confirm your email first"
          subtitle={`We sent a confirmation link to ${result.email} when you signed up. Open it, then come back to this page. Earnings are shown only to a confirmed address.`}
        >
          <Link
            href={here}
            className={`${linkClass} w-full border border-border-control hover:bg-surface-sunken`}
          >
            I have confirmed it
          </Link>
        </AuthShell>
      )
    case 'wrong_account':
      return (
        <AuthShell
          title="This dashboard belongs to someone else"
          subtitle={`You are signed in as ${result.signedInAs}. The ${result.storeTitle} invitation went to ${result.maskedEmail}. Sign out and sign in with that address.`}
        >
          <Link
            href={`/sign-in?redirect=${encodeURIComponent(here)}`}
            className={`${linkClass} w-full border border-border-control hover:bg-surface-sunken`}
          >
            Use another account
          </Link>
        </AuthShell>
      )
  }
}
