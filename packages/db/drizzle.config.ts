/**
 * drizzle-kit configuration, for generating migrations only.
 *
 * Generation is a development-time action: `pnpm db:generate` produces SQL that
 * a human reads before it lands (ADR-0005 rule 2). Nothing at runtime reads this
 * file, and `drizzle-kit push` is deliberately not used, because applying a
 * diff straight to a database skips the review step that catches a destructive
 * column rename.
 *
 * The migration role is used here, not the application role. Generation needs to
 * introspect the schema it owns.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_MIGRATION_URL'] ?? '',
  },

  // Fail rather than silently generating a migration that drops a column, which
  // is the one class of change that cannot be undone by running it backwards.
  strict: true,
  verbose: true,
})
