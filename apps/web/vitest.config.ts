/**
 * Unit tests for the web app.
 *
 * Node environment, not jsdom, and that is deliberate. Component behaviour is
 * tested in @creatorhub/ui where the components live; what is unique to this
 * package is server-side — route handlers, server actions, metadata. Rendering
 * a composition of already-tested components tells you little that the
 * Playwright suites in e2e/ do not tell you against a real browser.
 *
 * Reaching for jsdom here would mean adding a React plugin and a DOM
 * environment to test nothing that exists.
 *
 * The `@/` alias mirrors tsconfig `paths`, so route handlers that import
 * through it can be loaded by their tests.
 */
import { fileURLToPath } from 'node:url'

import { unitConfig } from '@creatorhub/config/vitest/base'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  unitConfig,
  defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } }),
)
