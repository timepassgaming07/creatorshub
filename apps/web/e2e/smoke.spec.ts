import { expect, test } from '@playwright/test'

/**
 * Foundation smoke tests.
 *
 * Proves the pieces built in slice 0 actually work together in a production
 * build: the app serves, design tokens load, a workspace package renders, and
 * security headers are applied.
 *
 * The real user journeys from the testing strategy arrive with the slices that
 * implement them.
 */

test('the app serves and renders its heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'CreatorHub' })).toBeVisible()
})

test('health responds without touching downstream dependencies', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toContain('no-store')

  const body = (await response.json()) as { status: string; service: string }
  expect(body.status).toBe('ok')
  expect(body.service).toBe('creatorhub-web')
})

test('security headers are present on every response', async ({ request }) => {
  const headers = (await request.get('/')).headers()

  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  // Next.js advertises itself by default; docs/engineering/security.md says not to.
  expect(headers['x-powered-by']).toBeUndefined()
})

test('design tokens are applied, not just imported', async ({ page }) => {
  await page.goto('/')

  // If tokens failed to load, body would fall back to the user-agent default
  // rather than the surface-base token.
  const background = await page
    .locator('body')
    .evaluate((el) => getComputedStyle(el).backgroundColor)

  expect(background).not.toBe('rgba(0, 0, 0, 0)')
  expect(background).not.toBe('')
})

test('money renders through the shared primitive with exact minor units', async ({ page }) => {
  await page.goto('/')

  // The <data> element carries exact minor units regardless of locale rendering.
  // 9007199254740993 is past float precision; if this reads ...92 rather than
  // ...93, a number crept into the money path somewhere.
  const huge = page.locator('data[value="9007199254740993"]')
  await expect(huge).toBeVisible()
  await expect(huge).toContainText('90,071,992,547,409.93')

  await expect(page.locator('data[value="0"]')).toContainText('£0.00')
  await expect(page.locator('data[value="-2599"]')).toContainText('-£25.99')
})
