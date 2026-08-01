import { currency, money } from '@creatorhub/contracts'
import { MoneyDisplay } from '@creatorhub/ui'

/**
 * Foundation page.
 *
 * Exists so slice 0 has something to verify end to end: that the design tokens
 * load, that a workspace package renders inside the app, and that the
 * accessibility and performance harnesses have a real page to run against.
 *
 * Replaced by the marketing surface and the dashboard shell in later slices.
 */

const GBP = currency('GBP')

const slices = [
  { id: 0, name: 'Foundation', state: 'In progress' },
  { id: 1, name: 'Identity, workspace, tenancy', state: 'Planned' },
  { id: 2, name: 'Ledger, outbox, idempotency', state: 'Planned' },
  { id: 3, name: 'Catalogue', state: 'Planned' },
] as const

export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex max-w-[45rem] flex-col gap-12 px-6 py-24">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-display text-content-primary">CreatorHub</h1>
        <p className="text-body-lg text-content-secondary">
          The operating system for digital businesses. This repository is at the foundation stage.
        </p>
      </header>

      <section aria-labelledby="money" className="flex flex-col gap-4">
        <h2 id="money" className="font-display text-title text-content-primary">
          Money rendering
        </h2>
        <p className="text-body text-content-secondary">
          Every amount in the product is exact integer minor units, rendered through one primitive.
        </p>
        <dl className="border-border-subtle divide-border-subtle divide-y rounded-md border">
          {[
            { label: 'Positive', value: money(1050n, GBP) },
            { label: 'Zero', value: money(0n, GBP) },
            { label: 'Refund', value: money(-2599n, GBP) },
            { label: 'Beyond float precision', value: money(9_007_199_254_740_993n, GBP) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3">
              <dt className="text-body text-content-secondary">{row.label}</dt>
              <dd>
                <MoneyDisplay value={row.value} locale="en-GB" align="right" />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="progress" className="flex flex-col gap-4">
        <h2 id="progress" className="font-display text-title text-content-primary">
          Delivery
        </h2>
        <ol className="border-border-subtle divide-border-subtle divide-y rounded-md border">
          {slices.map((slice) => (
            <li key={slice.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-body text-content-primary">
                <span className="text-content-tertiary tabular mr-3">{slice.id}</span>
                {slice.name}
              </span>
              <span className="text-caption text-content-tertiary">{slice.state}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
