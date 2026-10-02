'use client'

import { useState, type SubmitEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import { Button, Input, Select } from '@creatorhub/ui'

import { AuthShell } from '@/components/auth/AuthShell'
import { FormError } from '@/components/auth/FormError'
import { createWorkspaceAction } from '@/lib/workspace-actions'

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

const CURRENCIES = [
  { value: 'INR', label: 'Indian Rupee (₹)' },
  { value: 'USD', label: 'US Dollar ($)' },
]

export function CreateStoreForm({
  creatorName,
  addressSuffix,
}: {
  readonly creatorName: string
  readonly addressSuffix: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(
    creatorName ? `${creatorName.split(' ')[0] ?? creatorName}'s Studio` : '',
  )
  const [slug, setSlug] = useState(creatorName ? toSlug(creatorName) : '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const address = addressSuffix
    ? `${slug || 'your-name'}${addressSuffix}`
    : `/s/${slug || 'your-name'}`

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('Give your store a name of at least two characters.')
      return
    }
    if (slug.length < 3) {
      setError('Choose a store address of at least three characters.')
      return
    }
    setLoading(true)
    const result = await createWorkspaceAction({
      name: name.trim(),
      slug,
      defaultCurrency: currency,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    })
    if (!result.success) {
      setLoading(false)
      setError(result.error.detail)
      return
    }
    router.push(`/workspaces/${result.data.workspaceId}?welcome=1`)
  }

  return (
    <AuthShell title="Name your store" subtitle="You can change all of this later.">
      <FormError message={error} />
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
        <Input
          label="Store name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugTouched) setSlug(toSlug(e.target.value))
          }}
        />
        <Input
          label="Store address"
          name="slug"
          required
          value={slug}
          hint="Lowercase letters, numbers, and hyphens."
          {...(addressSuffix
            ? { suffix: <span className="text-content-tertiary">{addressSuffix}</span> }
            : {})}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(toSlug(e.target.value))
          }}
        />
        <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-surface-sunken px-3.5 py-3 text-body">
          <Globe className="size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
          <span className="truncate text-content-secondary">
            Your store will live at{' '}
            <span className="font-medium text-content-primary">{address}</span>
          </span>
        </div>
        <Select
          label="Currency you price in"
          options={CURRENCIES}
          value={currency}
          onValueChange={setCurrency}
        />
        <Button
          type="submit"
          fullWidth
          size="large"
          loading={loading}
          loadingLabel="Creating your store"
        >
          Create store
        </Button>
      </form>
    </AuthShell>
  )
}
