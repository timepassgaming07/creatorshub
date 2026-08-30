'use client'

/**
 * Main Storefront Studio Editor Orchestrator (Item 4.8).
 *
 * Responsibilities:
 * - Tabbed creator customizer: Details, Theme tokens, Domain management.
 * - Real-time synchronized Live Preview frame with responsive device simulation.
 * - Storefront publication lifecycle toggle (draft <-> published).
 * - Multi-tenant isolation and role-based permissions enforcement.
 * - Direct link to visit the public storefront live.
 */
import { useState } from 'react'
import Link from 'next/link'
import type {
  CustomDomainChallenge,
  CustomDomainStatus,
  StorefrontStatus,
  StorefrontTheme,
} from '@creatorhub/contracts'
import { Button, useToast } from '@creatorhub/ui'

import {
  initiateCustomDomainAction,
  removeCustomDomainAction,
  saveStorefrontAction,
  type StorefrontEditorData,
  verifyCustomDomainAction,
} from '../../lib/storefront-actions'
import { DomainSettings } from './DomainSettings'
import { LivePreviewFrame } from './LivePreviewFrame'
import { ThemeCustomizer } from './ThemeCustomizer'

export type EditorTab = 'details' | 'theme' | 'domain'

type StorefrontEditorProps = {
  readonly workspaceId: string
  readonly initialData: StorefrontEditorData
}

export function StorefrontEditor({ workspaceId, initialData }: StorefrontEditorProps) {
  const toast = useToast()

  const [activeTab, setActiveTab] = useState<EditorTab>('details')

  // Core Storefront State
  const [title, setTitle] = useState(initialData.storefront.title)
  const [tagline, setTagline] = useState(initialData.storefront.tagline ?? '')
  const [description, setDescription] = useState(initialData.storefront.description ?? '')
  const [subdomain, setSubdomain] = useState(initialData.storefront.subdomain)
  const [status, setStatus] = useState<StorefrontStatus>(initialData.storefront.status)
  const [themeConfig, setThemeConfig] = useState<StorefrontTheme>(
    initialData.storefront.themeConfig,
  )

  // Custom Domain State
  const [customDomain, setCustomDomain] = useState<string | null>(
    initialData.storefront.customDomain,
  )
  const [customDomainStatus, setCustomDomainStatus] = useState<CustomDomainStatus>(
    initialData.storefront.customDomainStatus,
  )
  const [domainChallenge, setDomainChallenge] = useState<CustomDomainChallenge | null>(
    initialData.domainChallenge,
  )

  // Loading States
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const canManage = initialData.canManage
  const isPublished = status === 'published'

  // Public visit link
  const liveUrl = customDomain ? `/c/${customDomain}` : `/s/${subdomain}`

  const handleSave = async () => {
    if (!canManage) return
    setSaving(true)
    try {
      const res = await saveStorefrontAction(workspaceId, {
        title,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        themeConfig,
      })

      if (!res.success) {
        toast.show({
          title: 'Could not save storefront',
          description: res.error,
          variant: 'critical',
        })
        return
      }

      toast.show({
        title: 'Storefront updated',
        description: 'Your changes have been saved and applied.',
        variant: 'success',
      })
    } catch {
      toast.show({
        title: 'Save failed',
        description: 'An unexpected error occurred while saving.',
        variant: 'critical',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePublish = async () => {
    if (!canManage) return
    setPublishing(true)
    const nextStatus: StorefrontStatus = isPublished ? 'draft' : 'published'

    try {
      const res = await saveStorefrontAction(workspaceId, {
        status: nextStatus,
      })

      if (!res.success) {
        toast.show({
          title: 'Status update failed',
          description: res.error,
          variant: 'critical',
        })
        return
      }

      setStatus(nextStatus)
      toast.show({
        title: nextStatus === 'published' ? 'Storefront published!' : 'Storefront unpublished',
        description:
          nextStatus === 'published'
            ? 'Your store is now live and accepting visitors.'
            : 'Your store is now in draft mode.',
        variant: 'success',
      })
    } catch {
      toast.show({
        title: 'Action failed',
        description: 'Failed to update publication status.',
        variant: 'critical',
      })
    } finally {
      setPublishing(false)
    }
  }

  const handleInitiateDomain = async (domain: string) => {
    const res = await initiateCustomDomainAction(workspaceId, domain)
    if (!res.success) {
      toast.show({
        title: 'Domain setup failed',
        description: res.error,
        variant: 'critical',
      })
      return
    }

    setCustomDomain(domain)
    setCustomDomainStatus('pending')
    setDomainChallenge(res.data.challenge)
    toast.show({
      title: 'Domain connected',
      description: 'DNS challenge generated. Please configure your DNS records.',
      variant: 'info',
    })
  }

  const handleVerifyDomain = async () => {
    const res = await verifyCustomDomainAction(workspaceId)
    if (!res.success) {
      toast.show({
        title: 'DNS Verification Failed',
        description: res.error,
        variant: 'critical',
      })
      setCustomDomainStatus('failed')
      return
    }

    setCustomDomainStatus('verified')
    toast.show({
      title: 'Domain Verified & Active!',
      description: 'Your custom domain is now pointing to your storefront.',
      variant: 'success',
    })
  }

  const handleRemoveDomain = async () => {
    const res = await removeCustomDomainAction(workspaceId)
    if (!res.success) {
      toast.show({
        title: 'Could not disconnect domain',
        description: res.error,
        variant: 'critical',
      })
      return
    }

    setCustomDomain(null)
    setCustomDomainStatus('pending')
    setDomainChallenge(null)
    toast.show({
      title: 'Domain disconnected',
      description: 'Your storefront is now accessible via your subdomain.',
      variant: 'info',
    })
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Breadcrumbs & Title */}
          <div className="flex items-center gap-3">
            <Link
              href={`/workspaces/${workspaceId}`}
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {initialData.workspace.name}
            </Link>
            <span className="text-neutral-400">/</span>
            <h1 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Storefront Studio
            </h1>

            {/* Status Pill */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                isPublished
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isPublished ? 'bg-emerald-500' : 'bg-neutral-400'
                }`}
              />
              {status}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <span>Visit Store</span>
              <svg
                className="h-3.5 w-3.5 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </Link>

            {canManage && (
              <>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void handleTogglePublish()
                  }}
                  disabled={publishing || saving}
                  loading={publishing}
                >
                  {isPublished ? 'Unpublish' : 'Publish Store'}
                </Button>

                <Button
                  variant="primary"
                  size="small"
                  onClick={() => {
                    void handleSave()
                  }}
                  disabled={saving || publishing}
                  loading={saving}
                >
                  Save Changes
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Studio Split Grid */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Customization Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Tab Switcher */}
            <div className="flex rounded-xl bg-neutral-200/60 p-1 dark:bg-neutral-800/80">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('details')
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                  activeTab === 'details'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('theme')
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                  activeTab === 'theme'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                Theme & Style
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('domain')
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                  activeTab === 'domain'
                    ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                Domain
              </button>
            </div>

            {/* Tab Contents */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <label
                      htmlFor="store-title-input"
                      className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      Storefront Title
                    </label>
                    <input
                      id="store-title-input"
                      type="text"
                      value={title}
                      disabled={!canManage}
                      onChange={(e) => {
                        setTitle(e.target.value)
                      }}
                      placeholder="Sarah's Design Studio"
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="store-tagline-input"
                      className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      Tagline
                    </label>
                    <input
                      id="store-tagline-input"
                      type="text"
                      value={tagline}
                      disabled={!canManage}
                      onChange={(e) => {
                        setTagline(e.target.value)
                      }}
                      placeholder="Handcrafted digital courses & design resources"
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="store-description-input"
                      className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      About / Description
                    </label>
                    <textarea
                      id="store-description-input"
                      rows={4}
                      value={description}
                      disabled={!canManage}
                      onChange={(e) => {
                        setDescription(e.target.value)
                      }}
                      placeholder="Welcome to my official digital products catalogue. All purchases include lifetime updates."
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'theme' && (
                <ThemeCustomizer
                  themeConfig={themeConfig}
                  onChange={setThemeConfig}
                  disabled={!canManage}
                />
              )}

              {activeTab === 'domain' && (
                <DomainSettings
                  workspaceId={workspaceId}
                  subdomain={subdomain}
                  onSubdomainChange={setSubdomain}
                  customDomain={customDomain}
                  customDomainStatus={customDomainStatus}
                  domainChallenge={domainChallenge}
                  onInitiateDomain={handleInitiateDomain}
                  onVerifyDomain={handleVerifyDomain}
                  onRemoveDomain={handleRemoveDomain}
                  disabled={!canManage}
                />
              )}
            </div>
          </div>

          {/* Right Column: Live Preview Viewport (7 cols) */}
          <div className="lg:col-span-7 h-[calc(100vh-140px)] sticky top-20">
            <LivePreviewFrame
              title={title}
              tagline={tagline}
              description={description}
              subdomain={subdomain}
              customDomain={customDomain}
              themeConfig={themeConfig}
              products={initialData.products}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
