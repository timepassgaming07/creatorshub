'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ExternalLink,
  FileText,
  Gift,
  ImageIcon,
  Layers,
  Plus,
  Rocket,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import { Badge, Card, CardHeader, CopyButton, Notice, PageHeader, Switch, Textarea } from '@/components/ds'
import { ProductCopyAssist } from '@/components/ai/Copilot'
import { useWorkspace } from '@/components/layout/DashboardShell'
import { detachProductAssetAction } from '@/lib/asset-actions'
import { createVariantAction, publishProductAction, updateProductAction } from '@/lib/catalogue-actions'
import type { ProductEditorData, ProductFile } from '@/lib/dashboard-data'
import { formatAmount, formatBytes, minorToInput, parsePriceToMinor } from '@/lib/format'

import { FileDrop } from './FileDrop'

const VISIBILITY = [
  { value: 'public', label: 'Public: listed on your store' },
  { value: 'unlisted', label: 'Unlisted: only people with the link' },
  { value: 'private', label: 'Private: not for sale' },
]

function scanBadge(file: ProductFile) {
  if (file.scanStatus === 'clean') return <Badge tone="positive">Ready</Badge>
  if (file.scanStatus === 'infected') return <Badge tone="critical">Blocked</Badge>
  return <Badge tone="caution">Checking</Badge>
}

export function ProductEditor({ data, justCreated }: { readonly data: ProductEditorData; readonly justCreated: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const { workspace, basePath } = useWorkspace()
  const { product } = data
  const symbol = product.currency === 'INR' ? '₹' : '$'

  const [title, setTitle] = useState(product.title)
  const [description, setDescription] = useState(product.description ?? '')
  const [slug, setSlug] = useState(product.slug)
  const [isFree, setIsFree] = useState(BigInt(product.price) === 0n)
  const [price, setPrice] = useState(BigInt(product.price) === 0n ? '' : minorToInput(product.price))
  const [compareAt, setCompareAt] = useState(product.compareAtPrice ? minorToInput(product.compareAtPrice) : '')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [variantTitle, setVariantTitle] = useState('')
  const [variantPrice, setVariantPrice] = useState('')
  const [addingVariant, setAddingVariant] = useState(false)

  const deliverables = data.files.filter((f) => f.role === 'deliverable')
  const cover = data.files.find((f) => f.role === 'cover_image')
  const gallery = data.files.filter((f) => f.role === 'gallery')
  const hasReadyFile = deliverables.some((f) => f.scanStatus === 'clean')

  const dirty =
    title !== product.title ||
    description !== (product.description ?? '') ||
    slug !== product.slug ||
    isFree !== (BigInt(product.price) === 0n) ||
    (!isFree && price !== minorToInput(product.price)) ||
    compareAt !== (product.compareAtPrice ? minorToInput(product.compareAtPrice) : '')

  const productUrl = data.storeUrl
    ? product.status === 'published'
      ? `${data.storeUrl}/p/${product.slug}`
      : `${data.storeUrl}/p/${product.slug}?preview=${workspace.id}`
    : null

  const refresh = () => {
    router.refresh()
  }

  async function save() {
    const next: Record<string, string> = {}
    if (title.trim().length < 2) next['title'] = 'Give the product a name.'
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) next['slug'] = 'Use lowercase letters, numbers, and single hyphens.'
    const minor = isFree ? 0n : parsePriceToMinor(price)
    if (minor === null || (!isFree && minor < 100n)) next['price'] = `Enter at least ${symbol}1.`
    const compareMinor = compareAt.trim() ? parsePriceToMinor(compareAt) : null
    if (compareAt.trim() && (compareMinor === null || (minor !== null && compareMinor <= minor))) {
      next['compareAt'] = 'The original price must be higher than the price.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || minor === null) return

    setSaving(true)
    const result = await updateProductAction(workspace.id, product.id, {
      title: title.trim(),
      slug,
      description: description.trim() || null,
      basePrice: minor,
      compareAtPrice: isFree ? null : compareMinor,
    })
    setSaving(false)
    if (!result.success) {
      toast.show({ title: 'Not saved', description: result.error.detail, variant: 'critical' })
      return
    }
    toast.show({ title: 'Saved', variant: 'success' })
    refresh()
  }

  async function setStatus(status: 'published' | 'draft' | 'archived') {
    setPublishing(true)
    const result =
      status === 'published'
        ? await publishProductAction(workspace.id, product.id)
        : await updateProductAction(workspace.id, product.id, { status })
    setPublishing(false)
    if (!result.success) {
      toast.show({ title: result.error.title, description: result.error.detail, variant: 'critical' })
      return
    }
    toast.show({
      title: status === 'published' ? 'Product is live' : status === 'archived' ? 'Archived' : 'Moved to drafts',
      variant: 'success',
    })
    refresh()
  }

  async function setVisibility(visibility: string) {
    const result = await updateProductAction(workspace.id, product.id, {
      visibility: visibility as 'public' | 'unlisted' | 'private',
    })
    if (!result.success) {
      toast.show({ title: 'Not saved', description: result.error.detail, variant: 'critical' })
      return
    }
    refresh()
  }

  async function removeFile(file: ProductFile) {
    const result = await detachProductAssetAction(workspace.id, product.id, file.assetId)
    if (!result.success) {
      toast.show({ title: 'Could not remove', description: result.error.detail, variant: 'critical' })
      return
    }
    refresh()
  }

  async function addVariant() {
    const minor = variantPrice.trim() ? parsePriceToMinor(variantPrice) : null
    if (!variantTitle.trim() || (variantPrice.trim() && minor === null)) {
      toast.show({ title: 'Check the option', description: 'Give it a name and a valid price.', variant: 'critical' })
      return
    }
    setAddingVariant(true)
    const result = await createVariantAction(workspace.id, product.id, {
      title: variantTitle.trim(),
      priceOverride: minor,
      position: data.variants.length,
    } as never)
    setAddingVariant(false)
    if (!result.success) {
      toast.show({ title: 'Could not add option', description: result.error.detail, variant: 'critical' })
      return
    }
    setVariantTitle('')
    setVariantPrice('')
    refresh()
  }

  const statusBadge =
    product.status === 'published' ? (
      <Badge tone="positive" dot>Published</Badge>
    ) : product.status === 'archived' ? (
      <Badge tone="caution" dot>Archived</Badge>
    ) : (
      <Badge dot>Draft</Badge>
    )

  return (
    <div className="pb-24">
      <PageHeader
        crumbs={[{ label: 'Products', href: `${basePath}/products` }, { label: product.title }]}
        title={product.title}
        eyebrow={statusBadge}
        actions={
          productUrl ? (
            <Button variant="secondary" asChild>
              <a href={productUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                {product.status === 'published' ? 'View' : 'Preview'}
              </a>
            </Button>
          ) : undefined
        }
      />

      {justCreated && deliverables.length === 0 && (
        <Notice tone="accent" title="Next: upload the file buyers receive" className="mb-6">
          Then add a cover image and publish. Buyers get a download link by email the moment they pay.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Details"
              action={
                <ProductCopyAssist
                  title={title}
                  description={description}
                  onApply={(next) => {
                    if (next.title) setTitle(next.title)
                    setDescription(next.description)
                  }}
                />
              }
            />
            <div className="space-y-5">
              <Input
                label="Name"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                }}
                {...(errors['title'] ? { error: errors['title'] } : {})}
              />
              <Textarea
                label="Description"
                rows={8}
                value={description}
                hint="Shown on the product page. Line breaks are kept."
                onChange={(e) => {
                  setDescription(e.target.value)
                }}
              />
              <Input
                label="Link"
                value={slug}
                prefix="/p/"
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }}
                {...(errors['slug'] ? { error: errors['slug'] } : { hint: 'Changing this breaks links you have already shared.' })}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Pricing" />
            <div className="space-y-5">
              <Switch
                checked={isFree}
                onCheckedChange={setIsFree}
                label="Free product"
                description="Buyers enter their email and get the file. No payment step."
              />
              {!isFree && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Price"
                    inputMode="decimal"
                    prefix={symbol}
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value)
                    }}
                    {...(errors['price'] ? { error: errors['price'] } : {})}
                  />
                  <Input
                    label="Original price"
                    inputMode="decimal"
                    prefix={symbol}
                    value={compareAt}
                    onChange={(e) => {
                      setCompareAt(e.target.value)
                    }}
                    {...(errors['compareAt'] ? { error: errors['compareAt'] } : { hint: 'Optional. Shown struck through.' })}
                  />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Files buyers receive"
              description="Delivered by download link after purchase. Up to 2 GB each."
            />
            {deliverables.length > 0 && (
              <ul className="mb-4 divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {deliverables.map((file) => (
                  <li key={file.assetId} className="flex items-center gap-3 px-3.5 py-3">
                    <FileText className="size-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-medium">{file.filename}</span>
                      <span className="text-caption text-content-tertiary">{formatBytes(file.byteSize)}</span>
                    </span>
                    {scanBadge(file)}
                    <button
                      type="button"
                      onClick={() => void removeFile(file)}
                      aria-label={`Remove ${file.filename}`}
                      className="flex size-8 items-center justify-center rounded-md text-content-tertiary hover:bg-critical-subtle hover:text-critical"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileDrop
              workspaceId={workspace.id}
              productId={product.id}
              role="deliverable"
              label="Drop files here, or browse"
              hint="ZIP, PDF, video, presets, anything"
              onUploaded={refresh}
              compact={deliverables.length > 0}
            />
          </Card>

          <Card>
            <CardHeader title="Images" description="A cover makes your product stand out on your store and in shares." />
            <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
              <div>
                <p className="mb-2 text-caption font-medium text-content-secondary">Cover</p>
                {cover?.previewUrl ? (
                  <div className="group relative overflow-hidden rounded-xl border border-border-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element -- media route */}
                    <img src={cover.previewUrl} alt="Cover" className="aspect-[4/3] w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => void removeFile(cover)}
                      className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label="Remove cover image"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <FileDrop
                    workspaceId={workspace.id}
                    productId={product.id}
                    role="cover_image"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    multiple={false}
                    label="Add cover"
                    hint="1600 × 1200 works well"
                    onUploaded={refresh}
                    compact
                  />
                )}
              </div>
              <div>
                <p className="mb-2 text-caption font-medium text-content-secondary">Gallery</p>
                {gallery.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {gallery.map((img) => (
                      <div key={img.assetId} className="group relative overflow-hidden rounded-lg border border-border-subtle">
                        {img.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- media route
                          <img src={img.previewUrl} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <ImageIcon className="m-auto size-5" aria-hidden="true" />
                        )}
                        <button
                          type="button"
                          onClick={() => void removeFile(img)}
                          className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label="Remove image"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <FileDrop
                  workspaceId={workspace.id}
                  productId={product.id}
                  role="gallery"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  label="Add gallery images"
                  hint="Screenshots, previews, examples"
                  onUploaded={refresh}
                  compact
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Options"
              description="Sell tiers of the same product, like Personal and Commercial licences. Buyers pick one."
            />
            {data.variants.length > 0 && (
              <ul className="mb-4 divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {data.variants.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 px-3.5 py-3 text-body">
                    <Layers className="size-4 text-content-tertiary" aria-hidden="true" />
                    <span className="flex-1 font-medium">{v.title}</span>
                    <span className="tabular-nums text-content-secondary">
                      {formatAmount(v.price ?? product.price, product.currency, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
              <Input
                label="Option name"
                value={variantTitle}
                placeholder="Commercial licence"
                onChange={(e) => {
                  setVariantTitle(e.target.value)
                }}
              />
              <Input
                label="Price"
                inputMode="decimal"
                prefix={symbol}
                value={variantPrice}
                placeholder={minorToInput(product.price)}
                onChange={(e) => {
                  setVariantPrice(e.target.value)
                }}
              />
              <Button variant="secondary" loading={addingVariant} onClick={() => void addVariant()}>
                <Plus className="size-4" aria-hidden="true" />
                Add
              </Button>
            </div>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader title="Status" />
            {product.status === 'published' ? (
              <div className="space-y-3">
                <p className="text-body text-content-secondary">This product is on sale.</p>
                <Button variant="secondary" fullWidth loading={publishing} onClick={() => void setStatus('draft')}>
                  <Undo2 className="size-4" aria-hidden="true" />
                  Unpublish
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {!hasReadyFile && (
                  <p className="text-caption text-content-secondary">Upload the file buyers receive to publish.</p>
                )}
                <Button fullWidth loading={publishing} disabled={!hasReadyFile} onClick={() => void setStatus('published')}>
                  <Rocket className="size-4" aria-hidden="true" />
                  Publish
                </Button>
                {product.status !== 'archived' && (
                  <Button variant="ghost" fullWidth onClick={() => void setStatus('archived')}>
                    <Archive className="size-4" aria-hidden="true" />
                    Archive
                  </Button>
                )}
              </div>
            )}
            <div className="mt-5 border-t border-border-subtle pt-5">
              <Select label="Visibility" options={VISIBILITY} value={product.visibility} onValueChange={(v) => void setVisibility(v)} />
            </div>
          </Card>

          {productUrl && (
            <Card>
              <CardHeader title="Share" />
              <p className="mb-3 truncate rounded-md bg-surface-sunken px-3 py-2 font-mono text-[12px] text-content-secondary">
                {data.storeUrl}/p/{product.slug}
              </p>
              <CopyButton value={`${data.storeUrl ?? ''}/p/${product.slug}`} label="Copy product link" />
            </Card>
          )}

          {isFree && (
            <Notice tone="info" title="Lead magnet">
              <span className="inline-flex items-center gap-1.5">
                <Gift className="size-3.5" aria-hidden="true" />
                Every download adds the buyer to your customers.
              </span>
            </Notice>
          )}
        </aside>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-raised/95 backdrop-blur lg:left-[256px]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <p className="text-body text-content-secondary">You have unsaved changes</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => {
                setTitle(product.title)
                setDescription(product.description ?? '')
                setSlug(product.slug)
                setIsFree(BigInt(product.price) === 0n)
                setPrice(BigInt(product.price) === 0n ? '' : minorToInput(product.price))
                setCompareAt(product.compareAtPrice ? minorToInput(product.compareAtPrice) : '')
                setErrors({})
              }}>
                Discard
              </Button>
              <Button loading={saving} loadingLabel="Saving" onClick={() => void save()}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
