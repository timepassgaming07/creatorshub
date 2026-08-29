'use client'

/**
 * Product Detail, Edit, and Publish Screen (Item 3.7 & 3.8).
 *
 * Responsibilities:
 * - Render product configuration across loading, error, and populated states.
 * - Update product metadata, pricing, and visibility.
 * - Variant management: list variants and add new variants with price overrides.
 * - Deliverable & Media asset management: upload and attach secure files.
 * - Publish flow with confirmation dialog and status transitions.
 */
import { use, useCallback, useEffect, useState, type SyntheticEvent } from 'react'
import Link from 'next/link'
import { Button, Dialog, Input, Select, Skeleton, SkeletonText, useToast } from '@creatorhub/ui'

import { AssetUploader } from '@/components/AssetUploader'
import {
  attachProductAssetAction,
  detachProductAssetAction,
  listProductAssetsAction,
  type ProductAssetDisplay,
} from '@/lib/asset-actions'
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

function formatBytes(bytesStr: string): string {
  try {
    const bytes = Number(bytesStr)
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`
  } catch {
    return `${bytesStr} B`
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

  // Assets / Deliverables State
  const [productAssets, setProductAssets] = useState<readonly ProductAssetDisplay[]>([])
  const [uploadAssetDialogOpen, setUploadAssetDialogOpen] = useState(false)

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

      // Also load product assets
      const assetsRes = await listProductAssetsAction(workspaceId, productId)
      if (assetsRes.success) {
        setProductAssets(assetsRes.data)
      }

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

    void listProductAssetsAction(workspaceId, productId).then((assetsRes) => {
      if (!isMounted) return
      if (assetsRes.success) {
        setProductAssets(assetsRes.data)
      }
    })

    return () => {
      isMounted = false
    }
  }, [workspaceId, productId])

  const handleUpdateProduct = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (!data) return

    setSaving(true)
    const basePriceMinor = BigInt(Math.round(parseFloat(basePriceStr || '0') * 100))
    const compareAtPriceMinor = compareAtPriceStr.trim()
      ? BigInt(Math.round(parseFloat(compareAtPriceStr) * 100))
      : undefined

    const res = await updateProductAction(workspaceId, productId, {
      title,
      slug,
      description: description || undefined,
      basePrice: basePriceMinor,
      compareAtPrice: compareAtPriceMinor,
      visibility,
    })

    setSaving(false)
    if (!res.success) {
      toast.show({
        title: res.error.title,
        description: res.error.detail,
        variant: 'critical',
      })
      return
    }

    toast.show({
      title: 'Product updated',
      description: 'Your product changes have been saved successfully.',
      variant: 'success',
    })
    void loadProduct()
  }

  const handleCreateVariant = async () => {
    if (!variantTitle.trim()) {
      toast.show({
        title: 'Validation Error',
        description: 'Variant title is required.',
        variant: 'critical',
      })
      return
    }

    setCreatingVariant(true)
    const priceOverrideMinor = variantPriceOverrideStr.trim()
      ? BigInt(Math.round(parseFloat(variantPriceOverrideStr) * 100))
      : undefined

    const res = await createVariantAction(workspaceId, productId, {
      title: variantTitle,
      sku: variantSku.trim() || undefined,
      priceOverride: priceOverrideMinor,
      inventoryPolicy: variantInventoryPolicy,
    })

    setCreatingVariant(false)
    if (!res.success) {
      toast.show({
        title: res.error.title,
        description: res.error.detail,
        variant: 'critical',
      })
      return
    }

    toast.show({
      title: 'Variant added',
      description: `Variant '${variantTitle}' created successfully.`,
      variant: 'success',
    })
    setVariantDialogOpen(false)
    setVariantTitle('')
    setVariantSku('')
    setVariantPriceOverrideStr('')
    void loadProduct()
  }

  const handlePublish = async () => {
    setPublishing(true)
    const res = await publishProductAction(workspaceId, productId)
    setPublishing(false)

    if (!res.success) {
      toast.show({
        title: res.error.title,
        description: res.error.detail,
        variant: 'critical',
      })
      return
    }

    toast.show({
      title: 'Product published',
      description: 'This product is now live and deliverable.',
      variant: 'success',
    })
    setPublishDialogOpen(false)
    void loadProduct()
  }

  const handleDetachAsset = async (assetIdToDetach: string) => {
    const res = await detachProductAssetAction(workspaceId, productId, assetIdToDetach)
    if (!res.success) {
      toast.show({
        title: res.error.title,
        description: res.error.detail,
        variant: 'critical',
      })
      return
    }

    toast.show({
      title: 'Asset detached',
      description: 'Asset removed from this product.',
      variant: 'info',
    })
    void loadProduct()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div>
              <Skeleton className="h-8 w-64" shape="text" />
              <SkeletonText lines={1} className="mt-2 w-48" />
            </div>
            <Skeleton className="h-10 w-28" shape="block" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <SkeletonText lines={8} />
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <SkeletonText lines={5} />
            </div>
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
              {error?.title ?? 'Product not found'}
            </h1>
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">
              {error?.detail ?? 'The requested product could not be loaded.'}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href={`/workspaces/${workspaceId}/products`}>
                <Button variant="secondary">Back to Products</Button>
              </Link>
              <Button onClick={() => void loadProduct()}>Try Again</Button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  const { product, variants, canUpdate, canPublish: canPublishPerm } = data
  const canPublish = canPublishPerm && product.status !== 'published'

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 dark:bg-neutral-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Navigation & Header */}
        <div>
          <nav className="mb-4 flex items-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Workspace
            </Link>
            <span className="mx-2">/</span>
            <Link
              href={`/workspaces/${workspaceId}/products`}
              className="hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Products
            </Link>
            <span className="mx-2">/</span>
            <span className="text-neutral-900 dark:text-neutral-100">{product.title}</span>
          </nav>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  {product.title}
                </h1>
                <StatusBadge status={product.status} />
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Created on {new Date(product.createdAt).toLocaleDateString()} · Currency:{' '}
                {product.currency}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {canPublish && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setPublishDialogOpen(true)
                  }}
                >
                  Publish Product
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content Columns */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Edit Form (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 pb-3 dark:border-neutral-800">
                Product Details
              </h2>

              <form
                onSubmit={(e) => {
                  void handleUpdateProduct(e)
                }}
                className="mt-6 space-y-4"
              >
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
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }}
                  disabled={!canUpdate}
                  required
                />

                <div>
                  <label
                    htmlFor="product-description"
                    className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="product-description"
                    rows={4}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value)
                    }}
                    disabled={!canUpdate}
                    className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-800"
                    placeholder="Describe what customers receive..."
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

          {/* Sidebar (1 col): Variants & Deliverables */}
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

            {/* Deliverables & Assets Card (Item 3.8) */}
            <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    Deliverables ({productAssets.length})
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Files delivered upon purchase
                  </p>
                </div>
                {canUpdate && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => {
                      setUploadAssetDialogOpen(true)
                    }}
                  >
                    Attach File
                  </Button>
                )}
              </div>

              {productAssets.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  No deliverables attached yet. Upload a verified file or ZIP bundle.
                </p>
              ) : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 text-sm">
                  {productAssets.map((asset) => (
                    <li key={asset.id} className="py-2.5 flex items-center justify-between">
                      <div className="truncate max-w-[180px]">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {asset.filename}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {formatBytes(asset.byteSize)} ·{' '}
                          <span
                            className={
                              asset.scanStatus === 'clean'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }
                          >
                            {asset.scanStatus}
                          </span>
                        </div>
                      </div>
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => void handleDetachAsset(asset.assetId)}
                        >
                          Detach
                        </Button>
                      )}
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
              placeholder="Leave empty to use base product price"
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
                disabled={creatingVariant}
                onClick={() => {
                  void handleCreateVariant()
                }}
              >
                {creatingVariant ? 'Adding...' : 'Add Variant'}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* Upload & Attach Deliverable Dialog (Item 3.8) */}
        <Dialog
          open={uploadAssetDialogOpen}
          onOpenChange={setUploadAssetDialogOpen}
          title="Upload & Attach Deliverable"
          description="Upload a clean digital product file. It will be scanned and attached automatically."
        >
          <div className="py-4">
            <AssetUploader
              workspaceId={workspaceId}
              onUploadComplete={(asset) => {
                void (async () => {
                  const attRes = await attachProductAssetAction(
                    workspaceId,
                    productId,
                    asset.assetId,
                    'deliverable',
                  )
                  if (attRes.success) {
                    toast.show({
                      title: 'Deliverable attached',
                      description: `'${asset.filename}' attached to product.`,
                      variant: 'success',
                    })
                    setUploadAssetDialogOpen(false)
                    void loadProduct()
                  } else {
                    toast.show({
                      title: attRes.error.title,
                      description: attRes.error.detail,
                      variant: 'critical',
                    })
                  }
                })()
              }}
            />
          </div>
        </Dialog>

        {/* Publish Confirmation Dialog */}
        <Dialog
          open={publishDialogOpen}
          onOpenChange={setPublishDialogOpen}
          title="Publish Product"
          description="Are you sure you want to publish this product? It will become visible according to your visibility settings and ready for customer checkout."
        >
          <div className="space-y-4 py-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Published products will be available on your public storefront and eligible for
              discounts and affiliate links.
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
              <Button
                variant="primary"
                disabled={publishing}
                onClick={() => {
                  void handlePublish()
                }}
              >
                {publishing ? 'Publishing...' : 'Confirm & Publish'}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </main>
  )
}

function StatusBadge({ status }: { readonly status: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
        Published
      </span>
    )
  }
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Archived
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
      Draft
    </span>
  )
}
