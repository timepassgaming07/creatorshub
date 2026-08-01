/**
 * Base ESLint configuration for every package in the workspace.
 *
 * Purpose: make the coding standards mechanical. Every rule here corresponds to
 * a line in docs/engineering/coding-standards.md. If a standard cannot be
 * expressed as a rule, it belongs in review, not here.
 *
 * Type-aware rules are enabled via projectService, which is slower than syntax-only
 * linting but is the only way to catch the failures that actually cost us — unsafe
 * `any` propagation and floating promises around money operations.
 */
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export const ignores = {
  ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
}

export const base = tseslint.config(
  ignores,
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Config files sit outside src/ and so outside every tsconfig include.
          // Without this they have no type information and fail to parse.
          allowDefaultProject: ['*.js', '*.mjs', '*.ts', '*.config.js', '*.config.ts'],
        },
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // --- Banned constructs (coding-standards §1) ---

      // `any` defeats the type system silently. `unknown` plus a guard is the
      // honest alternative and forces the check to be written.
      '@typescript-eslint/no-explicit-any': 'error',

      // A non-null assertion is a claim the compiler cannot verify. If it is
      // true, encode it in the type; if it is not, this is a runtime crash.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // `enum` emits runtime code and has surprising bidirectional mapping.
      // An `as const` object plus a derived union is erasable and simpler.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use an `as const` object and a derived union type instead of `enum`.',
        },
        {
          selector: 'TSModuleDeclaration[kind="namespace"]',
          message: 'Use ES modules instead of namespaces.',
        },
      ],

      // Named exports are greppable and survive rename refactors. Next.js pages
      // and config files re-enable this locally where the framework requires it.
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],

      // --- Correctness ---

      // An unawaited promise in a money operation is a silent partial write.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // Mixing bigint and number in arithmetic throws at runtime. All money is
      // bigint, so this rule guards the money path directly.
      '@typescript-eslint/restrict-plus-operands': 'error',

      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',

      // Errors must be distinguishable at the catch site.
      '@typescript-eslint/only-throw-error': 'error',

      // Silent catch blocks are how failures become mysteries.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // --- Hygiene ---

      // `type` is our default for object shapes. The coding standards call for
      // discriminated unions to make invalid states unrepresentable, and a union
      // cannot be an interface. One consistent keyword beats two.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Tests need latitude the production rules deny: fixtures use non-null
    // assertions on values the test itself just created, and console is useful
    // while debugging a failure.
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.config.ts', '**/*.config.js', '**/*.config.mjs'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  prettier,
)

export default base
