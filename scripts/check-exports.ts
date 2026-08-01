/**
 * Verify that every package's advertised entry points exist after a build.
 *
 * Responsibilities: read each workspace package's `exports`, `main`, and
 * `types`, and confirm the files they name are actually on disk.
 * Dependencies: none beyond Node. Runs after `pnpm build`.
 *
 * This exists because `tsc` exiting zero and a package being importable turned
 * out to be different claims. A `rootDir` widened to bring `scripts/` into the
 * project service moved every emitted file down one directory, so
 * `@creatorhub/db` advertised `dist/index.js` while the build produced
 * `dist/src/index.js`. Typecheck, lint, test, and build were all green. The
 * package was unresolvable.
 *
 * Nothing caught it because nothing imported the package yet. The next work
 * item would have, and the symptom would have arrived as a module resolution
 * error inside unrelated code.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExportProblem = {
  readonly packageName: string
  readonly field: string
  readonly declared: string
  readonly resolved: string
}

type PackageManifest = {
  name?: string
  private?: boolean
  main?: string
  types?: string
  exports?: unknown
  scripts?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Collecting declared entry points
// ---------------------------------------------------------------------------

/**
 * Pull every file path out of an `exports` map.
 *
 * The map is recursive and its shape varies: a string, an object of conditions,
 * or an object of subpaths whose values are any of those. Walking it generically
 * means a package that later adds a `./testing` subpath is checked without this
 * script needing to know about it.
 */
function collectExportPaths(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'string') {
    if (node.startsWith('./')) {
      found.push(node)
    }
    return found
  }

  if (typeof node === 'object' && node !== null) {
    for (const value of Object.values(node)) {
      collectExportPaths(value, found)
    }
  }

  return found
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const WORKSPACE_ROOTS = ['packages', 'apps']

function findPackageDirectories(repositoryRoot: string): string[] {
  return WORKSPACE_ROOTS.flatMap((workspaceRoot) => {
    const absolute = join(repositoryRoot, workspaceRoot)
    if (!existsSync(absolute)) {
      return []
    }

    return readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(absolute, entry.name))
      .filter((directory) => existsSync(join(directory, 'package.json')))
  })
}

function checkPackage(directory: string): ExportProblem[] {
  const manifest = JSON.parse(
    readFileSync(join(directory, 'package.json'), 'utf8'),
  ) as PackageManifest

  const packageName = manifest.name ?? directory

  // A package with no build step emits nothing, so it advertises nothing to
  // verify. `packages/config` is the case: it ships source directly.
  if (manifest.scripts?.['build'] === undefined) {
    return []
  }

  const declared: { field: string; path: string }[] = [
    ...collectExportPaths(manifest.exports).map((path) => ({ field: 'exports', path })),
    ...(manifest.main === undefined ? [] : [{ field: 'main', path: manifest.main }]),
    ...(manifest.types === undefined ? [] : [{ field: 'types', path: manifest.types }]),
  ]

  return declared
    .filter(({ path }) => !existsSync(resolve(directory, path)))
    .map(({ field, path }) => ({
      packageName,
      field,
      declared: path,
      resolved: resolve(directory, path),
    }))
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function formatProblems(problems: ExportProblem[]): string {
  if (problems.length === 0) {
    return 'Export check passed: every advertised entry point exists.'
  }

  const lines = [`Export check failed with ${String(problems.length)} missing entry point(s):`, '']

  for (const problem of problems) {
    lines.push(`  ${problem.packageName} [${problem.field}]`)
    lines.push(`    declares ${problem.declared}`)
    lines.push(`    but ${problem.resolved} does not exist`)
    lines.push('')
  }

  lines.push('Run `pnpm build` first. If it was already run, the build output path and the')
  lines.push('package manifest disagree: check rootDir and outDir in the package tsconfig.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const repositoryRoot = resolve(import.meta.dirname, '..')
const problems = findPackageDirectories(repositoryRoot).flatMap(checkPackage)

process.stdout.write(`${formatProblems(problems)}\n`)

if (problems.length > 0) {
  process.exitCode = 1
}
