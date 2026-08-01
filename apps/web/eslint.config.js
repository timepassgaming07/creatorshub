import { react } from '@creatorhub/config/eslint/react'

export default [
  ...react,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // The shared base allows loose *.ts config files into the default
          // project, because a library tsconfig only includes src/. This app's
          // tsconfig includes **/*.ts, so next.config.ts and playwright.config.ts
          // are already in the project service — listing them here as well is
          // the error "included by allowDefaultProject but also found in the
          // project service". Only the .js config files need the escape hatch.
          allowDefaultProject: ['*.js', '*.mjs'],
        },
      },
    },
  },
  {
    // The composition root is the one place allowed to know about both the
    // domain and the adapters that satisfy its ports. Everywhere else, the
    // boundary rules in @creatorhub/config/eslint/domain apply.
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    rules: {
      // Next.js requires default exports for pages, layouts, and route handlers.
      'no-restricted-exports': 'off',
    },
  },
]
