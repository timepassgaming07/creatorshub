/**
 * ESLint configuration for packages that render UI.
 *
 * Extends the base with React, hooks, accessibility, and Next.js rules.
 * Accessibility rules are errors, not warnings: docs/engineering/definition-of-done.md
 * makes accessibility a merge gate, and a warning nobody reads is not a gate.
 */
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import nextPlugin from '@next/eslint-plugin-next'
import prettier from 'eslint-config-prettier'
import { base } from './base.js'

export const react = [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // Accessibility is a merge gate, so these are errors.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'error',

      // Next.js pages, layouts, and route handlers must default-export.
      'no-restricted-exports': 'off',
    },
  },
  prettier,
]

export default react
