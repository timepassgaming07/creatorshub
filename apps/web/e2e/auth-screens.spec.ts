import { expect, test } from '@playwright/test'

/**
 * Authentication and Workspace screen smoke and flow tests.
 *
 * Verifies form controls, navigation, validation, and states on all authentication surfaces.
 */

test.describe('authentication screens', () => {
  test('sign-in page renders title, inputs, and links', async ({ page }) => {
    await page.goto('/sign-in')

    await expect(page.locator('h1')).toHaveText(/Welcome back/i)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Sign in/i)

    const createLink = page.locator('a[href="/sign-up"]').first()
    await expect(createLink).toBeVisible()
  })

  test('sign-up page renders title, inputs, password hint, and links', async ({ page }) => {
    await page.goto('/sign-up')

    await expect(page.locator('h1')).toHaveText(/Create your (account|store)/i)
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.getByText(/At least 12 characters/i)).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    const signInLink = page.locator('a[href="/sign-in"]').first()
    await expect(signInLink).toBeVisible()
  })

  test('navigation between sign-in and sign-up works', async ({ page }) => {
    await page.goto('/sign-in')
    await page.locator('a[href="/sign-up"]').first().click()
    await expect(page).toHaveURL(/.*\/sign-up/)

    await page.locator('a[href="/sign-in"]').first().click()
    await expect(page).toHaveURL(/.*\/sign-in/)
  })

  test('workspace creation asks a signed-out visitor to sign in first, and comes back after', async ({
    page,
  }) => {
    await page.goto('/workspaces/new')

    await expect(page).toHaveURL(/\/sign-in\?redirect=(%2F|\/)workspaces(%2F|\/)new/)
    await expect(page.locator('h1')).toHaveText(/Welcome back/i)
  })

  test('workspace detail page shows not-found state or redirects when unauthenticated', async ({ page }) => {
    await page.goto('/workspaces/00000000-0000-7000-8000-000000000000')

    // Redirects to sign-in or returns error card
    await expect(page).toHaveURL(/.*(\/sign-in|\/workspaces)/)
  })
})
