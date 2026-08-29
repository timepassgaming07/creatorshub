'use client'

/**
 * Product Detail, Edit, and Publish Screen (Item 3.7).
 *
 * Responsibilities:
 * - Render product configuration across loading, error, and populated states.
 * - Update product metadata, pricing, and visibility.
 * - Variant management: list variants and add new variants with price overrides.
 * - Publish flow with confirmation dialog and status transitions.
 */
import { use, useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { Button, Dialog, Input, Select, Skeleton, SkeletonText, useToast } from '@creatorhub/ui'

import {
  createVariantAction,
  getProductDetailDataAction,
  publishProductAction,
  updateProductAction,
  type ProductDetailData,
} from '@/lib/catalogue-actions'

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public — Visible in storefront' },
  { value: 'unlisted', label: 'Unlisted — Direct link only' },
  { value: 'private', label: 'Private — Workspace admins only' },
]

const INVENTORY_POLICY_OPTIONS = [
  { value: 'unlimited', label: 'Unlimited digital copies' },
  { value: 'tracked', label: 'Tracked inventory' },
]

function formatPriceDisplay(amountStr: string, currencyCode: string): string {
  try {
    const minor = BigInt(amountStr)
    const major = Number(minor) / 100
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
    }).format(major)
  } catch {
    return `${amountStr} ${currencyCode}`
  }
}

export default function ProductDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string; productId: string }>
}) {
  const { id: workspaceId, productId } = use(params)
  const toast = useToast()

  const [data, setData] = useState<ProductDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ title: string; detail: string; status: number } | null>(null)

  // Edit Product Form State
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [basePriceStr, setBasePriceStr] = useState('0.00')
  const [compareAtPriceStr, setCompareAtPriceStr] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public')
  const [saving, setSaving] = useState(false)

  // Add Variant Dialog State
  const [variantDialogOpen, setVariantDialogOpen] = useState(false)
  const [variantTitle, setVariantTitle] = useState('')
  const [variantSku, setVariantSku] = useState('')
  const [variantPriceOverrideStr, setVariantPriceOverrideStr] = useState('')
  const [variantInventoryPolicy, setVariantInventoryPolicy] = useState<'unlimited' | 'tracked'>(
    'unlimited',
  )
  const [creatingVariant, setCreatingVariant] = useState(false)

  // Publish Dialog State
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const loadProduct = useCallback(async () => {
    try {
      const res = await getProductDetailDataAction(workspaceId, productId)
      if (!res.success) {
        setError({
          title: res.error.title,
          detail: res.error.detail,
          status: res.error.status,
        })
        setLoading(false)
        return
      }

      setData(res.data)
      setTitle(res.data.product.title)
      setSlug(res.data.product.slug)
      setDescription(res.data.product.description ?? '')
      const bMinor = BigInt(res.data.product.basePrice)
      setBasePriceStr((Number(bMinor) / 100).toFixed(2))
      if (res.data.product.compareAtPrice !== null) {
        const cMinor = BigInt(res.data.product.compareAtPrice)
        setCompareAtPriceStr((Number(cMinor) / 100).toFixed(2))
      } else {
        setCompareAtPriceStr('')
      }
      setVisibility(res.data.product.visibility as 'public' | 'unlisted' | 'private')
      setLoading(false)
    } catch {
      setError({
        title: 'Not Found',
        detail: 'We could not find this product.',
        status: 404,
      })
      setLoading(false)
    }
  }, [workspaceId, productId])

  useEffect(() => {
    let isMounted = true
    void getProductDetailDataAction(workspaceId, productId)
      .then((res) => {
        if (!isMounted) return
        if (!res.success) {
          setError({
            title: res.error.title,
            detail: res.error.detail,
            status: res.error.status,
          })
        } else {
          setData(res.data)
          setTitle(res.data.product.title)
          setSlug(res.data.product.slug)
          setDescription(res.data.product.description ?? '')
          const bMinor = BigInt(res.data.product.basePrice)
          setBasePriceStr((Number(bMinor) / 100).toFixed(2))
          if (res.data.product.compareAtPrice !== null) {
            const cMinor = BigInt(res.data.product.compareAtPrice)
            setCompareAtPriceStr((Number(cMinor) / 100).toFixed(2))
          } else {
            setCompareAtPriceStr('')
          }
          setVisibility(res.data.product.visibility as 'public' | 'unlisted' | 'private')
        }
        setLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setError({
          title: 'Not Found',
          detail: 'We could not find this product.',
          status: 404,
        })
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [workspaceId, productId])

  const handleSaveProduct = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)

    const basePriceNum = parseFloat(basePriceStr)
    const basePrice = BigInt(Math.round((isNaN(basePriceNum) ? 0 : basePriceNum) * 100))

    let compareAtPrice: bigint | null = null
    if (compareAtPriceStr.trim()) {
      const compNum = parseFloat(compareAtPriceStr)
      if (!isNaN(compNum)) {
        compareAtPrice = BigInt(Math.round(compNum * 100))
      }
    }

    try {
      const res = await updateProductAction(workspaceId, productId, {
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        basePrice,
        compareAtPrice,
        visibility,
      })

      if (!res.success) {
        toast.show({
          title: res.error.title,
          description: res.error.detail,
          variant: 'critical',
        })
        setSaving(false)
        return
      }

      toast.show({
        title: 'Saved',
        description: 'Product updated successfully.',
        variant: 'success',
      })
      setSaving(false)
      void loadProduct()
    } catch {
      toast.show({
        title: 'Update failed',
        description: 'An unexpected error occurred.',
        variant: 'critical',
      })
      setSaving(false)
    }
  }

  const handleCreateVariant = async () => {
    if (!variantTitle.trim()) return
    setCreatingVariant(true)

    let priceOverride: bigint | undefined
    if (variantPriceOverrideStr.trim()) {
      const pNum = parseFloat(variantPriceOverrideStr)
      if (!isNaN(pNum)) {
        priceOverride = BigInt(Math.round(pNum * 100))
      }
    }

    try {
      const res = await createVariantAction(workspaceId, productId, {
        title: variantTitle.trim(),
        sku: variantSku.trim() || undefined,
        priceOverride,
        inventoryPolicy: variantInventoryPolicy,
      })

      if (!res.success) {
        toast.show({
          title: res.error.title,
          description: res.error.detail,
          variant: 'critical',
        })
        setCreatingVariant(false)
        return
      }

      toast.show({
        title: 'Variant Added',
        description: `Variant '${variantTitle}' created successfully.`,
        variant: 'success',
      })

      setVariantTitle('')
      setVariantSku('')
      setVariantPriceOverrideStr('')
      setVariantDialogOpen(false)
      setCreatingVariant(false)
      void loadProduct()
    } catch {
      toast.show({
        title: 'Variant creation failed',
        description: 'An unexpected error occurred.',
        variant: 'critical',
      })
      setCreatingVariant(false)
    }
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await publishProductAction(workspaceId, productId)
      if (!res.success) {
        toast.show({
          title: res.error.title,
          description: res.error.detail,
          variant: 'critical',
        })
        setPublishing(false)
        return
      }

      toast.show({
        title: 'Published',
        description: 'Product is now live on your storefront.',
        variant: 'success',
      })
      setPublishDialogOpen(false)
      setPublishing(false)
      void loadProduct()
    } catch {
      toast.show({
        title: 'Publish failed',
        description: 'An unexpected error occurred.',
        variant: 'critical',
      })
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-8 w-44" shape="text" />
          <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <SkeletonText lines={8} />
          </div>
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
            <h1 className="text-xl font-semibold text-red-900 dark:text-red-300">
              {error?.title ?? 'Not Found'}
            </h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">
              {error?.detail ?? 'Product not found.'}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/workspaces/${workspaceId}/products`}>
                <Button variant="secondary">Back to Products</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const { product, variants, canUpdate, canPublish } = data
  const isPublished = product.status === 'published'

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Navigation */}
        <nav className="flex items-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          <Link
            href={`/workspaces/${workspaceId}/products`}
            className="hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Products
          </Link>
          <span className="mx-2">/</span>
          <span className="text-neutral-900 dark:text-neutral-100">{product.title}</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                {product.title}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isPublished
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                }`}
              >
                {product.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Slug: /{product.slug}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canPublish && !isPublished && (
              <Button
                variant="primary"
                onClick={() => {
                  setPublishDialogOpen(true)
                }}
              >
                Publish Product
              </Button>
            )}
            {isPublished && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                ✓ Live on Storefront
              </span>
            )}
          </div>
        </div>

        {/* Edit Form & Details */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Form (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                Product Details
              </h2>

              <form onSubmit={(e) => void handleSaveProduct(e)} className="mt-4 space-y-4">
                <Input
                  label="Title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                  }}
                  disabled={!canUpdate}
                  required
                />

                <Input
                  label="URL Slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value)
                  }}
                  disabled={!canUpdate}
                  required
                />

                <div className="space-y-1">
                  <label
                    htmlFor="product-edit-desc"
                    className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                  >
                    Description
                  </label>
                  <textarea
                    id="product-edit-desc"
                    rows={4}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                    }}
                    disabled={!canUpdate}
                    className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
                  <Input
                    label={`Base Price (${product.currency})`}
                    type="text"
                    inputMode="decimal"
                    value={basePriceStr}
                    onChange={(e) => {
                      setBasePriceStr(e.target.value)
                    }}
                    disabled={!canUpdate}
                    required
                  />

                  <Input
                    label={`Compare-At Price (${product.currency})`}
                    type="text"
                    inputMode="decimal"
                    value={compareAtPriceStr}
                    onChange={(e) => {
                      setCompareAtPriceStr(e.target.value)
                    }}
                    disabled={!canUpdate}
                  />
                </div>

                <Select
                  label="Visibility"
                  options={VISIBILITY_OPTIONS}
                  value={visibility}
                  onValueChange={(val) => {
                    setVisibility(val as 'public' | 'unlisted' | 'private')
                  }}
                  disabled={!canUpdate}
                />

                {canUpdate && (
                  <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-800">
                    <Button variant="primary" type="submit" disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Sidebar (1 col): Variants */}
          <div className="space-y-6">
            {/* Variants Card */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
                <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Variants ({variants.length})
                </h2>
                {canUpdate && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      setVariantDialogOpen(true)
                    }}
                  >
                    Add Variant
                  </Button>
                )}
              </div>

              {variants.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  No additional variants defined. Customers purchase the standard edition.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
                  {variants.map((v) => (
                    <li key={v.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {v.title}
                        </div>
                        {v.sku && <div className="text-xs text-neutral-400">SKU: {v.sku}</div>}
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {v.priceOverride
                            ? formatPriceDisplay(v.priceOverride, product.currency)
                            : formatPriceDisplay(product.basePrice, product.currency)}
                        </div>
                        <div className="text-xs text-neutral-500 capitalize">
                          {v.inventoryPolicy}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Add Variant Dialog */}
        <Dialog
          open={variantDialogOpen}
          onOpenChange={setVariantDialogOpen}
          title="Add Product Variant"
          description="Create a tier, bundle, or license option with optional price override."
        >
          <div className="space-y-4 py-3">
            <Input
              label="Variant Title"
              value={variantTitle}
              onChange={(e) => {
                setVariantTitle(e.target.value)
              }}
              placeholder="e.g. Deluxe Edition / Team License"
              required
            />

            <Input
              label="SKU (Optional)"
              value={variantSku}
              onChange={(e) => {
                setVariantSku(e.target.value)
              }}
              placeholder="e.g. DLX-001"
            />

            <Input
              label={`Price Override in ${product.currency} (Optional)`}
              type="text"
              inputMode="decimal"
              value={variantPriceOverrideStr}
              onChange={(e) => {
                setVariantPriceOverrideStr(e.target.value)
              }}
              placeholder="Leave blank to inherit base price"
            />

            <Select
              label="Inventory Policy"
              options={INVENTORY_POLICY_OPTIONS}
              value={variantInventoryPolicy}
              onValueChange={(val) => {
                setVariantInventoryPolicy(val as 'unlimited' | 'tracked')
              }}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="secondary"
                onClick={() => {
                  setVariantDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleCreateVariant()}
                disabled={creatingVariant || !variantTitle.trim()}
              >
                {creatingVariant ? 'Adding...' : 'Add Variant'}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Publish Confirmation Dialog */}
        <Dialog
          open={publishDialogOpen}
          onOpenChange={setPublishDialogOpen}
          title="Publish Product"
          description={`Are you sure you want to publish '${product.title}' to your storefront?`}
        >
          <div className="space-y-4 py-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Publishing will make this product active and available for customer checkout at{' '}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {formatPriceDisplay(product.basePrice, product.currency)}
              </span>
              .
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button
                variant="secondary"
                onClick={() => {
                  setPublishDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handlePublish()} disabled={publishing}>
                {publishing ? 'Publishing...' : 'Confirm & Publish'}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </main>
  )
}
