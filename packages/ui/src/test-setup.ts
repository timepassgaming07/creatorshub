/**
 * Adds the jest-dom matchers and cleans the DOM between tests.
 * Loaded by vitest.config.ts before any test file.
 *
 * Cleanup is registered explicitly because this project runs Vitest with
 * `globals: false`. Testing Library's automatic cleanup hooks into a *global*
 * afterEach, which does not exist here — without this, rendered output
 * accumulates and every query that should match one element matches several.
 */
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  cleanup()
})
