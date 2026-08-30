/**
 * ESLint configuration for the domain layer.
 *
 * The domain holds business rules and nothing else. It declares the interfaces
 * it needs (ports) and never learns how they are implemented. That constraint is
 * what lets us swap a payment provider without touching a pricing rule, and what
 * lets the entire domain be unit tested with no database and no network.
 *
 * The restrictions below are the mechanical form of ADR-0002 and ADR-0007. They
 * exist because "please don't import the database into the domain" is a rule
 * that survives exactly until the first deadline.
 */
import { base } from './base.js'

/** Packages the domain is forbidden to reach for, with the reason it must not. */
const FORBIDDEN = [
  {
    group: ['@creatorhub/db', '@creatorhub/db/*'],
    message:
      'The domain must not import the database. Declare a repository interface in ports.ts and let the composition root supply an implementation.',
  },
  {
    group: [
      '@creatorhub/payments',
      '@creatorhub/payments/*',
      '@creatorhub/storage',
      '@creatorhub/storage/*',
      '@creatorhub/email',
      '@creatorhub/email/*',
      '@creatorhub/ai',
      '@creatorhub/ai/*',
    ],
    message:
      'The domain must not import an adapter. Declare a port in ports.ts; the adapter implements it (ADR-0007).',
  },
  {
    group: ['@creatorhub/ui', '@creatorhub/ui/*'],
    message: 'The domain must not import UI. Business rules do not render.',
  },
  {
    group: ['next', 'next/*', 'react', 'react-dom', 'react/*'],
    message:
      'The domain must not import a framework. It has to stay runnable in a plain unit test (ADR-0002).',
  },
  {
    group: ['drizzle-orm', 'drizzle-orm/*', 'postgres', 'pg'],
    message: 'The domain must not import a database driver. Persistence lives behind a port.',
  },
  {
    group: ['stripe', '@stripe/*', 'razorpay', '@razorpay/*'],
    message:
      'The domain must never name a payment provider. Use the PaymentProvider port (ADR-0007, ADR-0016).',
  },
]

export const domain = [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: FORBIDDEN }],

      // Business rules are pure functions over data. Reaching for the clock or
      // the environment inside one makes it untestable and non-deterministic;
      // pass the value in instead.
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Pass configuration into the domain rather than reading env.' },
        { name: 'fetch', message: 'Network access belongs in an adapter behind a port.' },
      ],
    },
  },
]

export default domain
