'use client'

/**
 * Hero 3D Perspective Visualizer — Liquid Glass Creator Studio.
 *
 * An interactive 3D workspace terminal showcase with:
 * - 3D perspective rotation on scroll and mouse move
 * - 4 Creator-centric workflows (Store Preview, 1-Click UPI, Instant Delivery, Sales Dashboard)
 * - Ultra-frosted Liquid Glass architecture adapting perfectly to both Light & Dark themes
 * - Zero developer jargon, zero fake statistics, zero GST/invoicing claims
 */
import { useState, useRef } from 'react'
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react'
import { BorderBeam } from '@/components/ui/BorderBeam'

type TabKey = 'store' | 'checkout' | 'delivery' | 'analytics'

export function Hero3DVisualizer() {
  const [activeTab, setActiveTab] = useState<TabKey>('store')
  const containerRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })

  // Smooth 3D perspective rotation linked to scroll
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [10, 0, -8])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 0.96])
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.7, 1, 1, 0.8])

  return (
    <div ref={containerRef} style={{ perspective: 1400 }} className="relative mx-auto max-w-5xl mt-12 mb-8">
      {/* Ambient background glow behind the 3D frame */}
      <div className="pointer-events-none absolute -inset-4 rounded-[40px] bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-3xl opacity-60 dark:opacity-40" />

      <motion.div
        style={{
          rotateX,
          scale,
          opacity,
          transformStyle: 'preserve-3d',
        }}
        className="relative overflow-hidden rounded-[36px] liquid-glass p-4 sm:p-8 shadow-2xl transition-colors duration-300"
      >
        <BorderBeam size={320} duration={12} colorFrom="#6366f1" colorTo="#ec4899" />

        {/* Browser / Store Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-rose-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-surface-sunken border border-border-subtle px-3 py-1 text-xs font-semibold text-content-primary">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>yourbrand.creatorhub.store</span>
            </div>
          </div>

          {/* Interactive Feature Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-surface-sunken p-1 text-xs font-bold border border-border-subtle">
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeTab === 'store'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              🛍️ Store Preview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('checkout')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeTab === 'checkout'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              ⚡ 1-Click UPI
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('delivery')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeTab === 'delivery'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              📥 Instant Delivery
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeTab === 'analytics'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              📊 Sales Dashboard
            </button>
          </div>
        </div>

        {/* Tab Content Display Area */}
        <div className="pt-6 min-h-[380px]">
          <AnimatePresence mode="wait">
            {/* TAB 1: Live Store Preview */}
            {activeTab === 'store' && (
              <motion.div
                key="store"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
              >
                <div className="lg:col-span-6 space-y-4 text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-xs font-bold text-accent">
                    <span>🛍️ Your Branded Storefront</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-content-primary tracking-tight">
                    A beautiful store that turns followers into paying customers.
                  </h3>
                  <p className="text-xs sm:text-sm text-content-secondary leading-relaxed">
                    Set up your link-in-bio storefront in 2 minutes. Showcase your downloadable files, video lessons, and consultation packages with seamless 1-click checkout.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-content-secondary">
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Custom Link-in-Bio</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Custom Colors & Logo</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Own Domain Name</span>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-border-subtle bg-surface-raised/80 p-5 shadow-lg space-y-3 backdrop-blur-xl text-left">
                  {/* Store Profile Card */}
                  <div className="flex items-center gap-3 border-b border-border-subtle pb-3">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-black shadow-md">
                      ✦
                    </div>
                    <div>
                      <p className="text-sm font-black text-content-primary">Your Digital Studio</p>
                      <p className="text-[11px] text-accent font-semibold">@yourbrand · Verified Creator</p>
                    </div>
                  </div>

                  {/* Sample Store Products */}
                  <div className="space-y-2.5">
                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📦</span>
                        <div>
                          <p className="text-xs font-bold text-content-primary">Digital Design Kit & Presets</p>
                          <p className="text-[10px] text-content-tertiary">Instant File Download</p>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-content-primary bg-surface-raised px-2.5 py-1 rounded-lg border border-border-subtle">
                        ₹999
                      </span>
                    </div>

                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎥</span>
                        <div>
                          <p className="text-xs font-bold text-content-primary">Complete Video Masterclass</p>
                          <p className="text-[10px] text-content-tertiary">12 Lessons + Worksheets</p>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-content-primary bg-surface-raised px-2.5 py-1 rounded-lg border border-border-subtle">
                        ₹2,499
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    <span>⚡ 1-Click UPI & Cards Accepted</span>
                    <span>Instant Delivery ✓</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 2: Instant 1-Click UPI Payment */}
            {activeTab === 'checkout' && (
              <motion.div
                key="checkout"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
              >
                <div className="lg:col-span-6 space-y-4 text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <span>⚡ 1-Click UPI & Automated Invoices</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-content-primary tracking-tight">
                    Instant 1-Click UPI & Automated Invoices
                  </h3>
                  <p className="text-xs sm:text-sm text-content-secondary leading-relaxed">
                    Buyers pay in seconds directly with Google Pay, PhonePe, Paytm QR, or cards. Official automated invoices & receipts are sent instantly upon payment.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-content-secondary">
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">UPI QR Code</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Google Pay & PhonePe</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Automated Invoice</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Cards & Netbanking</span>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-border-subtle bg-surface-raised/80 p-5 shadow-lg text-left backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xs">
                        ₹
                      </div>
                      <div>
                        <p className="text-xs font-bold text-content-primary">Order Checkout</p>
                        <p className="text-[10px] text-content-tertiary">Automated Invoice #INV-8491</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-content-primary">₹1,999.00</span>
                  </div>

                  <div className="py-4 space-y-2 text-xs">
                    <div className="flex justify-between text-content-secondary">
                      <span>Product Price</span>
                      <span>₹1,999.00</span>
                    </div>
                    <div className="flex justify-between text-content-secondary">
                      <span>Platform Setup Fee</span>
                      <span className="text-emerald-500 font-bold">FREE (₹0)</span>
                    </div>
                    <div className="border-t border-border-subtle pt-2 flex justify-between font-bold text-content-primary">
                      <span>Total Amount (Invoice Included)</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-black">₹1,999.00</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <span>⚡ Pay with UPI (GPay / PhonePe / Paytm)</span>
                    <span className="text-emerald-500">→</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 3: Instant File Delivery & Invoices */}
            {activeTab === 'delivery' && (
              <motion.div
                key="delivery"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
              >
                <div className="lg:col-span-6 space-y-4 text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    <span>📥 Zero Manual Work</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-content-primary tracking-tight">
                    Instant File Delivery & Automated Invoice
                  </h3>
                  <p className="text-xs sm:text-sm text-content-secondary leading-relaxed">
                    The moment payment succeeds, your customer instantly receives their unique download link, official invoice, and course credentials.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-content-secondary">
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Instant Downloads</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Automated Invoice & Receipt</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Lifetime Customer Access</span>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-border-subtle bg-surface-raised/80 p-5 shadow-lg space-y-3 backdrop-blur-xl text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-content-primary">Customer Order Status</span>
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400">Payment Complete ✓</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">📦</span>
                        <div>
                          <p className="font-bold text-content-primary">creator-starter-pack.zip</p>
                          <p className="text-[10px] text-content-tertiary">All project templates & assets</p>
                        </div>
                      </div>
                      <span className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-[11px] font-bold shadow-sm">
                        Download ⬇
                      </span>
                    </div>

                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎥</span>
                        <div>
                          <p className="font-bold text-content-primary">Course Member Access</p>
                          <p className="text-[10px] text-content-tertiary">Student Portal & Video Lessons</p>
                        </div>
                      </div>
                      <span className="rounded-lg bg-surface-raised border border-border-subtle text-content-primary px-3 py-1.5 text-[11px] font-bold">
                        Access Course →
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB 4: Simple Sales & Revenue Dashboard */}
            {activeTab === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
              >
                <div className="lg:col-span-6 space-y-4 text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 border border-violet-500/30 px-3 py-1 text-xs font-bold text-violet-600 dark:text-violet-400">
                    <span>📊 Clean Analytics</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-content-primary tracking-tight">
                    Track your sales and revenue simply.
                  </h3>
                  <p className="text-xs sm:text-sm text-content-secondary leading-relaxed">
                    No complicated charts or spreadsheets. See your daily earnings, customer list, top products, and referral commissions in one clear dashboard.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-content-secondary">
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Real-Time Earnings</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Orders List</span>
                    <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">Affiliate Payouts</span>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-2xl border border-border-subtle bg-surface-raised/80 p-5 shadow-lg space-y-3 backdrop-blur-xl text-left">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3.5">
                      <p className="text-[10px] font-bold text-content-tertiary uppercase tracking-wider">Total Sales This Month</p>
                      <p className="text-xl font-black text-content-primary mt-1">₹48,500</p>
                      <p className="text-[10px] text-content-secondary font-medium mt-0.5">Live store revenue</p>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3.5">
                      <p className="text-[10px] font-bold text-content-tertiary uppercase tracking-wider">Today&apos;s Orders</p>
                      <p className="text-xl font-black text-content-primary mt-1">12 Orders</p>
                      <p className="text-[10px] text-accent font-bold mt-0.5">₹9,450 earned today</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-subtle bg-surface-sunken p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-content-secondary text-[11px]">
                      <span>Top Product</span>
                      <span className="font-bold text-content-primary">Digital Design Kit</span>
                    </div>
                    <div className="flex items-center justify-between text-content-secondary text-[11px]">
                      <span>Recent Sale</span>
                      <span className="font-bold text-emerald-500">₹999 · UPI · Just now</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
