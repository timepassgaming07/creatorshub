'use client'

/**
 * Interactive Storefront Theme Preset Switcher & Abstract Phone Frame.
 *
 * Demonstrates the 4 built-in storefront themes that creators can publish.
 * Uses abstract wireframe product cards — no fake names, prices, or usernames.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { BorderBeam } from './BorderBeam'

const THEMES = [
  {
    id: 'cyber',
    name: 'Obsidian Cyber',
    accent: '#6366F1',
    accentRgb: '99, 102, 241',
    bg: 'bg-slate-950',
    cardBg: 'bg-slate-900/80 border-white/10',
    buttonBg: 'bg-indigo-600 text-white shadow-indigo-500/25',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-400',
    textAccent: 'text-indigo-400',
    desc: 'High-tech dark mode engineered for developers, engineering coaches, and crypto creators.',
    badge: 'Popular',
  },
  {
    id: 'minimal',
    name: 'Warm Paper Minimal',
    accent: '#D97706',
    accentRgb: '217, 119, 6',
    bg: 'bg-[#FDFBF7]',
    cardBg: 'bg-white border-stone-200',
    buttonBg: 'bg-stone-900 text-white',
    textPrimary: 'text-stone-900',
    textSecondary: 'text-stone-500',
    textAccent: 'text-amber-600',
    desc: 'Warm cream aesthetic with editorial typography for writers, authors, and lifestyle coaches.',
    badge: 'Clean',
  },
  {
    id: 'neon',
    name: 'Neon Horizon',
    accent: '#EC4899',
    accentRgb: '236, 72, 153',
    bg: 'bg-black',
    cardBg: 'bg-neutral-900/90 border-pink-500/30 shadow-pink-500/10',
    buttonBg: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-pink-500/30',
    textPrimary: 'text-white',
    textSecondary: 'text-neutral-400',
    textAccent: 'text-pink-400',
    desc: 'High-chroma glowing borders for designers, digital artists, and video creators.',
    badge: 'Vibrant',
  },
  {
    id: 'editorial',
    name: 'Editorial Serif',
    accent: '#0D9488',
    accentRgb: '13, 148, 136',
    bg: 'bg-stone-900',
    cardBg: 'bg-stone-800/80 border-stone-700',
    buttonBg: 'bg-teal-600 text-white shadow-teal-500/20',
    textPrimary: 'text-stone-100',
    textSecondary: 'text-stone-400',
    textAccent: 'text-teal-400',
    desc: 'Timeless luxury aesthetic tailored for business consultancies, masterminds, and agency templates.',
    badge: 'Pro',
  },
]

export function StorefrontThemePreviewer() {
  const [activeTheme, setActiveTheme] = useState(THEMES[0]!)

  return (
    <div className="relative mx-auto max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Theme info & selector pills */}
        <div className="lg:col-span-6 space-y-6">
          <div>
            <span className="inline-block rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              100% Brand Customization
            </span>
            <h3 className="mt-3 text-3xl sm:text-4xl font-black text-content-primary tracking-tight leading-tight">
              A storefront that looks like{' '}
              <span className="text-gradient-animated bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
                your unique brand.
              </span>
            </h3>
            <p className="mt-2 text-sm text-content-secondary leading-relaxed">
              Choose from 4 conversion-tested presets, connect your custom apex domain, and adjust colors in real-time. Zero coding required.
            </p>
          </div>

          {/* Theme selector tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {THEMES.map((theme) => {
              const isSelected = activeTheme.id === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => setActiveTheme(theme)}
                  className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all duration-300 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500 shadow-lg shadow-indigo-500/10'
                      : 'border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/60 hover:border-indigo-300 dark:hover:border-white/20 hover:bg-white/80 dark:hover:bg-slate-900/90'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-sm font-bold text-content-primary">{theme.name}</span>
                    <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                      {theme.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-content-tertiary leading-relaxed line-clamp-2">
                    {theme.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Interactive Phone Mockup with Abstract Wireframe */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="relative w-full max-w-[340px] rounded-[42px] border-[6px] border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-3 shadow-2xl shadow-indigo-500/10">
            <BorderBeam size={200} duration={8} colorFrom="#6366f1" colorTo="#ec4899" />

            {/* Dynamic themed screen */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTheme.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35 }}
                className={`overflow-hidden rounded-[32px] p-5 ${activeTheme.bg} min-h-[520px] flex flex-col justify-between`}
              >
                {/* Abstract creator profile */}
                <div className="text-center pt-2">
                  <div className="mx-auto h-16 w-16 rounded-full p-1 mb-3" style={{ boxShadow: `0 0 0 2px rgba(${activeTheme.accentRgb}, 0.4)` }}>
                    <div
                      className="h-full w-full rounded-full flex items-center justify-center text-white text-xl font-black"
                      style={{ background: activeTheme.accent }}
                    >
                      ✦
                    </div>
                  </div>
                  <div className={`h-4 w-28 mx-auto rounded-full ${activeTheme.textSecondary} mb-1.5`} style={{ background: `rgba(${activeTheme.accentRgb}, 0.15)` }} />
                  <div className={`h-2.5 w-20 mx-auto rounded-full opacity-50`} style={{ background: `rgba(${activeTheme.accentRgb}, 0.1)` }} />
                  <p className={`text-[10px] mt-2 ${activeTheme.textSecondary}`}>
                    Your brand identity, your audience.
                  </p>
                </div>

                {/* Abstract product cards */}
                <div className="space-y-3 my-4">
                  {[
                    { width: 'w-24', priceWidth: 'w-10' },
                    { width: 'w-32', priceWidth: 'w-12' },
                    { width: 'w-20', priceWidth: 'w-8' },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-2xl border p-3.5 ${activeTheme.cardBg} transition-all`}>
                      <div className="flex items-center justify-between">
                        <div className="space-y-1.5">
                          <div className={`h-3 ${item.width} rounded-full`} style={{ background: `rgba(${activeTheme.accentRgb}, 0.2)` }} />
                          <div className="h-2 w-16 rounded-full opacity-30" style={{ background: `rgba(${activeTheme.accentRgb}, 0.15)` }} />
                        </div>
                        <div className={`h-4 ${item.priceWidth} rounded-lg`} style={{ background: `rgba(${activeTheme.accentRgb}, 0.25)` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Buy button */}
                <div className="pt-2">
                  <div className={`w-full py-3 rounded-xl text-center text-xs font-black shadow-lg ${activeTheme.buttonBg} transition-all`}>
                    ⚡ Instant Checkout
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
