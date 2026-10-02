'use client'

/**
 * Smart Product Upload & Auto-Generator Component.
 *
 * Responsibilities:
 * - Drag & Drop / File selector for digital files (ZIP, PDF, MP4, Audio, Presets, Assets).
 * - Instant file inspection and auto-generation of Title, Category, Description, Slug, and Suggested Price.
 * - Live Verification Card enabling creator to verify details and list the product in 1 click.
 */
import { useState, useRef, type ChangeEvent, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { currency, type CurrencyCode } from '@creatorhub/contracts'
import { Button, Input, Select, useToast } from '@creatorhub/ui'
import { createProductAction } from '@/lib/catalogue-actions'

interface SmartProductUploadProps {
  readonly workspaceId: string
  readonly onProductCreated?: (productId: string) => void
  readonly onPopulateForm?: (details: {
    title: string
    slug: string
    description: string
    price: string
  }) => void
}

function cleanFilenameToTitle(filename: string): string {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
  // Replace underscores, hyphens, and dots with spaces
  const cleanSpaced = nameWithoutExt
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Capitalize words
  return cleanSpaced
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function detectFileMeta(file: File): {
  category: string
  icon: string
  suggestedPrice: string
  comparePrice: string
  descriptionDraft: string
} {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
    return {
      category: 'Video Masterclass & Course',
      icon: '🎥',
      suggestedPrice: '1999.00',
      comparePrice: '2999.00',
      descriptionDraft: `Comprehensive high-definition video masterclass with structured lessons, downloadable resources, and practical walkthroughs.\n\nWhat's included:\n• Complete video lesson package\n• Lifetime access & streaming\n• Downloadable project worksheets`,
    }
  }

  if (['pdf', 'epub', 'mobi'].includes(ext)) {
    return {
      category: 'eBook & Digital Guide',
      icon: '📚',
      suggestedPrice: '499.00',
      comparePrice: '899.00',
      descriptionDraft: `Actionable, in-depth digital guide packed with industry frameworks, checklists, and proven blueprints.\n\nWhat's included:\n• Complete digital publication (PDF)\n• Printable reference cheatsheets\n• Instant download on all devices`,
    }
  }

  if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) {
    return {
      category: 'Audio Package & Sounds',
      icon: '🎵',
      suggestedPrice: '699.00',
      comparePrice: '1299.00',
      descriptionDraft: `Studio-quality audio tracks, samples, and stems mastered for commercial and personal creative projects.\n\nWhat's included:\n• Lossless audio files\n• Full commercial license included\n• Royalty-free usage`,
    }
  }

  if (['fig', 'sketch', 'xd', 'psd', 'ai'].includes(ext)) {
    return {
      category: 'Design System & UI Kit',
      icon: '🎨',
      suggestedPrice: '1299.00',
      comparePrice: '1999.00',
      descriptionDraft: `Production-ready design system and component kit built with auto-layout, design tokens, and scalable styles.\n\nWhat's included:\n• Fully editable design assets\n• Component library with variables\n• Free future version updates`,
    }
  }

  // Default: ZIP / archives / general digital assets
  return {
    category: 'Digital Package & Assets',
    icon: '📦',
    suggestedPrice: '999.00',
    comparePrice: '1499.00',
    descriptionDraft: `Instant digital download package containing high-resolution project files, templates, and essential assets.\n\nWhat's included:\n• Complete archive package\n• Instant 1-click download\n• Lifetime access & free updates`,
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SmartProductUpload({
  workspaceId,
  onProductCreated,
  onPopulateForm,
}: SmartProductUploadProps) {
  const router = useRouter()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileMeta, setFileMeta] = useState<{ category: string; icon: string } | null>(null)

  // Generated & Verified Details
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [currencyVal, setCurrencyVal] = useState<CurrencyCode>(currency('INR'))
  const [priceStr, setPriceStr] = useState('999.00')
  const [comparePriceStr, setComparePriceStr] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public')

  const [submitting, setSubmitting] = useState(false)

  const processUploadedFile = (file: File) => {
    const detected = detectFileMeta(file)
    const cleanedTitle = cleanFilenameToTitle(file.name)
    const generatedSlug = slugify(cleanedTitle)

    setSelectedFile(file)
    setFileMeta({
      category: detected.category,
      icon: detected.icon,
    })
    setTitle(cleanedTitle)
    setSlug(generatedSlug)
    setDescription(detected.descriptionDraft)
    setPriceStr(detected.suggestedPrice)
    setComparePriceStr(detected.comparePrice)

    if (onPopulateForm) {
      onPopulateForm({
        title: cleanedTitle,
        slug: generatedSlug,
        description: detected.descriptionDraft,
        price: detected.suggestedPrice,
      })
    }

    toast.show({
      title: 'Details Auto-Generated ✨',
      description: `Drafted title, description & pricing from ${file.name}. Review below and list in 1 click.`,
      variant: 'success',
    })
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file) processUploadedFile(file)
    }
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (file) processUploadedFile(file)
    }
  }

  const handleDirectList = async (publishImmediately: boolean) => {
    if (!title.trim()) {
      toast.show({
        title: 'Title required',
        description: 'Please provide a title for your product.',
        variant: 'critical',
      })
      return
    }

    const priceNum = parseFloat(priceStr)
    if (isNaN(priceNum) || priceNum < 0) {
      toast.show({
        title: 'Invalid price',
        description: 'Please enter a valid product price.',
        variant: 'critical',
      })
      return
    }

    const basePriceMinor = BigInt(Math.round(priceNum * 100))
    let compareAtMinor: bigint | undefined
    if (comparePriceStr.trim()) {
      const compNum = parseFloat(comparePriceStr)
      if (!isNaN(compNum) && compNum > priceNum) {
        compareAtMinor = BigInt(Math.round(compNum * 100))
      }
    }

    setSubmitting(true)

    try {
      const res = await createProductAction(workspaceId, {
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        description: description.trim() || undefined,
        currency: currencyVal,
        basePrice: basePriceMinor,
        compareAtPrice: compareAtMinor,
        visibility,
        status: publishImmediately ? 'published' : 'draft',
      })

      if (!res.success) {
        toast.show({
          title: res.error.title,
          description: res.error.detail,
          variant: 'critical',
        })
        setSubmitting(false)
        return
      }

      toast.show({
        title: publishImmediately ? 'Product Listed Live! 🚀' : 'Product Saved as Draft',
        description: `'${title}' is now ${publishImmediately ? 'live on your storefront' : 'saved to catalogue'}.`,
        variant: 'success',
      })

      if (onProductCreated) {
        onProductCreated(res.data.productId)
      } else {
        router.push(`/workspaces/${workspaceId}/products`)
      }
    } catch {
      toast.show({
        title: 'Error',
        description: 'Could not create product. Please try again.',
        variant: 'critical',
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
          isDragging
            ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
            : 'border-border-control bg-surface-raised/60 hover:bg-surface-overlay/80 hover:border-indigo-500/50'
        }`}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl text-white shadow-lg shadow-indigo-500/25">
          {fileMeta ? fileMeta.icon : '⚡'}
        </div>

        <h3 className="mt-4 text-base font-bold text-content-primary">
          {selectedFile ? `Uploaded: ${selectedFile.name}` : 'Drop any file to auto-generate details & list'}
        </h3>
        <p className="mt-1 text-xs text-content-secondary max-w-md mx-auto">
          {selectedFile
            ? `${formatBytes(selectedFile.size)} · Details extracted automatically. Verify and list below.`
            : 'Upload ZIP templates, Course MP4, PDF guide, Presets, or Assets. Title, description, and pricing will be generated instantly.'}
        </p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-sunken border border-border-subtle px-3.5 py-1.5 text-xs font-bold text-accent">
          <span>{selectedFile ? 'Replace File ⟳' : 'Browse Files / Drag & Drop 📁'}</span>
        </div>
      </div>

      {/* Verification & Direct Listing Card (Shows after file is chosen) */}
      <AnimatePresence>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-3xl border border-indigo-500/30 bg-surface-raised p-6 sm:p-8 shadow-xl relative overflow-hidden space-y-6"
          >
            {/* Header Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  ✨ Auto-Generated Details — Verify & List
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-content-secondary">
                <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">
                  {fileMeta?.category}
                </span>
                <span className="rounded-lg bg-surface-sunken border border-border-subtle px-2.5 py-1">
                  {formatBytes(selectedFile.size)}
                </span>
              </div>
            </div>

            {/* Editable Fields for Fast Verification */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Product Title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setSlug(slugify(e.target.value))
                  }}
                  placeholder="e.g. Masterclass in Web Architecture"
                  required
                />
              </div>

              <div>
                <Input
                  label="Selling Price (₹ INR)"
                  type="text"
                  inputMode="decimal"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="999.00"
                  required
                />
              </div>

              <div>
                <Input
                  label="Compare-At / Original Price (Optional)"
                  type="text"
                  inputMode="decimal"
                  value={comparePriceStr}
                  onChange={(e) => setComparePriceStr(e.target.value)}
                  placeholder="1499.00"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-bold text-content-primary">
                  Description & What Buyers Get
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="block w-full rounded-xl border border-border-control bg-surface-sunken p-3 text-xs text-content-primary placeholder:text-content-tertiary focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <Select
                  label="Storefront Visibility"
                  options={[
                    { value: 'public', label: 'Public (Live in Storefront & Bio)' },
                    { value: 'unlisted', label: 'Unlisted (Direct Link Only)' },
                  ]}
                  value={visibility}
                  onValueChange={(val) => setVisibility(val as 'public' | 'unlisted')}
                />
              </div>

              <div>
                <Input
                  label="Storefront URL Slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="product-url-slug"
                />
              </div>
            </div>

            {/* Direct 1-Click Verification & Listing Actions */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border-subtle">
              <p className="text-[11px] text-content-tertiary">
                ✓ Buyers receive instant download links & automated invoices upon payment.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleDirectList(false)}
                  className="rounded-xl"
                >
                  Save Draft
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  loading={submitting}
                  loadingLabel="Listing product..."
                  onClick={() => void handleDirectList(true)}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white font-black shadow-lg shadow-indigo-500/25 px-6"
                >
                  ✓ Verify & List Product Instantly →
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
