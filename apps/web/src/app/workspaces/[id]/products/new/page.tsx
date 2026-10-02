'use client'

/**
 * Create & Auto-List Product Screen.
 *
 * Responsibilities:
 * - Smart File Upload: Drops any file to instantly auto-generate title, description, category, and price.
 * - 1-Click Direct Verification and Storefront Listing.
 * - Standard manual product creation option with validation.
 */
import { use, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { currency, type CurrencyCode } from '@creatorhub/contracts'
import { Button, Input, Select, useToast } from '@creatorhub/ui'
import { createProductAction } from '@/lib/catalogue-actions'
import { SmartProductUpload } from '@/components/products/SmartProductUpload'

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR (₹) — Indian Rupee' },
  { value: 'USD', label: 'USD ($) — US Dollar' },
  { value: 'EUR', label: 'EUR (€) — Euro' },
  { value: 'GBP', label: 'GBP (£) — British Pound' },
]

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public — Visible in storefront and link-in-bio' },
  { value: 'unlisted', label: 'Unlisted — Accessible via direct link only' },
  { value: 'private', label: 'Private — Workspace admins only' },
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

  const [activeMode, setActiveMode] = useState<'upload' | 'manual'>('upload')

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [description, setDescription] = useState('')
  const [currencyVal, setCurrencyVal] = useState<CurrencyCode>(currency('INR'))
  const [basePriceStr, setBasePriceStr] = useState('999.00')
  const [compareAtPriceStr, setCompareAtPriceStr] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const numBase = parseFloat(basePriceStr || '0')
  const numCompare = parseFloat(compareAtPriceStr || '0')
  const hasDiscount = numCompare > numBase && numBase > 0
  const savingsAmount = hasDiscount ? numCompare - numBase : 0
  const savingsPct = hasDiscount ? Math.round((savingsAmount / numCompare) * 100) : 0

  const applyQuickDiscount = (pct: number) => {
    if (numBase > 0) {
      const calculatedOriginal = Math.round(numBase / (1 - pct / 100))
      setCompareAtPriceStr(calculatedOriginal.toString())
    }
  }

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
        setFormError('Original price must be strictly greater than selling price.')
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
        status: 'published',
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
        title: 'Product listed live! 🚀',
        description: `Successfully listed '${title}'.`,
        variant: 'success',
      })

      router.push(`/workspaces/${workspaceId}/products`)
    } catch {
      setFormError('An unexpected error occurred while creating product.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-surface-base text-content-primary px-4 py-8 sm:px-6 lg:px-8 font-sans">
      <div className="mx-auto max-w-3xl space-y-8">
        {/* Navigation Breadcrumb */}
        <nav className="flex items-center text-xs font-bold text-content-tertiary">
          <Link
            href={`/workspaces/${workspaceId}/products`}
            className="hover:text-content-primary transition-colors"
          >
            Products
          </Link>
          <span className="mx-2">/</span>
          <span className="text-content-primary">New Product</span>
        </nav>

        {/* Creation Mode Toggle */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-content-primary">
              Add New Product
            </h1>
            <p className="mt-1 text-xs text-content-secondary">
              Upload any digital file to auto-generate details, or fill in manual information.
            </p>
          </div>

          <div className="flex rounded-2xl bg-surface-sunken p-1 border border-border-subtle text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveMode('upload')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeMode === 'upload'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              ⚡ Smart Auto-Generate from File
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('manual')}
              className={`rounded-xl px-3.5 py-1.5 transition-all ${
                activeMode === 'manual'
                  ? 'bg-accent text-accent-content shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              ✍️ Manual Form
            </button>
          </div>
        </div>

        {/* Primary Option: Smart Auto-Generation from File */}
        {activeMode === 'upload' && (
          <div className="space-y-6">
            <SmartProductUpload
              workspaceId={workspaceId}
              onPopulateForm={(details) => {
                setTitle(details.title)
                setSlug(details.slug)
                setDescription(details.description)
                setBasePriceStr(details.price)
              }}
            />
          </div>
        )}

        {/* Secondary Option: Manual Form */}
        {activeMode === 'manual' && (
          <div className="rounded-3xl border border-border-subtle bg-surface-raised p-8 shadow-sm space-y-6">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-bold text-red-600 dark:text-red-400"
                >
                  {formError}
                </div>
              )}

              {/* Title & Slug */}
              <div className="space-y-4">
                <Input
                  label="Product Title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
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
                  <p className="text-[11px] text-content-tertiary">
                    Storefront URL: /products/{slug || 'your-slug'}
                  </p>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label
                    htmlFor="product-description"
                    className="block text-xs font-bold text-content-primary"
                  >
                    Description & Inclusions
                  </label>
                  <textarea
                    id="product-description"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your digital product, what is included, and key highlights..."
                    className="block w-full rounded-xl border border-border-control bg-surface-sunken p-3 text-xs text-content-primary placeholder:text-content-tertiary focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Pricing Section */}
              <div className="rounded-2xl border border-border-subtle bg-surface-sunken p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-content-primary">
                    Pricing & Discounts
                  </h2>
                  {hasDiscount && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      🔥 {savingsPct}% OFF · Saves {currencyVal}{' '}
                      {savingsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Select
                    label="Currency"
                    options={CURRENCY_OPTIONS}
                    value={currencyVal}
                    onValueChange={(val) => setCurrencyVal(currency(val))}
                  />

                  <Input
                    label="Selling Price"
                    type="text"
                    inputMode="decimal"
                    hint="What your customer pays at checkout"
                    value={basePriceStr}
                    onChange={(e) => setBasePriceStr(e.target.value)}
                    placeholder="999.00"
                    required
                  />

                  <Input
                    label="Original Price (Before Discount)"
                    type="text"
                    inputMode="decimal"
                    hint="Crossed-out MRP shown to highlight savings"
                    value={compareAtPriceStr}
                    onChange={(e) => setCompareAtPriceStr(e.target.value)}
                    placeholder="1499.00"
                  />
                </div>

                {numBase > 0 && (
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] font-semibold text-content-tertiary">
                      ⚡ Quick Discount Presets:
                    </span>
                    {[15, 25, 35, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => applyQuickDiscount(pct)}
                        className="rounded-lg border border-border-control bg-surface-raised px-2.5 py-1 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-overlay transition-colors"
                      >
                        {pct}% Off
                      </button>
                    ))}
                    {compareAtPriceStr && (
                      <button
                        type="button"
                        onClick={() => setCompareAtPriceStr('')}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-content-tertiary hover:text-critical transition-colors"
                      >
                        Clear Discount
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Visibility */}
              <Select
                label="Storefront Visibility"
                options={VISIBILITY_OPTIONS}
                value={visibility}
                onValueChange={(val) => setVisibility(val as 'public' | 'unlisted' | 'private')}
              />

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-5">
                <Link href={`/workspaces/${workspaceId}/products`}>
                  <Button variant="secondary" type="button">
                    Cancel
                  </Button>
                </Link>
                <Button
                  variant="primary"
                  type="submit"
                  loading={submitting}
                  loadingLabel="Listing product..."
                  className="rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-bold"
                >
                  ✓ Verify & List Product
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
