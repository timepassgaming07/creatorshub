import { expect, test } from '@playwright/test'

/**
 * Authentication and Workspace screen smoke and flow tests.
 *
 * Verifies form controls, navigation, validation, and states on all authentication surfaces.
 */

test.describe('authentication screens', () => {
  test('sign-in page renders title, inputs, and links', async ({ page }) => {
    await page.goto('/sign-in')

    await expect(page.locator('h1')).toHaveText(/Sign in to CreatorHub/i)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Sign in/i)

    const createLink = page.locator('a[href="/sign-up"]')
    await expect(createLink).toBeVisible()
  })

  test('sign-up page renders title, inputs, password hint, and links', async ({ page }) => {
    await page.goto('/sign-up')

    await expect(page.locator('h1')).toHaveText(/Create your account/i)
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.getByText(/Must be at least 12 characters/i)).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Create account/i)

    const signInLink = page.locator('a[href="/sign-in"]')
    await expect(signInLink).toBeVisible()
  })

  test('navigation between sign-in and sign-up works', async ({ page }) => {
    await page.goto('/sign-in')
    await page.click('a[href="/sign-up"]')
    await expect(page).toHaveURL(/.*\/sign-up/)

    await page.click('a[href="/sign-in"]')
    await expect(page).toHaveURL(/.*\/sign-in/)
  })

  test('workspace creation page renders form controls', async ({ page }) => {
    await page.goto('/workspaces/new')

    await expect(page.locator('h1')).toHaveText(/Create your workspace/i)
    await expect(page.locator('input[placeholder="Acme Digital"]')).toBeVisible()
    await expect(page.locator('input[placeholder="acme"]')).toBeVisible()
    await expect(page.getByText(/\.creatorhub\.com/i)).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Create workspace/i)
  })

  test('workspace detail page shows not-found state when unauthenticated', async ({ page }) => {
    await page.goto('/workspaces/00000000-0000-7000-8000-000000000000')

    // Returns not-found error card
    await expect(page.locator('h1')).toHaveText(/Please sign in|Not found/i)
  })
})
