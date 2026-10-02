'use client'

/**
 * AI Copilot & Copywriting Modal (Slice 10 §10.4, §10.6, §10.7).
 *
 * Responsibilities:
 * 1. Provides a modal interface for creators to generate copy with versioned prompts.
 * 2. Supports Product Copy, Storefront Headlines, and SEO Metadata generation.
 * 3. Configurable tone options ('persuasive', 'educational', 'minimalist', 'bold').
 * 4. 1-click "Apply" callback to populate parent forms directly.
 */
import { useState, type ReactNode } from 'react'
import { Button, Dialog, Input, useToast } from '@creatorhub/ui'
import type {
  ProductCopyOutput,
  SeoMetadataOutput,
  StorefrontCopyOutput,
} from '@creatorhub/contracts'

import {
  generateProductCopyAction,
  generateSeoMetadataAction,
  generateStorefrontCopyAction,
} from '../../lib/ai-actions'

export type AiCopilotModalMode = 'product' | 'storefront' | 'seo'

export type AiCopilotModalProps = {
  readonly workspaceId: string
  readonly mode: AiCopilotModalMode
  readonly trigger?: ReactNode
  readonly initialContext?: {
    readonly title?: string
    readonly category?: string
    readonly targetAudience?: string
    readonly creatorName?: string
    readonly brandNiche?: string
  }
  readonly onApplyProductCopy?: (copy: ProductCopyOutput) => void
  readonly onApplyStorefrontCopy?: (copy: StorefrontCopyOutput) => void
  readonly onApplySeoMetadata?: (seo: SeoMetadataOutput) => void
}

export function AiCopilotModal({
  workspaceId,
  mode,
  trigger,
  initialContext,
  onApplyProductCopy,
  onApplyStorefrontCopy,
  onApplySeoMetadata,
}: AiCopilotModalProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)

  // Form Inputs
  const [title, setTitle] = useState(initialContext?.title ?? '')
  const [category, setCategory] = useState(initialContext?.category ?? '')
  const [targetAudience, setTargetAudience] = useState(initialContext?.targetAudience ?? '')
  const [creatorName, setCreatorName] = useState(initialContext?.creatorName ?? '')
  const [brandNiche, setBrandNiche] = useState(initialContext?.brandNiche ?? '')
  const [tone, setTone] = useState<'persuasive' | 'educational' | 'minimalist' | 'bold'>('persuasive')

  // Status
  const [generating, setGenerating] = useState(false)
  const [productResult, setProductResult] = useState<ProductCopyOutput | null>(null)
  const [storefrontResult, setStorefrontResult] = useState<StorefrontCopyOutput | null>(null)
  const [seoResult, setSeoResult] = useState<SeoMetadataOutput | null>(null)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      if (mode === 'product') {
        const res = await generateProductCopyAction(workspaceId, {
          title: title.trim() || 'Digital Product',
          ...(category.trim() ? { category: category.trim() } : {}),
          ...(targetAudience.trim() ? { targetAudience: targetAudience.trim() } : {}),
          tone,
        })

        if (!res.ok) {
          toast.show({
            title: 'Generation Failed',
            description: res.error.message,
            variant: 'critical',
          })
          setGenerating(false)
          return
        }

        setProductResult(res.data)
      } else if (mode === 'storefront') {
        const res = await generateStorefrontCopyAction(workspaceId, {
          creatorName: creatorName.trim() || 'Creator',
          brandNiche: brandNiche.trim() || 'Digital Products',
          ...(targetAudience.trim() ? { targetAudience: targetAudience.trim() } : {}),
          tone,
        })

        if (!res.ok) {
          toast.show({
            title: 'Generation Failed',
            description: res.error.message,
            variant: 'critical',
          })
          setGenerating(false)
          return
        }

        setStorefrontResult(res.data)
      } else if (mode === 'seo') {
        const res = await generateSeoMetadataAction(workspaceId, {
          pageType: 'storefront_home',
          pageTitle: title.trim() || 'Storefront & Products',
          descriptionSummary: targetAudience.trim() || 'Premium digital products and masterclasses',
          ...(brandNiche.trim() ? { primaryKeywords: brandNiche.trim() } : {}),
        })

        if (!res.ok) {
          toast.show({
            title: 'Generation Failed',
            description: res.error.message,
            variant: 'critical',
          })
          setGenerating(false)
          return
        }

        setSeoResult(res.data)
      }

      toast.show({
        title: 'Copy generated',
        description: 'Review the generated output below and apply it directly.',
        variant: 'success',
      })
    } catch {
      toast.show({
        title: 'Error',
        description: 'Failed to generate copy.',
        variant: 'critical',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleApply = () => {
    if (mode === 'product' && productResult && onApplyProductCopy) {
      onApplyProductCopy(productResult)
      setOpen(false)
      toast.show({
        title: 'Applied to form',
        description: 'Product title, description, and benefits have been populated.',
        variant: 'success',
      })
    } else if (mode === 'storefront' && storefrontResult && onApplyStorefrontCopy) {
      onApplyStorefrontCopy(storefrontResult)
      setOpen(false)
      toast.show({
        title: 'Applied to storefront',
        description: 'Hero headlines and value props have been updated.',
        variant: 'success',
      })
    } else if (mode === 'seo' && seoResult && onApplySeoMetadata) {
      onApplySeoMetadata(seoResult)
      setOpen(false)
      toast.show({
        title: 'Applied SEO metadata',
        description: 'Title, meta description, and keywords populated.',
        variant: 'success',
      })
    }
  }

  const getTitle = () => {
    switch (mode) {
      case 'product':
        return 'AI Product Copy Assistant'
      case 'storefront':
        return 'AI Storefront Copy Assistant'
      case 'seo':
        return 'AI SEO & Metadata Generator'
    }
  }

  const getDescription = () => {
    switch (mode) {
      case 'product':
        return 'Generate high-converting product titles, engaging descriptions, and structured benefits.'
      case 'storefront':
        return 'Craft compelling headlines, subheads, and brand value propositions for your storefront.'
      case 'seo':
        return 'Generate search-optimized meta tags, titles, and social preview descriptions.'
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={getTitle()}
      description={getDescription()}
      trigger={
        trigger ?? (
          <Button variant="secondary" size="small">
            ✨ Generate with AI
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        {/* Mode specific fields */}
        {mode === 'product' && (
          <div className="flex flex-col gap-3">
            <Input
              label="Product Working Title"
              placeholder="e.g. Masterclass on Next.js 15 & System Design"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Category / Format"
                placeholder="e.g. Video Course, Notion Template"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <Input
                label="Target Audience"
                placeholder="e.g. Senior Frontend Engineers"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>
          </div>
        )}

        {mode === 'storefront' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Creator / Brand Name"
                placeholder="e.g. Sarah Jenkins Design"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
              />
              <Input
                label="Brand Niche"
                placeholder="e.g. UI/UX Figma Systems"
                value={brandNiche}
                onChange={(e) => setBrandNiche(e.target.value)}
              />
            </div>
            <Input
              label="Target Audience"
              placeholder="e.g. Product Designers & Agencies"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </div>
        )}

        {mode === 'seo' && (
          <div className="flex flex-col gap-3">
            <Input
              label="Page / Product Name"
              placeholder="e.g. Design Tokens Pro Kit"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              label="Primary Keyword"
              placeholder="e.g. figma design system templates"
              value={brandNiche}
              onChange={(e) => setBrandNiche(e.target.value)}
            />
          </div>
        )}

        {/* Tone Selector */}
        <div>
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Tone of Voice
          </label>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {(['persuasive', 'educational', 'minimalist', 'bold'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-all ${
                  tone === t
                    ? 'border-violet-600 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-300'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          variant="primary"
          onClick={() => {
            void handleGenerate()
          }}
          disabled={generating}
        >
          {generating ? '✨ Generating Copy...' : '✨ Generate with AI'}
        </Button>

        {/* Result Preview */}
        {productResult && mode === 'product' && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Generated Title
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {productResult.title}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Description
              </span>
              <p className="text-xs text-neutral-700 leading-relaxed dark:text-neutral-300">
                {productResult.descriptionMarkdown}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Key Benefits
              </span>
              <ul className="mt-1 list-disc pl-4 text-xs text-neutral-700 dark:text-neutral-300 space-y-1">
                {productResult.keyBenefits.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="mt-2 flex justify-end">
              <Button variant="primary" size="small" onClick={handleApply}>
                Apply to Product
              </Button>
            </div>
          </div>
        )}

        {storefrontResult && mode === 'storefront' && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Headline
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {storefrontResult.heroHeadline}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Subheadline
              </span>
              <p className="text-xs text-neutral-700 leading-relaxed dark:text-neutral-300">
                {storefrontResult.heroSubhead}
              </p>
            </div>

            <div className="mt-2 flex justify-end">
              <Button variant="primary" size="small" onClick={handleApply}>
                Apply to Storefront
              </Button>
            </div>
          </div>
        )}

        {seoResult && mode === 'seo' && (
          <div className="mt-2 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/50">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                SEO Title
              </span>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {seoResult.seoTitle}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Meta Description
              </span>
              <p className="text-xs text-neutral-700 leading-relaxed dark:text-neutral-300">
                {seoResult.metaDescription}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Target Keywords
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {seoResult.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-neutral-200/80 px-2 py-0.5 text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-2 flex justify-end">
              <Button variant="primary" size="small" onClick={handleApply}>
                Apply SEO Metadata
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
