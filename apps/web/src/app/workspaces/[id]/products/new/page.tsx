'use client'

/**
 * Create Product Screen (Item 3.7).
 *
 * Responsibilities:
 * - Product creation form with title, auto-slug generator, pricing inputs, currency selector.
 * - Integration with @creatorhub/ui primitives (Input, Select, Button, Toast).
 * - Client-side validation and server action execution via createProductAction.
 */
import { use, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { currency, type CurrencyCode } from '@creatorhub/contracts'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import { createProductAction } from '@/lib/catalogue-actions'

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR (₹) — Indian Rupee' },
  { value: 'USD', label: 'USD ($) — US Dollar' },
  { value: 'EUR', label: 'EUR (€) — Euro' },
  { value: 'GBP', label: 'GBP (£) — British Pound' },
]

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public — Visible in storefront and search' },
  { value: 'unlisted', label: 'Unlisted — Only accessible via direct link' },
  { value: 'private', label: 'Private — Accessible only to workspace admins' },
]

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export default function NewProductPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params)
  const router = useRouter()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [currencyVal, setCurrencyVal] = useState<CurrencyCode>(currency('INR'))
  const [basePriceStr, setBasePriceStr] = useState('499.00')
  const [compareAtPriceStr, setCompareAtPriceStr] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (!slugEdited) {
      setSlug(slugify(val))
    }
  }

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)

    if (!title.trim()) {
      setFormError('Product title is required.')
      return
    }

    if (!slug.trim()) {
      setFormError('Product URL slug is required.')
      return
    }

    const basePriceNum = parseFloat(basePriceStr)
    if (isNaN(basePriceNum) || basePriceNum < 0) {
      setFormError('Base price must be a valid positive amount.')
      return
    }
    const basePriceMinor = BigInt(Math.round(basePriceNum * 100))

    let compareAtMinor: bigint | undefined
    if (compareAtPriceStr.trim()) {
      const compareNum = parseFloat(compareAtPriceStr)
      if (isNaN(compareNum) || compareNum < 0) {
        setFormError('Compare-at price must be a valid positive amount.')
        return
      }
      compareAtMinor = BigInt(Math.round(compareNum * 100))
      if (compareAtMinor <= basePriceMinor) {
        setFormError('Original (compare-at) price must be strictly greater than base price.')
        return
      }
    }

    setSubmitting(true)

    try {
      const res = await createProductAction(workspaceId, {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
        currency: currencyVal,
        basePrice: basePriceMinor,
        compareAtPrice: compareAtMinor,
        visibility,
        status: 'draft',
      })

      if (!res.success) {
        setFormError(res.error.detail)
        toast.show({
          title: res.error.title,
          description: res.error.detail,
          variant: 'critical',
        })
        setSubmitting(false)
        return
      }

      toast.show({
        title: 'Product created',
        description: `Successfully created '${title}'.`,
        variant: 'success',
      })

      router.push(`/workspaces/${workspaceId}/products/${res.data.productId}`)
    } catch {
      setFormError('An unexpected error occurred while creating product.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Navigation */}
        <nav className="flex items-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          <Link
            href={`/workspaces/${workspaceId}/products`}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Products
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-900 dark:text-neutral-100">New</span>
        </nav>

        {/* Form Container */}
        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Create New Product
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Set up basic details, pricing, and initial configuration.
            </p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
            {formError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400"
              >
                {formError}
              </div>
            )}

            {/* Title & Slug */}
            <div className="space-y-4">
              <Input
                label="Product Title"
                value={title}
                onChange={(e) => {
                  handleTitleChange(e.target.value)
                }}
                placeholder="e.g. Masterclass in Web Architecture"
                required
              />

              <div className="space-y-1">
                <Input
                  label="URL Slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(slugify(e.target.value))
                  }}
                  placeholder="masterclass-in-web-architecture"
                  required
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Storefront URL: /products/{slug || 'your-slug'}
                </p>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label
                  htmlFor="product-description"
                  className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                >
                  Description (Optional)
                </label>
                <textarea
                  id="product-description"
                  rows={4}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                  }}
                  placeholder="Describe your digital product, target audience, and deliverables..."
                  className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                />
              </div>
            </div>

            {/* Pricing Section */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-5 dark:border-neutral-800 dark:bg-neutral-950/50 space-y-4">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Pricing Details
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Select
                  label="Currency"
                  options={CURRENCY_OPTIONS}
                  value={currencyVal}
                  onValueChange={(val) => {
                    setCurrencyVal(currency(val))
                  }}
                />

                <Input
                  label="Base Price"
                  type="text"
                  inputMode="decimal"
                  value={basePriceStr}
                  onChange={(e) => {
                    setBasePriceStr(e.target.value)
                  }}
                  placeholder="499.00"
                  required
                />

                <Input
                  label="Compare-At Price (Optional)"
                  type="text"
                  inputMode="decimal"
                  value={compareAtPriceStr}
                  onChange={(e) => {
                    setCompareAtPriceStr(e.target.value)
                  }}
                  placeholder="999.00"
                />
              </div>
            </div>

            {/* Visibility */}
            <Select
              label="Storefront Visibility"
              options={VISIBILITY_OPTIONS}
              value={visibility}
              onValueChange={(val) => {
                setVisibility(val as 'public' | 'unlisted' | 'private')
              }}
            />

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-5 dark:border-neutral-800">
              <Link href={`/workspaces/${workspaceId}/products`}>
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Link>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Product'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
