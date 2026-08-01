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
 */
export { unitConfig as default } from '@creatorhub/config/vitest/base'
