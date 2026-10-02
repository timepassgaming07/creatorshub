'use client'

/**
 * Links Editor — Storefront Studio tab for managing the link-in-bio section.
 *
 * Allows creators to:
 * - Write a bio text
 * - Add/remove social platform links
 * - Add/reorder/remove custom link buttons with optional emoji
 */
import { useState } from 'react'
import {
  SOCIAL_PLATFORMS,
  type CustomLink,
  type SocialLink,
  type SocialPlatform,
  type StorefrontTheme,
} from '@creatorhub/contracts'
import { Button } from '@creatorhub/ui'
import { SocialIcon, PLATFORM_LABELS } from '../storefront/SocialIcons'

type LinksEditorProps = {
  readonly themeConfig: StorefrontTheme
  readonly onChange: (updated: StorefrontTheme) => void
  readonly disabled?: boolean
}

export function LinksEditor({ themeConfig, onChange, disabled = false }: LinksEditorProps) {
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform>('instagram')
  const [newSocialUrl, setNewSocialUrl] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkEmoji, setNewLinkEmoji] = useState('')

  const existingPlatforms = new Set(themeConfig.socialLinks.map((l) => l.platform))
  const availablePlatforms = SOCIAL_PLATFORMS.filter((p) => !existingPlatforms.has(p))

  // --- Social Links Handlers ---

  const handleAddSocial = () => {
    if (!newSocialUrl.trim() || existingPlatforms.has(newSocialPlatform)) return
    try {
      new URL(newSocialUrl)
    } catch {
      return
    }
    const link: SocialLink = { platform: newSocialPlatform, url: newSocialUrl.trim() }
    onChange({
      ...themeConfig,
      socialLinks: [...themeConfig.socialLinks, link],
    })
    setNewSocialUrl('')
    // Move to next available platform
    const next = SOCIAL_PLATFORMS.find((p) => !existingPlatforms.has(p) && p !== newSocialPlatform)
    if (next) setNewSocialPlatform(next)
  }

  const handleRemoveSocial = (platform: SocialPlatform) => {
    onChange({
      ...themeConfig,
      socialLinks: themeConfig.socialLinks.filter((l) => l.platform !== platform),
    })
  }

  // --- Custom Links Handlers ---

  const handleAddCustomLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) return
    try {
      new URL(newLinkUrl)
    } catch {
      return
    }
    const link: CustomLink = {
      label: newLinkLabel.trim(),
      url: newLinkUrl.trim(),
      emoji: newLinkEmoji.trim() || undefined,
    }
    onChange({
      ...themeConfig,
      customLinks: [...themeConfig.customLinks, link],
    })
    setNewLinkLabel('')
    setNewLinkUrl('')
    setNewLinkEmoji('')
  }

  const handleRemoveCustomLink = (index: number) => {
    onChange({
      ...themeConfig,
      customLinks: themeConfig.customLinks.filter((_, i) => i !== index),
    })
  }

  const handleMoveCustomLink = (index: number, direction: 'up' | 'down') => {
    const links = [...themeConfig.customLinks]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= links.length) return
    const temp = links[target]!
    links[target] = links[index]!
    links[index] = temp
    onChange({ ...themeConfig, customLinks: links })
  }

  const inputClasses =
    'block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100'

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="border-b border-neutral-100 pb-3 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Link-in-Bio
        </h2>
        <p className="mt-1 text-xs text-neutral-400">
          Replace Linktree — your bio, socials, and links all on one page
        </p>
      </div>

      {/* Bio */}
      <div>
        <label
          htmlFor="bio-input"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          Bio
        </label>
        <textarea
          id="bio-input"
          rows={3}
          value={themeConfig.bio ?? ''}
          disabled={disabled}
          onChange={(e) => {
            onChange({ ...themeConfig, bio: e.target.value || undefined })
          }}
          placeholder="Creator, designer, and builder. I make tools for the modern internet."
          maxLength={300}
          className={`mt-1.5 ${inputClasses}`}
        />
        <p className="mt-1 text-right text-xs text-neutral-400">
          {(themeConfig.bio ?? '').length}/300
        </p>
      </div>

      {/* Social Links */}
      <div>
        <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Social Links
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">Shown as icon buttons on your page</p>

        {/* Existing social links */}
        {themeConfig.socialLinks.length > 0 && (
          <div className="mt-3 space-y-2">
            {themeConfig.socialLinks.map((link) => (
              <div
                key={link.platform}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              >
                <SocialIcon platform={link.platform} className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {PLATFORM_LABELS[link.platform]}
                </span>
                <span className="flex-1 truncate text-xs text-neutral-400">{link.url}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSocial(link.platform)}
                    className="text-xs font-medium text-red-500 hover:text-red-700"
                    aria-label={`Remove ${PLATFORM_LABELS[link.platform]}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new social link */}
        {!disabled && availablePlatforms.length > 0 && (
          <div className="mt-3 flex gap-2">
            <select
              value={newSocialPlatform}
              onChange={(e) => setNewSocialPlatform(e.target.value as SocialPlatform)}
              className="w-36 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={newSocialUrl}
              onChange={(e) => setNewSocialUrl(e.target.value)}
              placeholder="https://instagram.com/yourhandle"
              className={`flex-1 ${inputClasses}`}
            />
            <Button
              variant="secondary"
              size="small"
              onClick={handleAddSocial}
              disabled={!newSocialUrl.trim()}
            >
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Custom Links */}
      <div>
        <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Custom Links
        </label>
        <p className="mt-0.5 text-xs text-neutral-400">
          Button-style links — newsletter, portfolio, booking, etc.
        </p>

        {/* Existing custom links */}
        {themeConfig.customLinks.length > 0 && (
          <div className="mt-3 space-y-2">
            {themeConfig.customLinks.map((link, i) => (
              <div
                key={`${link.url}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
              >
                {link.emoji && (
                  <span className="text-base" aria-hidden="true">
                    {link.emoji}
                  </span>
                )}
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {link.label}
                </span>
                <span className="flex-1 truncate text-xs text-neutral-400">{link.url}</span>

                {!disabled && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveCustomLink(i, 'up')}
                      disabled={i === 0}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 disabled:opacity-30 dark:hover:bg-neutral-700"
                      aria-label="Move up"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveCustomLink(i, 'down')}
                      disabled={i === themeConfig.customLinks.length - 1}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 disabled:opacity-30 dark:hover:bg-neutral-700"
                      aria-label="Move down"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomLink(i)}
                      className="ml-1 text-xs font-medium text-red-500 hover:text-red-700"
                      aria-label={`Remove ${link.label}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new custom link */}
        {!disabled && themeConfig.customLinks.length < 20 && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newLinkEmoji}
                onChange={(e) => setNewLinkEmoji(e.target.value)}
                placeholder="🔗"
                maxLength={4}
                className="w-14 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-center text-sm dark:border-neutral-700 dark:bg-neutral-900"
                aria-label="Link emoji"
              />
              <input
                type="text"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="My Newsletter"
                maxLength={80}
                className={`flex-1 ${inputClasses}`}
                aria-label="Link label"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://newsletter.example.com"
                className={`flex-1 ${inputClasses}`}
                aria-label="Link URL"
              />
              <Button
                variant="secondary"
                size="small"
                onClick={handleAddCustomLink}
                disabled={!newLinkLabel.trim() || !newLinkUrl.trim()}
              >
                Add Link
              </Button>
            </div>
          </div>
        )}

        {themeConfig.customLinks.length >= 20 && (
          <p className="mt-2 text-xs text-amber-600">Maximum 20 custom links reached.</p>
        )}
      </div>
    </div>
  )
}
