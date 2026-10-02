'use client'

/**
 * The AI copilot's three entry points: write a product description, suggest a
 * storefront headline and bio, and explain the store's numbers. Each shows a
 * draft first; nothing changes until the creator chooses to use it.
 */
import { useState } from 'react'
import { Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import type {
  AnalyticsInsightsOutput,
  ProductCopyOutput,
  StorefrontCopyOutput,
} from '@creatorhub/contracts'
import { Button, Dialog, Input } from '@creatorhub/ui'

import { Card, CardHeader, Segmented, Spinner, Textarea } from '@/components/ds'
import { useWorkspace } from '@/components/layout/DashboardShell'
import {
  generateAnalyticsInsightsAction,
  generateProductCopyAction,
  generateStorefrontCopyAction,
} from '@/lib/ai-actions'

type Tone = 'persuasive' | 'educational' | 'minimalist' | 'bold'

function AiButton({ label, onClick }: { readonly label: string; readonly onClick?: () => void }) {
  return (
    <Button variant="secondary" size="small" {...(onClick ? { onClick } : {})}>
      <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
      {label}
    </Button>
  )
}

function ErrorLine({ message }: { readonly message: string | undefined }) {
  if (!message) return null
  return (
    <p role="alert" className="text-body text-critical">
      {message}
    </p>
  )
}

/** Markdown from the model, flattened to the plain text the description field holds. */
function toPlainDescription(copy: ProductCopyOutput): string {
  const body = copy.descriptionMarkdown
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .trim()
  const benefits = copy.keyBenefits.map((b) => `• ${b}`).join('\n')
  return `${copy.tagline}\n\n${body}\n\nWhat you get:\n${benefits}`
}

export function ProductCopyAssist({
  title,
  description,
  onApply,
}: {
  readonly title: string
  readonly description: string
  readonly onApply: (next: { readonly title?: string; readonly description: string }) => void
}) {
  const { workspace, aiEnabled } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState<Tone>('persuasive')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<ProductCopyOutput>()

  if (!aiEnabled) return null

  async function run() {
    setBusy(true)
    setError(undefined)
    const result = await generateProductCopyAction(workspace.id, {
      title,
      keyPoints: notes || description,
      ...(audience ? { targetAudience: audience } : {}),
      tone,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setDraft(result.data)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setNotes(description)
          setDraft(undefined)
          setError(undefined)
        }
      }}
      title="Write with AI"
      description="Give it the facts. It drafts a description you can edit before anyone sees it."
      trigger={<AiButton label="Write with AI" />}
    >
      {!draft ? (
        <div className="space-y-4">
          <Textarea
            label="What is it, and what is in it?"
            rows={5}
            placeholder="15 Lightroom presets from my monsoon street series. Mobile DNGs included. Works in Lightroom Classic and Mobile."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
          />
          <Input
            label="Who is it for?"
            placeholder="Street and travel photographers who shoot in harsh light"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value)
            }}
          />
          <Segmented<Tone>
            label="Tone"
            value={tone}
            onChange={setTone}
            options={[
              { value: 'persuasive', label: 'Persuasive' },
              { value: 'educational', label: 'Helpful' },
              { value: 'minimalist', label: 'Minimal' },
              { value: 'bold', label: 'Bold' },
            ]}
          />
          <ErrorLine message={error} />
          <div className="flex justify-end">
            <Button
              loading={busy}
              loadingLabel="Writing"
              disabled={!notes.trim() && !title.trim()}
              onClick={() => void run()}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Write it
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-border-subtle bg-surface-sunken/50 p-4">
            <p className="text-heading">{draft.title}</p>
            <p className="text-body text-content-secondary">{draft.tagline}</p>
            <p className="text-body whitespace-pre-line">
              {toPlainDescription(draft).split('\n\n').slice(1).join('\n\n')}
            </p>
          </div>
          <ErrorLine message={error} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" loading={busy} onClick={() => void run()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onApply({ description: toPlainDescription(draft) })
                setOpen(false)
              }}
            >
              Use description
            </Button>
            <Button
              onClick={() => {
                onApply({ title: draft.title, description: toPlainDescription(draft) })
                setOpen(false)
              }}
            >
              Use title and description
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function StoreCopyAssist({
  creatorName,
  onApply,
}: {
  readonly creatorName: string
  readonly onApply: (next: { readonly headline: string; readonly bio: string }) => void
}) {
  const { workspace, aiEnabled } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [niche, setNiche] = useState('')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<StorefrontCopyOutput>()

  if (!aiEnabled) return null

  async function run() {
    setBusy(true)
    setError(undefined)
    const result = await generateStorefrontCopyAction(workspace.id, {
      creatorName,
      brandNiche: niche,
      ...(focus ? { mainProductFocus: focus } : {}),
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setDraft(result.data)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setDraft(undefined)
          setError(undefined)
        }
      }}
      title="Suggest a headline and bio"
      description="Describe what you do in a few words. You can edit the result."
      trigger={<AiButton label="Suggest with AI" />}
    >
      {!draft ? (
        <div className="space-y-4">
          <Input
            label="What do you make?"
            placeholder="Lightroom presets and editing courses"
            value={niche}
            onChange={(e) => {
              setNiche(e.target.value)
            }}
          />
          <Input
            label="Your main product (optional)"
            placeholder="Monsoon street preset pack"
            value={focus}
            onChange={(e) => {
              setFocus(e.target.value)
            }}
          />
          <ErrorLine message={error} />
          <div className="flex justify-end">
            <Button
              loading={busy}
              loadingLabel="Writing"
              disabled={niche.trim().length < 3}
              onClick={() => void run()}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Suggest
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-sunken/50 p-4">
            <p className="text-heading">{draft.heroHeadline}</p>
            <p className="text-body text-content-secondary">{draft.heroSubhead}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" loading={busy} onClick={() => void run()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </Button>
            <Button
              onClick={() => {
                onApply({ headline: draft.heroHeadline, bio: draft.heroSubhead.slice(0, 300) })
                setOpen(false)
              }}
            >
              Use these
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export function InsightsCard({ timeframe }: { readonly timeframe: string }) {
  const { workspace, aiEnabled } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [insights, setInsights] = useState<AnalyticsInsightsOutput>()

  if (!aiEnabled) return null

  async function run() {
    setBusy(true)
    setError(undefined)
    const result = await generateAnalyticsInsightsAction(workspace.id, timeframe)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setInsights(result.data)
  }

  return (
    <Card>
      <CardHeader
        title="What this means"
        description="A plain-language read of these numbers, and what to try next."
        action={
          insights ? (
            <Button variant="ghost" size="small" loading={busy} onClick={() => void run()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Refresh
            </Button>
          ) : undefined
        }
      />
      {!insights ? (
        <div className="flex flex-col items-start gap-3">
          {busy ? (
            <p className="flex items-center gap-2 text-body text-content-secondary">
              <Spinner label="Reading your numbers" /> Reading your numbers…
            </p>
          ) : (
            <AiButton label="Explain my numbers" onClick={() => void run()} />
          )}
          <ErrorLine message={error} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-body">{insights.executiveSummary}</p>
          <p className="text-body text-content-secondary">
            <span className="font-medium text-content-primary">What is driving it: </span>
            {insights.keyDriver}
          </p>
          <ul className="space-y-2">
            {insights.growthActions.map((action) => (
              <li key={action} className="flex gap-2.5 text-body">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                {action}
              </li>
            ))}
          </ul>
          {insights.riskAlert && <p className="text-caption text-caution">{insights.riskAlert}</p>}
          <p className="text-caption text-content-tertiary">
            Written by AI from your store data. Check it before acting on it.
          </p>
        </div>
      )}
    </Card>
  )
}
