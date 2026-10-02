'use client'

/**
 * Workspace Creation Screen — Liquid Glass Onboarding.
 *
 * Responsibilities:
 * - Onboard creators by provisioning their initial workspace.
 * - Stamping currency (INR default) and custom subdomain slug with live preview.
 * - Dynamic theme adaptation and creator-first copy (zero developer jargon).
 */
import { useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import { createWorkspaceAction } from '@/lib/workspace-actions'
import { BorderBeam } from '@/components/ui/BorderBeam'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const CURRENCIES = [
  { value: 'INR', label: 'INR (₹) — Indian Rupee (UPI & Cards)' },
  { value: 'USD', label: 'USD ($) — US Dollar' },
  { value: 'EUR', label: 'EUR (€) — Euro' },
  { value: 'GBP', label: 'GBP (£) — British Pound' },
]

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +05:30)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +09:00)' },
  { value: 'UTC', label: 'UTC' },
]

export default function NewWorkspacePage() {
  const router = useRouter()
  const toast = useToast()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  function handleNameChange(value: string) {
    setName(value)
    // Auto-generate slug suggestion if not manually customized
    const suggested = value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    if (suggested) {
      setSlug(suggested)
    }
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault()
    setError(undefined)

    if (!name.trim()) {
      setError('Please enter a name for your creative workspace.')
      return
    }

    if (!slug.trim()) {
      setError('Please choose a subdomain slug for your storefront.')
      return
    }

    setLoading(true)

    const res = await createWorkspaceAction({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      defaultCurrency: currency,
      timezone,
    })

    if (!res.success) {
      setError(res.error.detail)
      setLoading(false)
      return
    }

    toast.show({
      title: 'Workspace created! 🚀',
      description: `Welcome to ${name.trim()}. Your creator studio is ready.`,
      variant: 'success',
    })

    router.push(`/workspaces/${res.data.workspaceId}`)
  }

  return (
    <main id="main" className="min-h-screen bg-surface-base text-content-primary px-4 py-12 flex flex-col justify-between items-center relative overflow-hidden font-sans transition-colors duration-300">
      {/* Ambient background glow & cyber grid */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-20 dark:opacity-30" />
        <div className="absolute -top-[180px] left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-tr from-indigo-500/25 via-purple-500/25 to-pink-500/20 blur-[130px] animate-pulse-slow" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 text-sm font-black text-white shadow-md shadow-indigo-500/25 transition-transform group-hover:scale-105">
            C
          </div>
          <span className="text-base font-black tracking-tight text-content-primary">CreatorHub</span>
        </Link>

        <ThemeToggle />
      </header>

      {/* Main Liquid Glass Form Card */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 w-full max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full rounded-[32px] liquid-glass p-8 sm:p-10 shadow-2xl"
        >
          <BorderBeam size={280} duration={10} colorFrom="#6366f1" colorTo="#ec4899" />

          <div className="mb-8 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              ⚡ Step 1 of 1 · Storefront Setup
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-content-primary">
              Name your creative store
            </h1>
            <p className="text-xs sm:text-sm text-content-secondary leading-relaxed">
              Set up your digital store to upload products, deliver instant downloads, and accept 1-click UPI payments.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="flex flex-col gap-6"
            noValidate
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-bold text-red-600 dark:text-red-400"
              >
                <p className="font-bold">Setup note</p>
                <p className="mt-0.5 font-normal">{error}</p>
              </motion.div>
            )}

            <div className="flex flex-col gap-5">
              <Input
                label="Workspace or Brand Name"
                required
                value={name}
                onChange={(e) => {
                  handleNameChange(e.target.value)
                }}
                disabled={loading}
                placeholder="e.g. Acme Digital Academy"
                hint="Your public brand or creator studio name."
              />

              <div className="flex flex-col gap-1.5">
                <Input
                  label="Storefront Subdomain Link"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                  }}
                  disabled={loading}
                  placeholder="acme"
                  suffix=".creatorhub.store"
                  hint="Used for your public link-in-bio and storefront."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Store Currency"
                  options={CURRENCIES}
                  value={currency}
                  onValueChange={(val) => setCurrency(val)}
                  disabled={loading}
                />

                <Select
                  label="Timezone"
                  options={TIMEZONES}
                  value={timezone}
                  onValueChange={(val) => setTimezone(val)}
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="large"
              loading={loading}
              loadingLabel="Creating store..."
              className="py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black shadow-lg shadow-indigo-500/25 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Launch Creator Workspace →
            </Button>
          </form>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-content-tertiary">
        <p>© {new Date().getFullYear()} CreatorHub. All rights reserved.</p>
      </footer>
    </main>
  )
}
