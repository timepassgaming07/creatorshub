/**
 * Multi-tenant robots.txt handler (Item 4.6).
 */
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://creatorhub.com'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/workspaces/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
