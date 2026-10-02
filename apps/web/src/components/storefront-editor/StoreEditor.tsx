'use client'

/**
 * The storefront editor: every change shows up in the preview on the right as
 * you make it, rendered by the same components buyers see. Nothing reaches the
 * public store until you save, and nothing is public at all until you publish.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Globe,
  ImagePlus,
  Laptop,
  Link2,
  Palette,
  Plus,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react'
import {
  SOCIAL_PLATFORMS,
  type CustomDomainChallenge,
  type SocialPlatform,
  type StorefrontTheme,
  type ThemeLayoutPreset,
} from '@creatorhub/contracts'
import { Button, Input, Select, useToast } from '@creatorhub/ui'

import {
  Badge,
  Card,
  CardHeader,
  CopyButton,
  cn,
  Notice,
  PageHeader,
  Segmented,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
} from '@/components/ds'
import { StoreCopyAssist } from '@/components/ai/Copilot'
import { StoreHome } from '@/components/store/StoreHome'
import { StoreShell } from '@/components/store/StoreShell'
import { PLATFORM_LABELS, SocialIcon } from '@/components/storefront/SocialIcons'
import type { StorefrontEditorData } from '@/lib/dashboard-data'
import { ACCENT_PRESETS, storeAccent } from '@/lib/store-theme'
import {
  connectCustomDomainAction,
  removeCustomDomainAction,
  saveStorefrontAction,
  setStorefrontPublishedAction,
  verifyCustomDomainAction,
  type CustomDomainState,
} from '@/lib/storefront-actions'
import { uploadAsset } from '@/lib/upload-client'

type Draft = {
  readonly title: string
  readonly tagline: string
  readonly theme: StorefrontTheme
}

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const LAYOUTS: readonly {
  readonly value: ThemeLayoutPreset
  readonly label: string
  readonly hint: string
}[] = [
  { value: 'showcase', label: 'Showcase', hint: 'Large cards, two across' },
  { value: 'grid', label: 'Grid', hint: 'Compact, three across' },
  { value: 'minimal', label: 'Minimal', hint: 'A list, like link-in-bio' },
  { value: 'editorial', label: 'Editorial', hint: 'Dark, magazine feel' },
]

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string
  readonly hint?: string
  readonly children: ReactNode
}) {
  return (
    <div>
      <p className="mb-1.5 text-body font-medium text-content-primary">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-caption text-content-tertiary">{hint}</p>}
    </div>
  )
}

function ImagePicker({
  workspaceId,
  label,
  hint,
  url,
  shape,
  onChange,
}: {
  readonly workspaceId: string
  readonly label: string
  readonly hint: string
  readonly url: string | null
  readonly shape: 'circle' | 'wide'
  readonly onChange: (next: { assetId: string; url: string } | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const inputId = `pick-${label.toLowerCase().replace(/\W+/g, '-')}`

  async function pick(file: File | undefined) {
    if (!file) return
    setError(undefined)
    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      setError('Use a PNG, JPEG, WebP, GIF, or AVIF image.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Images can be up to 10 MB.')
      return
    }
    setBusy(true)
    try {
      const assetId = await uploadAsset(workspaceId, file)
      onChange({ assetId, url: URL.createObjectURL(file) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Field label={label} {...(error ? {} : { hint })}>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden border border-border-subtle bg-surface-sunken text-content-tertiary',
            shape === 'circle' ? 'size-16 rounded-full' : 'h-16 w-32 rounded-xl',
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview or our media route
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5" aria-hidden="true" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface-raised/70">
              <Spinner label="Uploading" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border-control bg-surface-raised px-3 text-body font-medium text-content-primary transition-colors hover:bg-surface-sunken focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          >
            {url ? 'Replace' : 'Upload'}
            <input
              id={inputId}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {url && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                onChange(null)
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-caption text-critical">
          {error}
        </p>
      )}
    </Field>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  readonly label: string
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-content-tertiary transition-colors hover:bg-surface-sunken hover:text-content-primary disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function DnsRecords({ challenge }: { readonly challenge: CustomDomainChallenge }) {
  const rows = [
    {
      type: 'CNAME',
      name: challenge.cnameRecord.host,
      value: challenge.cnameRecord.target,
      note: 'Routes visitors to your store',
    },
    {
      type: 'TXT',
      name: challenge.txtRecord.host,
      value: challenge.txtRecord.value,
      note: 'Proves you own the domain',
    },
  ]
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.type}
          className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <Badge>{row.type}</Badge>
            <span className="text-caption text-content-tertiary">{row.note}</span>
          </div>
          <dl className="space-y-1.5 text-caption">
            {(
              [
                ['Name', row.name],
                ['Value', row.value],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <dt className="w-12 shrink-0 text-content-tertiary">{label}</dt>
                <dd className="min-w-0 flex-1 truncate font-mono text-content-primary">{value}</dd>
                <CopyButton
                  value={value}
                  label={`Copy ${row.type} ${label.toLowerCase()}`}
                  iconOnly
                />
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

export function StoreEditor({
  workspaceId,
  data,
}: {
  readonly workspaceId: string
  readonly data: StorefrontEditorData
}) {
  const router = useRouter()
  const toast = useToast()

  const initial: Draft = useMemo(
    () => ({ title: data.store.title, tagline: data.store.tagline ?? '', theme: data.store.theme }),
    [data.store],
  )
  const [draft, setDraft] = useState<Draft>(initial)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial))
  const [logoUrl, setLogoUrl] = useState(data.store.logoUrl)
  const [bannerUrl, setBannerUrl] = useState(data.store.bannerUrl)
  const [status, setStatus] = useState(data.status)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [accentText, setAccentText] = useState(storeAccent(initial.theme))
  const [newPlatform, setNewPlatform] = useState<string>('')

  const [domain, setDomain] = useState<CustomDomainState>({ ...data.domain })
  const [domainInput, setDomainInput] = useState('')
  const [domainBusy, setDomainBusy] = useState<'connect' | 'verify' | 'remove' | null>(null)
  const [domainError, setDomainError] = useState<string>()

  const dirty = JSON.stringify(draft) !== savedJson
  const theme = draft.theme

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [dirty])

  const setTheme = (patch: Partial<StorefrontTheme>) => {
    setDraft((current) => ({ ...current, theme: { ...current.theme, ...patch } }))
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    const result = await saveStorefrontAction(workspaceId, {
      title: draft.title,
      tagline: draft.tagline.trim() || null,
      theme: draft.theme,
    })
    setSaving(false)
    if (!result.ok) {
      toast.show({ title: 'Could not save', description: result.error, variant: 'critical' })
      return false
    }
    setSavedJson(JSON.stringify(draft))
    router.refresh()
    return true
  }

  async function togglePublished() {
    const publish = status !== 'published'
    if (publish && dirty && !(await save())) return
    setPublishing(true)
    const result = await setStorefrontPublishedAction(workspaceId, publish)
    setPublishing(false)
    if (!result.ok) {
      toast.show({
        title: publish ? 'Could not publish' : 'Could not unpublish',
        description: result.error,
        variant: 'critical',
      })
      return
    }
    setStatus(result.data.status)
    toast.show(
      publish
        ? { title: 'Your store is live', description: data.store.url, variant: 'success' }
        : {
            title: 'Store taken offline',
            description: 'Visitors now see a not found page until you publish again.',
          },
    )
    router.refresh()
  }

  async function domainStep(step: 'connect' | 'verify' | 'remove') {
    setDomainBusy(step)
    setDomainError(undefined)
    const result =
      step === 'connect'
        ? await connectCustomDomainAction(workspaceId, domainInput)
        : step === 'verify'
          ? await verifyCustomDomainAction(workspaceId)
          : await removeCustomDomainAction(workspaceId)
    setDomainBusy(null)
    if (!result.ok) {
      setDomainError(result.error)
      return
    }
    setDomain(result.data)
    if (step === 'connect') setDomainInput('')
    if (step === 'verify' && result.data.status === 'verified') {
      toast.show({
        title: 'Domain connected',
        description: `${result.data.domain ?? ''} now serves your store.`,
        variant: 'success',
      })
    }
  }

  const previewStore = {
    ...data.store,
    title: draft.title || 'Your store',
    tagline: draft.tagline || null,
    theme,
    logoUrl,
    bannerUrl,
    isPreview: false,
  }

  const usedPlatforms = new Set(theme.socialLinks.map((link) => link.platform))
  const availablePlatforms = SOCIAL_PLATFORMS.filter((p) => !usedPlatforms.has(p))
  const live = status === 'published'

  return (
    <div>
      <PageHeader
        title="Storefront"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={live ? 'positive' : status === 'suspended' ? 'critical' : 'neutral'} dot>
              {live ? 'Live' : status === 'suspended' ? 'Suspended' : 'Draft'}
            </Badge>
            <a
              href={live ? data.store.url : `${data.store.url}?preview=${workspaceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-content-secondary hover:text-content-primary hover:underline"
            >
              {data.store.url.replace(/^https?:\/\//, '')}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!dirty}
              loading={saving}
              loadingLabel="Saving"
              onClick={() => void save()}
            >
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
            <Button
              variant={live ? 'ghost' : 'primary'}
              loading={publishing}
              disabled={status === 'suspended'}
              onClick={() => void togglePublished()}
            >
              {live ? 'Unpublish' : 'Publish store'}
            </Button>
          </>
        }
      />

      {status === 'suspended' && (
        <div className="mb-6">
          <Notice tone="critical" title="This store is suspended">
            CreatorHub has taken this store offline. Reply to the email we sent you, or write to
            support, to have it reviewed.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <Card className="self-start">
          <Tabs defaultValue="profile">
            <TabList label="Storefront settings">
              <Tab value="profile">
                <UserRound className="size-4" aria-hidden="true" />
                Profile
              </Tab>
              <Tab value="links">
                <Link2 className="size-4" aria-hidden="true" />
                Links
              </Tab>
              <Tab value="design">
                <Palette className="size-4" aria-hidden="true" />
                Design
              </Tab>
              <Tab value="domain">
                <Globe className="size-4" aria-hidden="true" />
                Domain
              </Tab>
            </TabList>

            <TabPanel value="profile">
              <div className="space-y-6 pt-5">
                <ImagePicker
                  workspaceId={workspaceId}
                  label="Profile picture"
                  hint="Square works best. Shown as a circle, at least 400 by 400 pixels."
                  url={logoUrl}
                  shape="circle"
                  onChange={(next) => {
                    setLogoUrl(next?.url ?? null)
                    setTheme({
                      logoAssetId: (next?.assetId ?? undefined) as StorefrontTheme['logoAssetId'],
                    })
                  }}
                />
                <ImagePicker
                  workspaceId={workspaceId}
                  label="Banner"
                  hint="Wide image across the top, about 1500 by 500 pixels. Leave empty for a gradient in your accent colour."
                  url={bannerUrl}
                  shape="wide"
                  onChange={(next) => {
                    setBannerUrl(next?.url ?? null)
                    setTheme({
                      bannerAssetId: (next?.assetId ??
                        undefined) as StorefrontTheme['bannerAssetId'],
                    })
                  }}
                />
                <Input
                  label="Store name"
                  value={draft.title}
                  maxLength={100}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }}
                  {...(draft.title.trim() ? {} : { error: 'Give your store a name.' })}
                />
                <div className="flex justify-end">
                  <StoreCopyAssist
                    creatorName={draft.title}
                    onApply={({ headline, bio }) => {
                      setDraft((d) => ({ ...d, tagline: headline, theme: { ...d.theme, bio } }))
                    }}
                  />
                </div>
                <Input
                  label="Headline"
                  hint="One line under your name. What you make, for whom."
                  value={draft.tagline}
                  maxLength={200}
                  onChange={(e) => {
                    setDraft((d) => ({ ...d, tagline: e.target.value }))
                  }}
                />
                <Textarea
                  label="Bio"
                  rows={4}
                  maxLength={300}
                  value={theme.bio ?? ''}
                  hint={`${String((theme.bio ?? '').length)} of 300 characters`}
                  onChange={(e) => {
                    setTheme({ bio: e.target.value })
                  }}
                />
              </div>
            </TabPanel>

            <TabPanel value="links">
              <div className="space-y-8 pt-5">
                <section aria-labelledby="socials-heading">
                  <h3 id="socials-heading" className="text-body font-medium">
                    Social profiles
                  </h3>
                  <p className="mt-0.5 mb-3 text-caption text-content-tertiary">
                    Shown as icons under your bio.
                  </p>
                  <ul className="space-y-2">
                    {theme.socialLinks.map((link, index) => (
                      <li key={link.platform} className="flex items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-sunken">
                          <SocialIcon platform={link.platform} className="size-4" />
                        </span>
                        <Input
                          label={`${PLATFORM_LABELS[link.platform]} URL`}
                          labelHidden
                          className="min-w-0 flex-1"
                          placeholder={`https://${link.platform === 'website' ? 'yoursite.com' : `${link.platform}.com/you`}`}
                          value={link.url}
                          onChange={(e) => {
                            const socialLinks = theme.socialLinks.map((l, i) =>
                              i === index ? { ...l, url: e.target.value } : l,
                            )
                            setTheme({ socialLinks })
                          }}
                        />
                        <IconButton
                          label={`Remove ${PLATFORM_LABELS[link.platform]}`}
                          onClick={() => {
                            setTheme({
                              socialLinks: theme.socialLinks.filter((_, i) => i !== index),
                            })
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                  {availablePlatforms.length > 0 && theme.socialLinks.length < 10 && (
                    <div className="mt-3">
                      <Select
                        label="Add a social profile"
                        labelHidden
                        placeholder="Add a social profile"
                        value={newPlatform}
                        options={availablePlatforms.map((p) => ({
                          value: p,
                          label: PLATFORM_LABELS[p],
                        }))}
                        onValueChange={(value) => {
                          setNewPlatform('')
                          setTheme({
                            socialLinks: [
                              ...theme.socialLinks,
                              { platform: value as SocialPlatform, url: '' },
                            ],
                          })
                        }}
                      />
                    </div>
                  )}
                </section>

                <section aria-labelledby="links-heading">
                  <h3 id="links-heading" className="text-body font-medium">
                    Links
                  </h3>
                  <p className="mt-0.5 mb-3 text-caption text-content-tertiary">
                    Buttons for anything that is not a product: a booking page, a newsletter, your
                    latest video.
                  </p>
                  <ul className="space-y-3">
                    {theme.customLinks.map((link, index) => {
                      const update = (patch: Partial<typeof link>) => {
                        setTheme({
                          customLinks: theme.customLinks.map((l, i) =>
                            i === index ? { ...l, ...patch } : l,
                          ),
                        })
                      }
                      return (
                        <li key={index} className="rounded-xl border border-border-subtle p-3">
                          <div className="flex items-start gap-2">
                            <Input
                              label="Emoji"
                              labelHidden
                              placeholder="✨"
                              className="w-14 shrink-0 text-center"
                              maxLength={4}
                              value={link.emoji ?? ''}
                              onChange={(e) => {
                                update({ emoji: e.target.value || undefined })
                              }}
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <Input
                                label="Button label"
                                labelHidden
                                placeholder="Book a 1:1 session"
                                maxLength={80}
                                value={link.label}
                                onChange={(e) => {
                                  update({ label: e.target.value })
                                }}
                              />
                              <Input
                                label="Link URL"
                                labelHidden
                                placeholder="https://"
                                value={link.url}
                                onChange={(e) => {
                                  update({ url: e.target.value })
                                }}
                              />
                            </div>
                            <div className="flex flex-col">
                              <IconButton
                                label="Move up"
                                disabled={index === 0}
                                onClick={() => {
                                  const next = [...theme.customLinks]
                                  ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                                  setTheme({ customLinks: next })
                                }}
                              >
                                <ArrowUp className="size-4" aria-hidden="true" />
                              </IconButton>
                              <IconButton
                                label="Move down"
                                disabled={index === theme.customLinks.length - 1}
                                onClick={() => {
                                  const next = [...theme.customLinks]
                                  ;[next[index + 1], next[index]] = [next[index]!, next[index + 1]!]
                                  setTheme({ customLinks: next })
                                }}
                              >
                                <ArrowDown className="size-4" aria-hidden="true" />
                              </IconButton>
                              <IconButton
                                label={`Remove ${link.label || 'link'}`}
                                onClick={() => {
                                  setTheme({
                                    customLinks: theme.customLinks.filter((_, i) => i !== index),
                                  })
                                }}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </IconButton>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {theme.customLinks.length < 20 && (
                    <Button
                      variant="secondary"
                      size="small"
                      className="mt-3"
                      onClick={() => {
                        setTheme({ customLinks: [...theme.customLinks, { label: '', url: '' }] })
                      }}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Add link
                    </Button>
                  )}
                </section>
              </div>
            </TabPanel>

            <TabPanel value="design">
              <div className="space-y-7 pt-5">
                <Field
                  label="Accent colour"
                  hint="Buttons, prices, and highlights. Text on it switches to black or white for contrast."
                >
                  <div
                    className="flex flex-wrap gap-2"
                    role="radiogroup"
                    aria-label="Accent presets"
                  >
                    {ACCENT_PRESETS.map((preset) => {
                      const selected = storeAccent(theme).toLowerCase() === preset.hex
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={preset.name}
                          title={preset.name}
                          onClick={() => {
                            setTheme({ accentColor: preset.hex })
                            setAccentText(preset.hex)
                          }}
                          className={cn(
                            'size-8 rounded-full border border-border-subtle transition-transform hover:scale-110',
                            selected &&
                              'ring-2 ring-content-primary ring-offset-2 ring-offset-surface-raised',
                          )}
                          style={{ background: preset.hex }}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick any colour"
                      value={storeAccent(theme)}
                      onChange={(e) => {
                        setTheme({ accentColor: e.target.value })
                        setAccentText(e.target.value)
                      }}
                      className="size-9 shrink-0 cursor-pointer rounded-lg border border-border-control bg-surface-raised p-1"
                    />
                    <Input
                      label="Hex value"
                      labelHidden
                      className="w-32 font-mono"
                      value={accentText}
                      onChange={(e) => {
                        const value = e.target.value.trim()
                        setAccentText(value)
                        if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value))
                          setTheme({ accentColor: value.toLowerCase() })
                      }}
                    />
                  </div>
                </Field>

                <Field label="Layout">
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout">
                    {LAYOUTS.map((layout) => {
                      const selected = (theme.layoutPreset ?? 'showcase') === layout.value
                      return (
                        <button
                          key={layout.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            setTheme({ layoutPreset: layout.value })
                          }}
                          className={cn(
                            'rounded-xl border p-3 text-left transition-colors',
                            selected
                              ? 'border-accent bg-accent-subtle'
                              : 'border-border-subtle hover:border-border-control hover:bg-surface-sunken/50',
                          )}
                        >
                          <span className="block text-body font-medium">{layout.label}</span>
                          <span className="block text-caption text-content-tertiary">
                            {layout.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <Field label="Heading font">
                  <Segmented<'sans' | 'serif' | 'mono'>
                    label="Heading font"
                    value={theme.fontPreset ?? 'sans'}
                    onChange={(value) => {
                      setTheme({ fontPreset: value })
                    }}
                    options={[
                      { value: 'sans', label: 'Modern' },
                      { value: 'serif', label: 'Editorial' },
                      { value: 'mono', label: 'Technical' },
                    ]}
                  />
                </Field>
              </div>
            </TabPanel>

            <TabPanel value="domain">
              <div className="space-y-6 pt-5">
                <Field
                  label="Your CreatorHub address"
                  hint="Always works, even after you connect your own domain."
                >
                  <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-sunken/50 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                      {data.store.url}
                    </span>
                    <CopyButton value={data.store.url} label="Copy store address" iconOnly />
                  </div>
                </Field>

                <Field label="Custom domain">
                  {domain.domain ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-mono text-[13px]">
                          {domain.domain}
                        </span>
                        <Badge
                          tone={
                            domain.status === 'verified'
                              ? 'positive'
                              : domain.status === 'failed'
                                ? 'caution'
                                : 'neutral'
                          }
                          dot
                        >
                          {domain.status === 'verified'
                            ? 'Connected'
                            : domain.status === 'failed'
                              ? 'Not found yet'
                              : 'Waiting for DNS'}
                        </Badge>
                      </div>
                      {domain.status !== 'verified' && domain.challenge && (
                        <>
                          <p className="text-caption text-content-secondary">
                            Add these two records where you bought the domain (GoDaddy, Namecheap,
                            Cloudflare, Hostinger), then check. Changes usually show up within an
                            hour.
                          </p>
                          <DnsRecords challenge={domain.challenge} />
                        </>
                      )}
                      {domain.message && <Notice tone="caution">{domain.message}</Notice>}
                      <div className="flex gap-2">
                        {domain.status !== 'verified' && (
                          <Button
                            size="small"
                            loading={domainBusy === 'verify'}
                            loadingLabel="Checking"
                            onClick={() => void domainStep('verify')}
                          >
                            Check DNS
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="ghost"
                          loading={domainBusy === 'remove'}
                          onClick={() => void domainStep('remove')}
                        >
                          Remove domain
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <form
                      className="flex items-start gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void domainStep('connect')
                      }}
                    >
                      <Input
                        label="Your domain"
                        labelHidden
                        className="min-w-0 flex-1"
                        placeholder="shop.yourname.com"
                        value={domainInput}
                        onChange={(e) => {
                          setDomainInput(e.target.value)
                        }}
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        loading={domainBusy === 'connect'}
                        disabled={!domainInput.trim()}
                      >
                        Connect
                      </Button>
                    </form>
                  )}
                  {domainError && (
                    <p role="alert" className="mt-2 text-caption text-critical">
                      {domainError}
                    </p>
                  )}
                </Field>
              </div>
            </TabPanel>
          </Tabs>
        </Card>

        <section aria-label="Live preview" className="xl:sticky xl:top-6 xl:self-start">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-caption font-medium text-content-secondary">
              Live preview{dirty ? ' · unsaved changes' : ''}
            </p>
            <Segmented<'desktop' | 'phone'>
              label="Preview size"
              size="small"
              value={device}
              onChange={setDevice}
              options={[
                {
                  value: 'desktop',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Laptop className="size-3.5" aria-hidden="true" />
                      Desktop
                    </span>
                  ),
                },
                {
                  value: 'phone',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Smartphone className="size-3.5" aria-hidden="true" />
                      Phone
                    </span>
                  ),
                },
              ]}
            />
          </div>
          <div
            className={cn(
              'mx-auto overflow-hidden border border-border-default bg-surface-sunken shadow-elevation-2 transition-[max-width] duration-300',
              device === 'phone'
                ? 'max-w-[390px] rounded-[2rem] border-4'
                : 'max-w-full rounded-2xl',
            )}
          >
            {device === 'desktop' && (
              <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-raised px-4 py-2.5">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-border-default" />
                  <span className="size-2.5 rounded-full bg-border-default" />
                  <span className="size-2.5 rounded-full bg-border-default" />
                </span>
                <span className="mx-auto truncate rounded-md bg-surface-sunken px-3 py-0.5 font-mono text-[11px] text-content-tertiary">
                  {domain.status === 'verified' && domain.domain
                    ? domain.domain
                    : data.store.url.replace(/^https?:\/\//, '')}
                </span>
              </div>
            )}
            {/* The preview is a picture of the store, not a second copy to browse. */}
            <div
              className="h-[min(78dvh,860px)] overflow-y-auto [&_a]:cursor-default"
              inert
              onClickCapture={(e) => {
                e.preventDefault()
              }}
            >
              <StoreShell store={previewStore} basePath="#">
                <StoreHome store={previewStore} products={data.products} basePath="#" />
              </StoreShell>
            </div>
          </div>
          {data.products.length === 0 && (
            <p className="mt-3 text-center text-caption text-content-tertiary">
              Published products appear here. Your store shows an empty state until you publish one.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
