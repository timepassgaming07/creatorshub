import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'

import { Motion } from '@/components/site/Motion'
import { SitePage } from '@/components/site/SiteChrome'

/** Server-side class join; the design system's cn() lives in a client module. */
function cn(...classes: (string | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free to start. 5% per sale on Starter, less on Pro and Team. No setup fee.',
}

const PLANS = [
  {
    name: 'Starter',
    price: '₹0',
    period: 'a month',
    fee: '5% per sale',
    blurb: 'Everything you need to sell, from day one.',
    points: [
      'Unlimited products and files',
      'Storefront on yourname.creatorhub or your own domain',
      'UPI, cards, and netbanking',
      'GST invoices and splits',
      'Discount codes and affiliates',
      'Payouts to UPI or bank',
      'AI copilot',
    ],
    cta: { label: 'Start free', href: '/sign-up' },
    featured: true,
  },
  {
    name: 'Pro',
    price: '₹1,499',
    period: 'a month',
    fee: '2% per sale',
    blurb: 'For creators whose sales make the lower fee pay for itself.',
    points: ['Everything in Starter', '2% fee instead of 5%', 'Priority email support'],
    cta: { label: 'Start on Starter', href: '/sign-up' },
    note: 'Opening to creators in batches. Start on Starter and move up when it opens to you.',
  },
  {
    name: 'Team',
    price: '₹3,999',
    period: 'a month',
    fee: '0% per sale',
    blurb: 'For studios and teams selling at volume.',
    points: [
      'Everything in Pro',
      'Team roles and approvals',
      'Two-person payout approval',
      'Onboarding help',
    ],
    cta: { label: 'Start on Starter', href: '/sign-up' },
    note: 'Opening to creators in batches. Start on Starter and move up when it opens to you.',
  },
] as const

export default function PricingPage() {
  return (
    <SitePage>
      <Motion>
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-24">
          <div data-reveal className="mx-auto max-w-2xl text-center">
            <h1 className="text-[clamp(2.5rem,6vw,4rem)] leading-[1.02] font-semibold tracking-[-0.035em]">
              Pay when you <em className="font-display font-normal">sell.</em>
            </h1>
            <p className="mt-4 text-[17px] text-content-secondary">
              No setup fee. No fee on free products. Payment processing is charged separately by
              Razorpay, usually about 2%.
            </p>
          </div>
          <div data-reveal-group className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  'flex flex-col rounded-2xl border p-7',
                  'featured' in plan && plan.featured
                    ? 'border-content-primary bg-surface-raised shadow-elevation-3'
                    : 'border-border-subtle bg-surface-raised',
                )}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold">{plan.name}</h2>
                  {'featured' in plan && plan.featured && (
                    <span className="rounded-full bg-accent-subtle px-2.5 py-0.5 text-caption font-medium text-accent">
                      Most creators start here
                    </span>
                  )}
                </div>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-[2.5rem] font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-body text-content-tertiary">{plan.period}</span>
                </p>
                <p className="text-body font-medium text-accent">{plan.fee}</p>
                <p className="mt-3 text-body text-content-secondary">{plan.blurb}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-body">
                      <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.cta.href}
                  className={cn(
                    'mt-8 inline-flex h-11 items-center justify-center rounded-xl text-body font-medium transition-opacity hover:opacity-90',
                    'featured' in plan && plan.featured
                      ? 'bg-content-primary text-surface-base'
                      : 'border border-border-default text-content-primary',
                  )}
                >
                  {plan.cta.label}
                </Link>
                {'note' in plan && (
                  <p className="mt-3 text-caption text-content-tertiary">{plan.note}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      </Motion>
    </SitePage>
  )
}
