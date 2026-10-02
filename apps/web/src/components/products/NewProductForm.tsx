'use client'

/**
 * Step one of a product: what it is and what it costs. The file, images, and
 * publishing happen on the product page this redirects to.
 */
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Gift, Tag } from 'lucide-react'
import { Button, Input } from '@creatorhub/ui'

import { Card, PageHeader, Textarea, cn } from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { FormError } from '@/components/auth/FormError'
import { createProductAction } from '@/lib/catalogue-actions'
import { parsePriceToMinor } from '@/lib/format'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function NewProductForm() {
  const router = useRouter()
  const { workspace, basePath } = useWorkspace()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pricing, setPricing] = useState<'paid' | 'free'>('paid')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const symbol = workspace.currency === 'INR' ? '₹' : '$'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (title.trim().length < 2) {
      setError('Give the product a name.')
      return
    }
    const minor = pricing === 'free' ? 0n : parsePriceToMinor(price)
    if (minor === null || (pricing === 'paid' && minor < 100n)) {
      setError(`Enter a price of at least ${symbol}1, or make it free.`)
      return
    }

    setLoading(true)
    const slug = `${slugify(title) || 'product'}-${Date.now().toString(36).slice(-4)}`
    const result = await createProductAction(workspace.id, {
      title: title.trim(),
      slug,
      description: description.trim() || null,
      currency: workspace.currency as never,
      basePrice: minor,
      status: 'draft',
      visibility: 'public',
    })
    if (!result.success) {
      setLoading(false)
      setError(result.error.detail)
      return
    }
    router.push(`${basePath}/products/${result.data.productId}?created=1`)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        crumbs={[{ label: 'Products', href: `${basePath}/products` }, { label: 'New' }]}
        title="New product"
        description="Name it and price it. You will add the file and images next."
      />
      <Card>
        <FormError message={error} />
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-6" noValidate>
          <Input
            label="Product name"
            required
            value={title}
            placeholder="Golden Hour Preset Pack"
            onChange={(e) => {
              setTitle(e.target.value)
            }}
          />
          <Textarea
            label="Description"
            hint="What it is, who it is for, what is inside. Line breaks are kept."
            rows={5}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
            }}
          />

          <fieldset>
            <legend className="mb-2.5 text-body font-medium">Pricing</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { value: 'paid', title: 'Paid', body: 'Buyers pay before they download.', icon: Tag },
                  { value: 'free', title: 'Free', body: 'Collect an email in exchange. Great for lead magnets.', icon: Gift },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors',
                    pricing === option.value ? 'border-accent bg-accent-subtle/50' : 'border-border-subtle hover:border-border-default',
                  )}
                >
                  <input
                    type="radio"
                    name="pricing"
                    value={option.value}
                    checked={pricing === option.value}
                    onChange={() => {
                      setPricing(option.value)
                    }}
                    className="sr-only"
                  />
                  <option.icon className={cn('mt-0.5 size-5 shrink-0', pricing === option.value ? 'text-accent' : 'text-content-tertiary')} aria-hidden="true" />
                  <span>
                    <span className="block font-medium">{option.title}</span>
                    <span className="mt-0.5 block text-caption text-content-secondary">{option.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {pricing === 'paid' && (
            <Input
              label="Price"
              inputMode="decimal"
              required
              value={price}
              prefix={symbol}
              placeholder="499"
              hint={
                workspace.currency === 'INR'
                  ? 'In rupees. GST is added at checkout only if you are GST registered.'
                  : 'In US dollars.'
              }
              onChange={(e) => {
                setPrice(e.target.value)
              }}
            />
          )}

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-5">
            <Button
              variant="secondary"
              onClick={() => {
                router.push(`${basePath}/products`)
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} loadingLabel="Creating">
              Continue
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
