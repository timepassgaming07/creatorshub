'use client'

/**
 * CreatorHub Landing Page — God-Mode Visual Architecture.
 *
 * Built with Apple, Linear, and Stripe grade visual excellence:
 * - Always-visible floating glassmorphism navigation bar (fixed top-4)
 * - Dynamic dual-theme aurora mesh & cyber grid background
 * - Hero 3D Perspective Workspace Terminal with interactive creator tabs
 * - Viewport-triggered scroll animations (ScrollReveal) on all sections
 * - Perfectly aligned 3D Tilt Cards with cursor-following glare
 * - Bento Grid with GlowCards featuring mouse-tracking radial spotlight & border glow
 * - Interactive Storefront Theme Studio (abstract wireframes, zero fake names/data)
 * - Real pay-as-you-grow pricing model (₹0 monthly subscriptions)
 * - 100% genuine creator-friendly features — zero fake statistics, zero GST/invoicing
 */
import Link from 'next/link'
import { motion } from 'motion/react'
import { GlowCard } from '@/components/ui/GlowCard'
import { ThreeDTiltCard } from '@/components/ui/ThreeDTiltCard'
import { Hero3DVisualizer } from '@/components/ui/Hero3DVisualizer'
import { StorefrontThemePreviewer } from '@/components/ui/StorefrontThemePreviewer'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { BorderBeam } from '@/components/ui/BorderBeam'
import { ScrollReveal } from '@/components/ui/ScrollReveal'

/* ---------------------------------------------------------------------------
 * Real Supported Product Types (Equalized 3D Tilt Cards)
 * --------------------------------------------------------------------------- */
const productCapabilities = [
  {
    title: 'Digital Downloads & Files',
    badge: 'Instant Delivery',
    badgeColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    description: 'Sell presets, design templates, software packages, eBooks, UI kits, and assets with instant download links for buyers.',
    icon: '📦',
  },
  {
    title: 'Video Courses & Masterclasses',
    badge: 'Organized Lessons',
    badgeColor: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20',
    description: 'Host structured multi-chapter video lessons with student logins, downloadable resources, and smooth streaming.',
    icon: '🎥',
  },
  {
    title: 'Memberships & Communities',
    badge: 'Recurring Access',
    badgeColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    description: 'Offer monthly or annual recurring access to premium content, private community channels, and exclusive resources.',
    icon: '💎',
  },
  {
    title: '1-on-1 Coaching & Advisory',
    badge: 'Bookable Sessions',
    badgeColor: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
    description: 'Package your expertise into bookable consultation sessions, portfolio reviews, private mentorship, and client calls.',
    icon: '🤝',
  },
]

/* ---------------------------------------------------------------------------
 * Bento Feature Matrix — Real, Authentic Creator Features
 * --------------------------------------------------------------------------- */
const bentoFeatures = [
  {
    title: '1-Click UPI & Automated Invoices',
    badge: 'Instant Payments',
    badgeColor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    description: 'Accept Google Pay, PhonePe, Paytm QR, and cards with instant payment receipts and official automated invoices generated for every buyer.',
    icon: (
      <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    tags: ['Google Pay & PhonePe', 'Paytm QR', 'Automated Invoices'],
    colSpan: 'lg:col-span-4',
  },
  {
    title: 'Smart Upload & Auto-Listing',
    badge: 'Zero Friction',
    badgeColor: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    description: 'Drop any digital file (ZIP, MP4, PDF, Preset). The system automatically drafts your title, description, and pricing for 1-click verification & listing.',
    icon: (
      <svg className="h-6 w-6 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
    tags: ['Auto-Generated Details', '1-Click Listing', 'Instant File Parsing'],
    colSpan: 'lg:col-span-4',
  },
  {
    title: 'Automated Instant Delivery',
    badge: 'Zero Manual Work',
    badgeColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    description: 'Buyers automatically receive their download files, project templates, or course access immediately after payment, 24/7.',
    icon: (
      <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    tags: ['Direct File Downloads', 'Video Course Access', 'Automated Email Link'],
    colSpan: 'lg:col-span-4',
  },
  {
    title: 'Simple Sales & Order Tracking',
    badge: 'Creator Dashboard',
    badgeColor: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
    description: 'See your daily earnings, customer list, order history, and top-selling products in one clean, straightforward dashboard.',
    icon: (
      <svg className="h-6 w-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    tags: ['Live Daily Revenue', 'Order History', 'Customer Directory'],
    colSpan: 'lg:col-span-4',
  },
  {
    title: 'Referral & Affiliate System',
    badge: 'Audience Growth',
    badgeColor: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
    description: 'Let your community and partners share your store links with custom commission percentages and automatic tracking.',
    icon: (
      <svg className="h-6 w-6 text-pink-600 dark:text-pink-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
    tags: ['Custom Commission Rates', 'Unique Referral Links', 'Partner Tracking'],
    colSpan: 'lg:col-span-4',
  },
  {
    title: 'Custom Branded Store & Domain',
    badge: 'Storefront Studio',
    badgeColor: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    description: 'Customize your theme colors, link-in-bio page, and store branding, or connect your own custom domain name effortlessly.',
    icon: (
      <svg className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
    tags: ['4 Theme Presets', 'Custom Domain Name', 'Link-in-Bio Ready'],
    colSpan: 'lg:col-span-4',
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-surface-base text-content-primary selection:bg-indigo-500 selection:text-white overflow-x-hidden font-sans transition-colors duration-300">
      {/* ---------------------------------------------------------------------
       * Dynamic Background Aurora Glow & Mesh
       * --------------------------------------------------------------------- */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20 dark:opacity-30" />
        <div className="absolute -top-[250px] left-1/2 -translate-x-1/2 h-[650px] w-[1000px] rounded-full bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-pink-500/15 blur-[140px] animate-pulse-slow" />
        <div className="absolute top-[35%] right-[-150px] h-[450px] w-[450px] rounded-full bg-cyan-500/15 blur-[130px]" />
        <div className="absolute top-[65%] left-[-150px] h-[450px] w-[450px] rounded-full bg-emerald-500/15 blur-[130px]" />
      </div>

      {/* ---------------------------------------------------------------------
       * Always-Visible Fixed Glassmorphic Floating Top Navigation Bar
       * --------------------------------------------------------------------- */}
      <header className="fixed top-4 inset-x-0 mx-auto max-w-5xl z-50 px-4 sm:px-6">
        <div className="glass-nav rounded-2xl px-4 py-2.5 flex items-center justify-between shadow-2xl transition-all">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-sm font-black text-white shadow-md shadow-indigo-500/25 transition-transform group-hover:scale-105">
              C
            </div>
            <span className="text-base font-black tracking-tight text-content-primary">CreatorHub</span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-xs font-bold text-content-secondary">
            <a href="#products" className="hover:text-content-primary transition-colors">Products</a>
            <a href="#features" className="hover:text-content-primary transition-colors">Features</a>
            <a href="#themes" className="hover:text-content-primary transition-colors">Storefront Studio</a>
            <a href="#pricing" className="hover:text-content-primary transition-colors">Pricing</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="rounded-xl px-3 py-1.5 text-xs font-bold text-content-secondary transition-colors hover:text-content-primary hover:bg-surface-sunken"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="shimmer-btn rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-1.5 text-xs font-black text-white shadow-md shadow-indigo-500/25 transition-transform hover:scale-105 active:scale-95"
            >
              Start Free →
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------------
       * Hero Section with 3D Perspective Terminal
       * --------------------------------------------------------------------- */}
      <section className="relative z-10 pt-28 sm:pt-36 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Status Announcement Pill */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 backdrop-blur-xl mb-6 shadow-sm"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Pay Only When You Earn · ₹0 Monthly Subscriptions</span>
          <span className="text-indigo-500">→</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-content-primary leading-[1.08] max-w-4xl mx-auto"
        >
          The Complete Storefront for{' '}
          <span className="text-gradient-animated bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
            Digital Creators.
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-content-secondary leading-relaxed font-normal"
        >
          Launch your high-converting branded digital store in minutes. Accept 1-click UPI and card payments, deliver instant file downloads and video courses, and track sales in one simple dashboard.
        </motion.p>

        {/* Primary CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-4"
        >
          <Link
            href="/sign-up"
            className="shimmer-btn rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-8 py-4 text-sm font-black text-white shadow-xl shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95"
          >
            Launch Your Storefront — Free
          </Link>
          <Link
            href="/sign-in"
            className="rounded-2xl border border-border-control bg-surface-raised px-6 py-4 text-sm font-bold text-content-primary backdrop-blur-xl transition-all hover:bg-surface-overlay"
          >
            Sign In with Passkey →
          </Link>
        </motion.div>

        {/* Hero 3D Perspective Visualizer */}
        <Hero3DVisualizer />
      </section>

      {/* ---------------------------------------------------------------------
       * Real Supported Product Capabilities (Equalized 3D Tilt Cards with ScrollReveal)
       * --------------------------------------------------------------------- */}
      <section id="products" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-24 border-t border-border-subtle">
        <ScrollReveal direction="up" className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="inline-block rounded-full bg-accent/10 border border-accent/20 px-3.5 py-1 text-xs font-bold text-accent uppercase tracking-wider">
            Versatile Catalogue
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-content-primary tracking-tight">
            Monetize any form of digital expertise.
          </h2>
          <p className="text-sm text-content-secondary">
            Whether you sell single downloadable files, structured video masterclasses, recurring memberships, or private advisory.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {productCapabilities.map((prod, index) => (
            <ScrollReveal
              key={prod.title}
              direction="up"
              delay={index * 0.1}
              className="h-full"
            >
              <ThreeDTiltCard
                className="h-full rounded-3xl border border-border-subtle bg-surface-raised/80 p-6 shadow-elevation-1 hover:border-accent/40 backdrop-blur-xl transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl">{prod.icon}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${prod.badgeColor}`}>
                      {prod.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-content-primary mb-2">{prod.title}</h3>
                  <p className="text-xs text-content-secondary leading-relaxed">{prod.description}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-border-subtle flex items-center justify-between text-xs font-bold text-accent">
                  <span>Instant Setup</span>
                  <span>→</span>
                </div>
              </ThreeDTiltCard>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------------
       * Bento Grid 2.0 Feature Matrix (GlowCards with ScrollReveal — Genuine Features)
       * --------------------------------------------------------------------- */}
      <section id="features" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-24 border-t border-border-subtle bg-surface-sunken/30">
        <ScrollReveal direction="up" className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="inline-block rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            Built For Creators
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-content-primary tracking-tight">
            Everything you need to sell online.
          </h2>
          <p className="text-sm text-content-secondary">
            Zero technical complexity. Start selling your digital downloads, courses, and coaching sessions in minutes.
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5 items-stretch">
          {bentoFeatures.map((feat, index) => (
            <ScrollReveal
              key={feat.title}
              direction="up"
              delay={index * 0.1}
              className={`${feat.colSpan} flex`}
            >
              <GlowCard
                className="w-full flex flex-col justify-between p-8"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border-subtle bg-surface-sunken shadow-inner">
                      {feat.icon}
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${feat.badgeColor}`}>
                      {feat.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-content-primary mb-2">{feat.title}</h3>
                  <p className="text-xs text-content-secondary leading-relaxed mb-6">{feat.description}</p>
                </div>

                <div className="pt-4 border-t border-border-subtle flex flex-wrap gap-2">
                  {feat.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1 text-[11px] font-semibold text-content-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </GlowCard>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------------
       * Storefront Theme Studio Showcase
       * --------------------------------------------------------------------- */}
      <section id="themes" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 border-t border-border-subtle scroll-mt-24">
        <ScrollReveal direction="up">
          <StorefrontThemePreviewer />
        </ScrollReveal>
      </section>

      {/* ---------------------------------------------------------------------
       * Transparent Pay-As-You-Grow Pricing
       * --------------------------------------------------------------------- */}
      <section id="pricing" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-24 border-t border-border-subtle bg-surface-sunken/40">
        <ScrollReveal direction="up" className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <span className="inline-block rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Simple & Transparent Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-content-primary tracking-tight">
            Pay only when you succeed.
          </h2>
          <p className="text-xs sm:text-sm text-content-secondary">
            No upfront cost. No expensive monthly software subscriptions. We take a transparent small transaction fee only when you make a sale.
          </p>
        </ScrollReveal>

        <ScrollReveal direction="scale" delay={0.15}>
          <div className="max-w-xl mx-auto rounded-[32px] border border-border-subtle bg-surface-raised p-8 sm:p-10 shadow-elevation-2 relative overflow-hidden">
            <BorderBeam size={260} duration={9} colorFrom="#10b981" colorTo="#6366f1" />

            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                Pay-As-You-Grow
              </div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl sm:text-6xl font-black text-content-primary">₹0</span>
                <span className="text-sm font-semibold text-content-tertiary">/month subscription</span>
              </div>
              <p className="text-xs text-content-secondary max-w-md mx-auto">
                Small transaction fee per successful payment. You get access to all store themes, custom domains, file delivery, and analytics from day one.
              </p>

              <div className="border-t border-border-subtle pt-6 space-y-3 text-left text-xs font-semibold text-content-secondary">
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Unlimited digital products, courses, and downloads</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Instant 1-Click UPI (GPay / PhonePe / Paytm) and Card checkout</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Custom store themes and custom domain name support</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Instant secure file storage & automated download links</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Referral & affiliate system with automatic commissions</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Live sales and order revenue analytics</span>
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/sign-up"
                  className="shimmer-btn block w-full rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 py-4 text-sm font-black text-white shadow-xl shadow-indigo-500/30 transition-transform hover:scale-105 active:scale-95 text-center"
                >
                  Launch Your Digital Store Free →
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ---------------------------------------------------------------------
       * Final High-Impact Call-to-Action
       * --------------------------------------------------------------------- */}
      <section className="relative z-10 py-24 px-4 sm:px-6 lg:px-8">
        <ScrollReveal direction="up" className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-[36px] border border-border-subtle bg-gradient-to-b from-surface-raised via-surface-raised to-surface-sunken p-10 sm:p-16 text-center shadow-elevation-3">
            {/* Ambient decorative glow orbs inside CTA box */}
            <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-pink-500/20 blur-3xl" />

            <div className="relative z-10 max-w-2xl mx-auto space-y-6">
              <span className="inline-block rounded-full bg-accent/10 border border-accent/20 px-4 py-1.5 text-xs font-bold text-accent">
                ⚡ Ready to Launch in 2 Minutes?
              </span>

              <h2 className="text-3xl sm:text-5xl font-black text-content-primary tracking-tight leading-tight">
                Start selling your digital products today.
              </h2>

              <p className="text-sm sm:text-base text-content-secondary leading-relaxed">
                Join creators building professional digital storefronts with instant UPI checkout and automated file delivery.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/sign-up"
                  className="shimmer-btn rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-10 py-4 text-base font-black text-white shadow-xl shadow-indigo-500/30 transition-transform hover:scale-105 active:scale-95"
                >
                  Create Your Free Store →
                </Link>
                <Link
                  href="/sign-in"
                  className="rounded-2xl border border-border-control bg-surface-raised px-6 py-4 text-sm font-bold text-content-primary hover:bg-surface-overlay transition-colors"
                >
                  Sign In
                </Link>
              </div>

              <div className="flex items-center justify-center gap-6 text-xs text-content-tertiary pt-4">
                <span>✓ ₹0 Monthly Fees</span>
                <span>✓ Instant UPI & Cards</span>
                <span>✓ Cancel Anytime</span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ---------------------------------------------------------------------
       * Footer
       * --------------------------------------------------------------------- */}
      <footer className="relative z-10 border-t border-border-subtle bg-surface-sunken py-12 px-4 sm:px-6 lg:px-8 text-content-tertiary text-xs">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white">
              C
            </div>
            <span className="font-bold text-content-primary">CreatorHub Technologies Inc.</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#products" className="hover:text-content-primary transition-colors">Products</a>
            <a href="#features" className="hover:text-content-primary transition-colors">Features</a>
            <a href="#themes" className="hover:text-content-primary transition-colors">Storefront Themes</a>
            <a href="#pricing" className="hover:text-content-primary transition-colors">Pricing</a>
            <Link href="/sign-in" className="hover:text-content-primary transition-colors">Sign in</Link>
            <Link href="/sign-up" className="hover:text-content-primary transition-colors">Sign up</Link>
          </div>

          <p>© {new Date().getFullYear()} CreatorHub. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
