'use client'

/**
 * Workspace Creation Screen.
 *
 * Responsibilities: onboard creators by provisioning their initial workspace tenant.
 * Stamping currency (INR default) and custom subdomain slug.
 */
import { useState, type SyntheticEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import { createWorkspaceAction } from '@/lib/workspace-actions'

const CURRENCIES = [
  { value: 'INR', label: 'INR (₹) — Indian Rupee' },
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
    // Auto-generate slug suggestion if not manually set
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
      setError('Please enter a name for your workspace.')
      return
    }

    if (!slug.trim()) {
      setError('Please choose a subdomain slug.')
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
      title: 'Workspace created',
      description: `Welcome to ${name.trim()}. You are now the workspace owner.`,
      variant: 'success',
    })

    router.push(`/workspaces/${res.data.workspaceId}`)
  }

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-surface-raised border-border-control w-full max-w-lg rounded-lg border p-8 shadow-elevation-1">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="font-display text-title text-content-primary">Create your workspace</h1>
          <p className="text-body text-content-secondary">
            Set up your brand identity and store domain.
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
            <div
              role="alert"
              className="bg-critical-subtle text-critical border-critical rounded-sm border p-4 text-caption"
            >
              <p className="font-medium">Workspace creation error</p>
              <p>{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <Input
              label="Workspace name"
              required
              value={name}
              onChange={(e) => {
                handleNameChange(e.target.value)
              }}
              disabled={loading}
              placeholder="Acme Digital"
              hint="Your business or personal brand name."
            />

            <Input
              label="Store subdomain"
              required
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }}
              disabled={loading}
              placeholder="acme"
              suffix={<span className="text-content-tertiary text-caption">.creatorhub.com</span>}
              hint="Used for your public storefront link."
            />

            <Select
              label="Primary currency"
              options={CURRENCIES}
              value={currency}
              onValueChange={(val) => {
                setCurrency(val)
              }}
              disabled={loading}
            />

            <Select
              label="Store timezone"
              options={TIMEZONES}
              value={timezone}
              onValueChange={(val) => {
                setTimezone(val)
              }}
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            loading={loading}
            loadingLabel="Setting up workspace..."
          >
            Create workspace
          </Button>
        </form>
      </div>
    </main>
  )
}
