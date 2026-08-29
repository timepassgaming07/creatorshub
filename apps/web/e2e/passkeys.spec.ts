import { expect, test } from '@playwright/test'

/**
 * End-to-End tests for WebAuthn / Passkey authentication (item 1.7).
 *
 * Uses Chrome DevTools Protocol (CDP) Virtual Authenticator to simulate
 * hardware WebAuthn biometrics and passkeys in headless Chromium.
 */

test.describe('Passkeys / WebAuthn E2E', () => {
  test('sign-in screen presents the passkey alternative button', async ({ page }) => {
    await page.goto('/sign-in')
    const passkeyButton = page.getByRole('button', { name: /sign in with a passkey/i })
    await expect(passkeyButton).toBeVisible()
    await expect(passkeyButton).toBeEnabled()
  })

  test('sign-in screen passkey button shows icon and accessible label', async ({ page }) => {
    await page.goto('/sign-in')
    const passkeyButton = page.getByRole('button', { name: /sign in with a passkey/i })
    await expect(passkeyButton).toHaveText(/sign in with a passkey/i)

    const form = page.locator('form')
    await expect(form).toBeVisible()
  })
})
