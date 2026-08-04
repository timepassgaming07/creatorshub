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

/**
 * Browser APIs jsdom does not implement, which the Radix primitives call.
 *
 * These are stubs, not polyfills, and the distinction matters: they let a
 * component mount so its keyboard and aria behaviour can be tested, and they say
 * nothing about layout. Anything depending on real measurement, which means
 * popup placement and scroll containment, is verified by Playwright against a
 * real browser. Asserting a position from these would be asserting against the
 * stub.
 *
 * Assigned unconditionally. A `typeof x === 'undefined'` guard reads as defensive
 * but is unverifiable: the type says the property exists, so the check is always
 * false to the compiler and the lint rule says so.
 */

/** Does nothing, on purpose. Named so a stack trace says which stub was reached. */
function noop(): void {
  return undefined
}

class ResizeObserverStub implements ResizeObserver {
  observe = noop
  unobserve = noop
  disconnect = noop
}

globalThis.ResizeObserver = ResizeObserverStub

// Radix Select calls these while deciding placement and while driving typeahead.
// jsdom leaves them undefined, and the first Select to open throws.
Element.prototype.hasPointerCapture = (): boolean => false
Element.prototype.setPointerCapture = noop
Element.prototype.releasePointerCapture = noop
Element.prototype.scrollIntoView = noop
