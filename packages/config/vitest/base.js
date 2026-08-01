/**
 * Shared Vitest configuration.
 *
 * Unit and integration tests are separated by file location rather than by naming
 * convention, so `pnpm test:unit` can stay fast and Docker-free while
 * `pnpm test:integration` runs against a real Postgres.
 */
import { defineConfig } from 'vitest/config'

export const unitConfig = defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    environment: 'node',
    clearMocks: true,
    // A package skeleton with no tests yet must not fail the build. Missing
    // tests on code that exists is caught by coverage and by review, not by
    // this flag.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: ['**/dist/**', '**/*.test.ts', '**/__tests__/**', '**/index.ts'],
    },
  },
})

export const integrationConfig = defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    environment: 'node',
    clearMocks: true,
    // Containers take time to start, and a money-path integration test that
    // fails on a timeout teaches us nothing.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration tests share a database. Running files in parallel would make
    // failures depend on execution order.
    fileParallelism: false,
  },
})

export default unitConfig
