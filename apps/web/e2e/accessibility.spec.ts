import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Automated accessibility checks.
 *
 * These gate every pull request. They are also not sufficient: automated tooling
 * catches roughly half of real accessibility problems, which is why the testing
 * strategy also requires manual screen-reader verification on checkout and
 * product creation before release. This suite catches regressions, not everything.
 *
 * Tagged @a11y so `pnpm test:a11y` can run them alone.
 */

const PAGES = [{ path: '/', name: 'home' }]

for (const page_ of PAGES) {
  test(`${page_.name} has no detectable accessibility violations @a11y`, async ({ page }) => {
    await page.goto(page_.path)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()

    // Report the full violation rather than just a count. A failing run should
    // say which rule broke and on which element, or nobody will fix it quickly.
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })

  test(`${page_.name} passes in dark mode @a11y`, async ({ page }) => {
    // Both themes are verified independently. Dark mode contrast is re-tuned
    // rather than derived, so passing in light says nothing about dark.
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(page_.path)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze()

    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}

test('the skip link is the first thing a keyboard user reaches @a11y', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const focused = page.locator(':focus')
  await expect(focused).toHaveText(/skip to content/i)
})

test('page zoom is not blocked @a11y', async ({ page }) => {
  await page.goto('/')
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')

  // Disabling zoom fails WCAG 1.4.4 and is a common mobile layout mistake.
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/)
  expect(viewport).not.toMatch(/maximum-scale\s*=\s*1\b/)
})
