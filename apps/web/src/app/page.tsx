/**
 * The front door. Server-rendered; the plasma field and the scroll motion are
 * the only client islands. Every claim on this page is something the product
 * does today, and the example store and example sale are labelled as examples.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  BadgeIndianRupee,
  Bot,
  Check,
  FileLock2,
  Globe,
  Handshake,
  Landmark,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  Zap,
} from 'lucide-react'
import type { StorefrontTheme } from '@creatorhub/contracts'

import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome'
import { Motion } from '@/components/site/Motion'
import { StoreHome } from '@/components/store/StoreHome'
import { StoreShell } from '@/components/store/StoreShell'
import { HeroSceneLazy } from '@/components/visual/HeroSceneLazy'
import { Plasma } from '@/components/visual/Plasma'
import type { PublicProductCard, PublicStore } from '@/lib/storefront-public'

export const metadata: Metadata = {
  title: { absolute: 'CreatorHub: sell digital products from your link in bio' },
  description:
    'A storefront, checkout, instant delivery, GST, affiliates, and payouts for Indian creators. Free to start; you pay 5% only when you sell.',
}

const exampleTheme = {
  accentColor: '#e2541c',
  fontPreset: 'serif',
  layoutPreset: 'showcase',
  bio: 'Wedding photographer in Jaipur. The exact edits I use, as presets.',
  socialLinks: [
    { platform: 'instagram', url: 'https://instagram.com' },
    { platform: 'youtube', url: 'https://youtube.com' },
  ],
  customLinks: [{ label: 'Book a portfolio review', url: 'https://example.com', emoji: '📅' }],
} as StorefrontTheme

const exampleStore: PublicStore = {
  id: 'example',
  workspaceId: 'example',
  subdomain: 'asha',
  url: '#',
  title: 'Asha Rao Studio',
  tagline: 'Presets for golden-hour weddings',
  description: null,
  theme: exampleTheme,
  logoUrl: null,
  bannerUrl: null,
  isPreview: false,
}

const exampleProducts: PublicProductCard[] = [
  {
    id: 'example-golden',
    slug: 'golden-hour',
    title: 'Golden Hour Preset Pack',
    excerpt: 'Twelve Lightroom presets tuned on 3,000 wedding frames.',
    price: '99900',
    compareAtPrice: '149900',
    currency: 'INR',
    coverUrl: null,
    fileCount: 2,
  },
  {
    id: 'example-skin',
    slug: 'skin-tones',
    title: 'Skin-Tone Guide',
    excerpt: 'A 14-page PDF on Indian skin tones in every light.',
    price: '0',
    compareAtPrice: null,
    currency: 'INR',
    coverUrl: null,
    fileCount: 1,
  },
]

const SELLS = [
  'Lightroom presets',
  'Notion templates',
  'E-books and guides',
  'Design assets',
  'Fonts',
  'Sample packs',
  'Course files',
  'Wallpapers',
  'Spreadsheets',
  'Printables',
]

const FEATURES = [
  {
    icon: Store,
    title: 'A store that is also your link in bio',
    body: 'Your products, social profiles, and links on one page at yourname.creatorhub, or on your own domain. Four layouts, your colours, live in five minutes.',
  },
  {
    icon: BadgeIndianRupee,
    title: 'Checkout built for India',
    body: 'UPI, cards, and netbanking through Razorpay. Prices in rupees, discount codes, and a checkout that works on the phone your buyer is holding.',
  },
  {
    icon: Receipt,
    title: 'GST done right',
    body: 'Add your GSTIN once. Checkout charges CGST and SGST inside your state, IGST across states, and nothing to buyers abroad. Buyers can add their own GSTIN.',
  },
  {
    icon: FileLock2,
    title: 'Files delivered the moment payment clears',
    body: 'Buyers get a private download page by email. Links last seven days and five downloads, and a refund switches them off.',
  },
  {
    icon: Handshake,
    title: 'Affiliates who sell for you',
    body: 'Invite fans and fellow creators with their own link and commission. Earnings wait out a 30-day refund window, and refunds reverse them automatically.',
  },
  {
    icon: Bot,
    title: 'A copilot that writes the boring parts',
    body: 'Draft a product description, a headline for your store, or a plain-English read of your numbers. You approve every word before it goes live.',
  },
]

const BUILD_STEPS = [
  {
    title: 'Make your store',
    body: 'Pick a name and an address. Add your photo, a line about you, and a colour.',
  },
  {
    title: 'Bring your links',
    body: 'Instagram, YouTube, your booking page. One place for everything you share.',
  },
  {
    title: 'Add a product',
    body: 'Upload the file, set a price or make it free, publish. Covers and GST included.',
  },
  {
    title: 'Share one link, get paid',
    body: 'Put it in your bio. Payment, delivery, receipts, and GST happen without you.',
  },
]

const FAQ = [
  {
    q: 'What does it cost?',
    a: 'Nothing to start. On the Starter plan we keep 5% of each sale. Payment processing is charged separately by Razorpay, usually about 2%. Free products cost nothing at all.',
  },
  {
    q: 'When do I get my money?',
    a: 'Your balance shows in Payouts. Withdraw to UPI or a bank account once you have ₹500 or more; it usually arrives within two working days of approval.',
  },
  {
    q: 'Do I need a GST registration?',
    a: 'No. Most creators under ₹20 lakh a year are not registered, and CreatorHub charges no GST for them. If you are registered, add your GSTIN in Settings and checkout handles the rest.',
  },
  {
    q: 'Can I use my own domain?',
    a: 'Yes. Add two DNS records where you bought the domain, and your store answers on it.',
  },
  {
    q: 'What happens if a buyer asks for a refund?',
    a: 'Refund from the order page, in full or in part. The money goes back to the buyer, their download links stop working on a full refund, and any affiliate commission is reversed.',
  },
]

const ctaPrimary =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-content-primary px-6 text-[15px] font-medium text-surface-base shadow-elevation-2 transition-transform hover:-translate-y-0.5'
const ctaSecondary =
  'inline-flex h-12 items-center gap-2 rounded-xl border border-border-default px-6 text-[15px] font-medium text-content-primary backdrop-blur transition-colors hover:bg-surface-raised/40'

export default function LandingPage() {
  return (
    <Motion>
      <div className="bg-surface-base">
        {/* Hero ---------------------------------------------------------- */}
        <section data-tilt-zone className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="hero-aurora absolute inset-0 -z-30" />
          <HeroSceneLazy className="absolute inset-0 -z-20" />
          <div aria-hidden="true" className="hero-veil absolute inset-0 -z-10 hidden lg:block" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 -z-10 h-[62%] bg-gradient-to-b from-surface-base via-surface-base/85 to-transparent lg:hidden"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-surface-base"
          />
          <SiteHeader overlay />
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-36 pb-24 lg:grid-cols-[1.15fr_0.85fr] lg:pt-44 lg:pb-32">
            <div>
              <p
                data-hero-line
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-surface-raised/40 px-3 py-1 text-caption font-medium text-content-secondary backdrop-blur"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                For creators selling in India
              </p>
              <h1 className="mt-6 text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-content-primary">
                <span data-hero-line className="block">
                  Your audience.
                </span>
                <span data-hero-line className="block">
                  Your products.{' '}
                  <em className="text-brand-gradient font-display font-normal tracking-[-0.02em]">
                    One link.
                  </em>
                </span>
              </h1>
              <p
                data-hero-line
                className="mt-6 max-w-xl text-[17px] leading-relaxed text-content-secondary"
              >
                A storefront in your bio that takes UPI and cards, delivers files the moment payment
                clears, handles GST, and pays the affiliates who sell for you.
              </p>
              <div data-hero-line className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/sign-up" className={ctaPrimary}>
                  Start selling free
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link href="/pricing" className={ctaSecondary}>
                  See pricing
                </Link>
              </div>
              <p data-hero-line className="mt-5 text-caption text-content-tertiary">
                No monthly fee on Starter. You pay 5% only when you sell.
              </p>
            </div>

            <div data-hero-line className="relative mx-auto w-full max-w-[340px]">
              <div
                aria-hidden="true"
                className="absolute -inset-12 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-ember)_40%,transparent),color-mix(in_oklch,var(--brand-violet)_25%,transparent)_55%,transparent)] blur-3xl"
              />
              <figure
                data-tilt
                className="overflow-hidden rounded-[2.4rem] border-[6px] border-content-primary/10 bg-surface-base shadow-[0_40px_80px_-30px_color-mix(in_oklch,var(--brand-ink)_55%,transparent)] ring-1 ring-border-default"
              >
                <div
                  className="store-light h-[600px] overflow-hidden [clip-path:inset(0_round_2rem)]"
                  inert
                >
                  <div data-phone-scroll>
                    <StoreShell store={exampleStore} basePath="#">
                      <StoreHome store={exampleStore} products={exampleProducts} basePath="#" />
                    </StoreShell>
                  </div>
                </div>
              </figure>
              <figcaption className="mt-4 text-center">
                <span className="inline-block rounded-full border border-border-subtle bg-surface-raised px-3 py-1 text-caption text-content-secondary shadow-elevation-1">
                  An example store
                </span>
              </figcaption>
            </div>
          </div>
        </section>

        {/* What you can sell --------------------------------------------- */}
        <section aria-labelledby="sells" className="border-b border-border-subtle py-12">
          <div className="mx-auto max-w-6xl px-5">
            <h2
              id="sells"
              className="text-center text-caption font-semibold tracking-wide text-content-tertiary uppercase"
            >
              Anything you can put in a file
            </h2>
            <ul data-reveal-group className="mt-6 flex flex-wrap justify-center gap-2">
              {SELLS.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-border-subtle bg-surface-raised px-4 py-1.5 text-body text-content-secondary"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features ------------------------------------------------------ */}
        <section id="features" aria-labelledby="features-title" className="py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5">
            <div data-reveal className="max-w-2xl">
              <p className="text-caption font-semibold tracking-wide text-accent uppercase">
                Everything after the click
              </p>
              <h2
                id="features-title"
                className="mt-3 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em]"
              >
                The whole business, not just a{' '}
                <em className="font-display font-normal">buy button.</em>
              </h2>
              <p className="mt-4 text-[17px] text-content-secondary">
                Taking a payment is the easy part. CreatorHub does the rest: delivery, tax, refunds,
                affiliates, and getting the money to your bank.
              </p>
            </div>
            <div data-reveal-group className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <article
                  key={feature.title}
                  className="group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-border-default"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent-subtle text-accent">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-body leading-relaxed text-content-secondary">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Build: the store assembles itself as you scroll ----------- */}
        <section
          data-build
          aria-labelledby="steps-title"
          className="relative border-y border-border-subtle bg-surface-sunken/40"
        >
          <div
            data-build-pin
            className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:min-h-dvh lg:grid-cols-[1fr_0.9fr] lg:py-16"
          >
            <div>
              <p className="text-caption font-semibold tracking-wide text-accent uppercase">
                From zero to selling
              </p>
              <h2
                id="steps-title"
                className="mt-3 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em]"
              >
                Live before your <em className="font-display font-normal">coffee goes cold.</em>
              </h2>
              <ol data-build-steps className="mt-10 space-y-2">
                {BUILD_STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    data-build-step={index}
                    className="flex gap-4 rounded-2xl border border-transparent p-5"
                  >
                    <span className="mt-0.5 font-mono text-caption text-content-tertiary tabular-nums">
                      0{index + 1}
                    </span>
                    <span>
                      <span className="block text-[17px] font-semibold">{step.title}</span>
                      <span className="mt-1 block text-body text-content-secondary">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div aria-hidden="true" className="relative mx-auto w-full max-w-[320px]">
              <div className="absolute -inset-16 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand-violet)_28%,transparent),color-mix(in_oklch,var(--brand-ember)_18%,transparent)_60%,transparent)] blur-3xl" />
              <div
                data-b="url"
                className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-border-subtle bg-surface-raised px-4 py-2 text-caption font-medium shadow-elevation-2"
              >
                <span className="size-2 rounded-full bg-positive" />
                asha.creatorhub.store
              </div>
              <div className="store-light relative overflow-hidden rounded-[2.4rem] border-[6px] border-content-primary/10 bg-surface-base shadow-[0_40px_80px_-30px_color-mix(in_oklch,var(--brand-ink)_55%,transparent)] ring-1 ring-border-default">
                <div className="h-[540px] overflow-hidden px-4 pt-4 text-content-primary">
                  <div
                    data-b="banner"
                    className="h-24 rounded-2xl bg-[linear-gradient(120deg,var(--brand-saffron),var(--brand-ember)_55%,var(--brand-rose))]"
                  />
                  <div
                    data-b="avatar"
                    className="mx-auto -mt-9 flex size-[72px] items-center justify-center rounded-full border-4 border-surface-base bg-[linear-gradient(135deg,var(--brand-ember),var(--brand-violet))] text-2xl font-semibold text-white"
                  >
                    A
                  </div>
                  <p data-b="name" className="mt-2 text-center font-display text-2xl">
                    Asha Rao Studio
                  </p>
                  <p data-b="tagline" className="text-center text-caption text-content-secondary">
                    Presets for golden-hour weddings
                  </p>
                  <div className="mt-3 flex justify-center gap-2">
                    {['IG', 'YT', 'X'].map((label) => (
                      <span
                        key={label}
                        data-b="social"
                        className="flex size-8 items-center justify-center rounded-full border border-border-default text-[11px] font-semibold text-content-secondary"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div
                    data-b="link"
                    className="mt-3 rounded-xl border border-border-default bg-surface-raised px-3 py-2.5 text-caption font-medium"
                  >
                    📅 Book a portfolio review
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {[
                      {
                        title: 'Golden Hour Presets',
                        price: '₹999',
                        tone: 'var(--brand-saffron),var(--brand-ember)',
                      },
                      {
                        title: 'Skin-Tone Guide',
                        price: 'Free',
                        tone: 'var(--brand-rose),var(--brand-violet)',
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        data-b="product"
                        className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised"
                      >
                        <div
                          className="h-20"
                          style={{ background: `linear-gradient(135deg,${item.tone})` }}
                        />
                        <div className="p-2.5">
                          <p className="text-[12px] leading-tight font-semibold">{item.title}</p>
                          <p className="mt-1 text-[12px] font-semibold tabular-nums">
                            {item.price}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  data-b="toast"
                  className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-raised/95 p-3 shadow-elevation-3 backdrop-blur"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-subtle text-positive">
                    <BadgeIndianRupee className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-caption font-semibold">New sale · ₹999</span>
                    <span className="block truncate text-[12px] text-content-secondary">
                      Golden Hour Presets, delivered
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[11px] text-content-tertiary">Today</span>
                    <span data-b="today" className="block text-caption font-semibold tabular-nums">
                      ₹2,997
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Money --------------------------------------------------------- */}
        <section id="money" aria-labelledby="money-title" className="py-24 sm:py-32">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
            <div data-reveal>
              <p className="text-caption font-semibold tracking-wide text-accent uppercase">
                How you get paid
              </p>
              <h2
                id="money-title"
                className="mt-3 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em]"
              >
                Every rupee, <em className="font-display font-normal">accounted for.</em>
              </h2>
              <p className="mt-4 text-[17px] text-content-secondary">
                Each sale is recorded in a double-entry ledger: what the buyer paid, what goes to
                tax, to an affiliate, to us, and to you. Your balance is never a guess, and it
                always adds up.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  { icon: Landmark, text: 'Withdraw to UPI or any Indian bank account' },
                  { icon: ShieldCheck, text: 'With a team, a second person approves every payout' },
                  {
                    icon: Globe,
                    text: 'New payout accounts wait 24 hours before large withdrawals',
                  },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-3 text-body">
                    <item.icon className="size-4 shrink-0 text-positive" aria-hidden="true" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
            <figure
              data-reveal
              className="rounded-2xl border border-border-subtle bg-surface-raised p-6 shadow-elevation-2 sm:p-8"
            >
              <figcaption className="flex items-baseline justify-between">
                <span className="text-body font-semibold">An example sale</span>
                <span className="text-caption text-content-tertiary">
                  Starter plan, referred by an affiliate
                </span>
              </figcaption>
              <dl className="mt-6 divide-y divide-border-subtle text-body">
                {(
                  [
                    ['Buyer pays', '₹999.00', ''],
                    ['CreatorHub fee (5%)', '−₹49.95', 'text-content-secondary'],
                    ['Affiliate commission (20%)', '−₹199.80', 'text-content-secondary'],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="flex justify-between py-3">
                    <dt className="text-content-secondary">{label}</dt>
                    <dd data-count className={`font-medium tabular-nums ${tone}`}>
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between pt-4">
                  <dt className="font-semibold">You receive</dt>
                  <dd
                    data-count
                    className="text-[1.75rem] font-semibold tracking-tight tabular-nums"
                  >
                    ₹749.25
                  </dd>
                </div>
              </dl>
              <div className="mt-6">
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
                  <span data-grow className="w-[75%] rounded-l-full bg-[var(--brand-ember)]" />
                  <span data-grow className="w-[20%] bg-[var(--brand-saffron)]" />
                  <span data-grow className="w-[5%] rounded-r-full bg-[var(--brand-violet)]" />
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-content-secondary">
                  {(
                    [
                      ['You', '75%', 'bg-[var(--brand-ember)]'],
                      ['Affiliate', '20%', 'bg-[var(--brand-saffron)]'],
                      ['CreatorHub', '5%', 'bg-[var(--brand-violet)]'],
                    ] as const
                  ).map(([who, share, dot]) => (
                    <li key={who} className="inline-flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${dot}`} />
                      {who} <span className="font-medium text-content-primary">{share}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-5 text-caption text-content-tertiary">
                Razorpay charges its own processing fee, usually about 2%. With no affiliate, you
                would receive ₹949.05.
              </p>
            </figure>
          </div>
        </section>

        {/* FAQ ----------------------------------------------------------- */}
        <section aria-labelledby="faq-title" className="border-t border-border-subtle py-24">
          <div className="mx-auto max-w-3xl px-5">
            <h2
              id="faq-title"
              data-reveal
              className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.03em]"
            >
              Questions creators ask
            </h2>
            <div
              data-reveal-group
              className="mt-10 divide-y divide-border-subtle border-y border-border-subtle"
            >
              {FAQ.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">
                    {item.q}
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-default text-content-tertiary transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-body leading-relaxed text-content-secondary">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA --------------------------------------------------- */}
        <section className="px-5 pb-24">
          <div className="store-dark relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-20 text-center sm:px-12">
            <Plasma
              className="absolute inset-0 -z-10 size-full"
              intensity={0.8}
              interactive={false}
            />
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-surface-base/40" />
            <h2
              data-reveal
              className="mx-auto max-w-3xl text-[clamp(2rem,5vw,3.5rem)] leading-[1.03] font-semibold tracking-[-0.035em]"
            >
              Your next sale could be <em className="font-display font-normal">tonight.</em>
            </h2>
            <p data-reveal className="mx-auto mt-4 max-w-xl text-[17px] text-content-secondary">
              Make your store, add one product, and put the link in your bio. It is free until you
              sell.
            </p>
            <div data-reveal className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/sign-up" className={ctaPrimary}>
                <Zap className="size-4" aria-hidden="true" />
                Start selling free
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-caption text-content-secondary">
              {['No card needed', 'UPI and cards', 'GST ready', 'Cancel any time'].map((point) => (
                <li key={point} className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-positive" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <SiteFooter />
      </div>
    </Motion>
  )
}
