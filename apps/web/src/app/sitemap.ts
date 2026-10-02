/**
 * Platform and storefront sitemap generator (Item 4.6).
 */
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://creatorhub.com'
  const currentDate = new Date()

  return [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/sign-in`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/sign-up`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    ...['terms', 'privacy', 'refunds', 'contact'].map((page) => ({
      url: `${baseUrl}/legal/${page}`,
      lastModified: currentDate,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ]
}
