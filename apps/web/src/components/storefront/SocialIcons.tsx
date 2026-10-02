/**
 * Social platform icon component (Sprint 1 — Link-in-Bio).
 *
 * Renders SVG icons for each supported social platform.
 * Used in both the public storefront and the editor preview.
 */
import type { ReactElement } from 'react'
import type { SocialPlatform } from '@creatorhub/contracts'

type SocialIconProps = {
  readonly platform: SocialPlatform
  readonly className?: string
}

/**
 * Minimal, consistent SVG icons for each social platform.
 * Viewbox is 24×24, stroke-based for crisp rendering at any size.
 */
const ICON_PATHS: Record<SocialPlatform, ReactElement> = {
  instagram: (
    <g>
      <rect x="2" y="2" width="20" height="20" rx="5" strokeWidth="2" fill="none" stroke="currentColor" />
      <circle cx="12" cy="12" r="5" strokeWidth="2" fill="none" stroke="currentColor" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
    </g>
  ),
  youtube: (
    <g>
      <path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 12a29 29 0 00.46 5.58 2.78 2.78 0 001.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 001.94-2A29 29 0 0023 12a29 29 0 00-.46-5.58z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <polygon points="9.75,8.27 15.5,12 9.75,15.73" fill="currentColor" />
    </g>
  ),
  twitter: (
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  tiktok: (
    <path d="M9 12a4 4 0 104 4V4a5 5 0 005 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  ),
  linkedin: (
    <g>
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-4 0v7h-4v-7a6 6 0 016-6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="9" width="4" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),
  github: (
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  discord: (
    <g>
      <path d="M18.59 5.89a15 15 0 00-3.76-1.18.06.06 0 00-.06.03 10.68 10.68 0 00-.47 1 13.86 13.86 0 00-4.6 0 9.83 9.83 0 00-.48-1 .06.06 0 00-.06-.03A14.93 14.93 0 005.4 5.89a.06.06 0 00-.03.02C2.4 10.32 1.63 14.63 2 18.89a.07.07 0 00.03.05 15.1 15.1 0 004.55 2.31.06.06 0 00.07-.02 10.8 10.8 0 00.93-1.52.06.06 0 00-.03-.09 9.94 9.94 0 01-1.42-.69.06.06 0 010-.1c.1-.07.19-.15.28-.22a.06.06 0 01.06-.01 10.77 10.77 0 009.14 0 .06.06 0 01.07.01c.09.08.19.16.28.23a.06.06 0 010 .1 9.32 9.32 0 01-1.42.68.06.06 0 00-.03.09c.27.53.58 1.04.93 1.52a.06.06 0 00.07.02 15.05 15.05 0 004.56-2.31.06.06 0 00.03-.05c.44-4.55-.74-8.83-3.15-12.97a.05.05 0 00-.02-.03z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9.5" cy="13" r="1.25" fill="currentColor" />
      <circle cx="14.5" cy="13" r="1.25" fill="currentColor" />
    </g>
  ),
  telegram: (
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  spotify: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 15c2.5-1 5.5-1 8 .5M7 12c3-1.5 7-1.5 10 .5M6.5 9c3.5-2 8.5-2 12 .5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  twitch: (
    <path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  facebook: (
    <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  ),
  pinterest: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 21.2C9 14 9.5 12 10.5 9c.6-1.8 2-3 3.5-3s2.5 1.2 2 3c-.5 1.8-1.5 4-1.5 5.5 0 1 .7 2 2 2 2.5 0 4-3 4-6.5 0-4-3-6-6.5-6-4 0-7 3-7 6.5 0 1.5.5 3 1.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  dribbble: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72M19.13 5.09C15.22 9.14 10 10.44 2.25 10.94M21.75 12.84c-6.62-1.41-12.14 1-16.38 6.32" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),
  behance: (
    <g>
      <path d="M1 12s3-6 7-6 5 3 5 6-2.5 6-5 6H1V6h6c2 0 4 1.5 4 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12h7a3.5 3.5 0 10-3.5-3.5A3.5 3.5 0 1022 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="15" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),
  website: (
    <g>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitter: 'X / Twitter',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  discord: 'Discord',
  telegram: 'Telegram',
  spotify: 'Spotify',
  twitch: 'Twitch',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
  dribbble: 'Dribbble',
  behance: 'Behance',
  website: 'Website',
}

export function SocialIcon({ platform, className = 'h-5 w-5' }: SocialIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-label={PLATFORM_LABELS[platform]}
    >
      {ICON_PATHS[platform]}
    </svg>
  )
}

export { PLATFORM_LABELS }
