/**
 * Link-in-Bio Section (Sprint 1 — replaces Linktree).
 *
 * Renders the creator's bio, social icon row, and custom link buttons
 * on the public storefront page. Designed to be the single page a creator
 * puts in their Instagram / TikTok / YouTube bio.
 */
import type { StorefrontTheme } from '@creatorhub/contracts'
import { SocialIcon } from './SocialIcons'

type LinkInBioSectionProps = {
  readonly theme: StorefrontTheme
  readonly creatorName: string
}

export function LinkInBioSection({ theme, creatorName }: LinkInBioSectionProps) {
  const { bio, socialLinks = [], customLinks = [], accentColor } = theme ?? {}
  const hasSocial = (socialLinks?.length ?? 0) > 0
  const hasLinks = (customLinks?.length ?? 0) > 0
  const hasBio = !!bio?.trim()

  // Nothing to render if no link-in-bio data
  if (!hasSocial && !hasLinks && !hasBio) return null

  return (
    <section
      id="links"
      className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14"
      aria-label={`${creatorName}'s links`}
    >
      {/* Bio */}
      {hasBio && (
        <p className="mx-auto max-w-lg text-center text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          {bio}
        </p>
      )}

      {/* Social Icons Row */}
      {hasSocial && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {socialLinks.map((link) => (
            <a
              key={link.platform}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-sm transition-all duration-200 hover:scale-110 hover:border-transparent hover:shadow-md"
              style={{
                // On hover, the icon gets the accent color background
              }}
              aria-label={link.platform}
            >
              <SocialIcon platform={link.platform} className="h-5 w-5 transition-colors group-hover:text-white" />
              {/* Accent hover overlay */}
              <span
                className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
              {/* Re-render icon on top of overlay for white color */}
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <SocialIcon platform={link.platform} className="h-5 w-5 text-white" />
              </span>
            </a>
          ))}
        </div>
      )}

      {/* Custom Link Buttons */}
      {hasLinks && (
        <div className="mt-8 flex flex-col gap-3">
          {customLinks.map((link, i) => (
            <a
              key={`${link.url}-${i}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-3.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
              style={{
                borderColor: 'transparent',
                background: `linear-gradient(var(--bg-surface), var(--bg-surface)) padding-box, linear-gradient(135deg, ${accentColor}33, ${accentColor}11) border-box`,
              }}
            >
              {link.emoji && (
                <span className="text-base" aria-hidden="true">
                  {link.emoji}
                </span>
              )}
              <span>{link.label}</span>
              <svg
                className="ml-auto h-4 w-4 text-[var(--text-secondary)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
