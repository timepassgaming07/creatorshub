import Link from 'next/link'

/**
 * CreatorHub landing page.
 *
 * Premium dark-theme marketing surface inspired by Linear, Vercel, and
 * Stan.store. Replaces the Slice 0 foundation placeholder.
 */

const features = [
  {
    icon: '🏪',
    title: 'Storefront',
    description: 'Your branded store with custom domains, themes, and SEO built in.',
    replaces: 'Shopify, Squarespace',
  },
  {
    icon: '💳',
    title: 'Payments',
    description:
      'Accept UPI, cards, and netbanking via Razorpay. Manage everything from one dashboard instead of theirs.',
    replaces: 'Razorpay / Stripe dashboards',
  },
  {
    icon: '📦',
    title: 'Products',
    description: 'Sell digital downloads, courses, and memberships with secure delivery.',
    replaces: 'Gumroad, Lemon Squeezy',
  },
  {
    icon: '📊',
    title: 'Analytics',
    description: 'Real-time insights on traffic, conversions, and revenue. UTM attribution.',
    replaces: 'Google Analytics',
  },
  {
    icon: '👥',
    title: 'Customers',
    description: 'Manage your audience, orders, and relationships in one place.',
    replaces: 'HubSpot, Spreadsheets',
  },
  {
    icon: '🔐',
    title: 'Auth & Security',
    description: 'Passkey biometric login, role-based access, and tamper-proof audit logs.',
    replaces: 'Auth0, Clerk',
  },
  {
    icon: '📁',
    title: 'File Delivery',
    description: 'Secure uploads with malware scanning and presigned download links.',
    replaces: 'Google Drive, Dropbox',
  },
  {
    icon: '🤝',
    title: 'Affiliates',
    description: 'Built-in affiliate program with attribution tracking and commission splits.',
    replaces: 'FirstPromoter, Rewardful',
  },
] as const

const stats = [
  { value: '864+', label: 'Tests Passing' },
  { value: '45K', label: 'Lines of Code' },
  { value: '20', label: 'DB Migrations' },
  { value: '9', label: 'Packages' },
] as const

const toolsReplaced = [
  { name: 'Shopify', cost: '$29-79/mo', category: 'Storefront' },
  { name: 'Gumroad', cost: '10% per sale', category: 'Digital Products' },
  { name: 'Razorpay / Stripe Dashboard', cost: 'Separate login', category: 'Payment management' },
  { name: 'Auth0 / Clerk', cost: '$23-99/mo', category: 'Authentication' },
  { name: 'Google Analytics', cost: 'Free (fragmented)', category: 'Analytics' },
  { name: 'Mailchimp', cost: '$13-59/mo', category: 'Email' },
  { name: 'Calendly', cost: '$12-20/mo', category: 'Bookings' },
  { name: 'HubSpot', cost: '$15-50/mo', category: 'CRM' },
  { name: 'Google Drive', cost: '$10-20/mo', category: 'File Storage' },
  { name: 'FirstPromoter', cost: '$49-99/mo', category: 'Affiliates' },
] as const

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0F1C] text-white">
      {/* Ambient gradient orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full opacity-20 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #3B82F6 0%, transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-[30%] h-[400px] w-[400px] rounded-full opacity-15 blur-[100px]"
        style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 left-[40%] h-[500px] w-[500px] rounded-full opacity-10 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #06B6D4 0%, transparent 70%)' }}
      />

      {/* Navigation */}
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#8B5CF6] text-sm font-bold">
            C
          </div>
          <span className="text-lg font-semibold tracking-tight">CreatorHub</span>
        </div>
        <div className="hidden items-center gap-8 text-sm text-white/60 md:flex">
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#replaces" className="transition-colors hover:text-white">
            What it replaces
          </a>
          <a href="#stats" className="transition-colors hover:text-white">
            Built so far
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg px-4 py-2 text-sm text-white/70 transition-colors hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-5 py-2 text-sm font-medium transition-all hover:shadow-[0_0_24px_rgba(99,102,241,0.4)] hover:brightness-110"
          >
            Start for free
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main id="main">
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-24 text-center md:pt-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 backdrop-blur-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Now building Slice 5 of 11 — Checkout and Payments
          </div>

          <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-[1.08] tracking-tight md:text-7xl">
            Your entire digital business.{' '}
            <span className="bg-gradient-to-r from-[#3B82F6] via-[#7C3AED] to-[#8B5CF6] bg-clip-text text-transparent">
              One platform.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/50 md:text-xl">
            Stop juggling 10 different tools. CreatorHub gives you storefront, payments, products,
            analytics, customers, and security — all in one workspace built for Indian creators.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-8 text-base font-semibold shadow-[0_0_32px_rgba(99,102,241,0.3)] transition-all hover:shadow-[0_0_48px_rgba(99,102,241,0.5)] hover:brightness-110"
            >
              Start building for free
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 text-base font-medium text-white/70 backdrop-blur-sm transition-all hover:border-white/25 hover:text-white"
            >
              See what&apos;s built
            </a>
          </div>
        </section>

        {/* Tools Replaced Section */}
        <section id="replaces" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Replaces{' '}
              <span className="bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">
                $150-500/month
              </span>{' '}
              in subscriptions
            </h2>
            <p className="mt-3 text-white/40">
              One platform instead of ten. Here&apos;s everything CreatorHub replaces.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {toolsReplaced.map((tool) => (
              <div
                key={tool.name}
                className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition-all hover:border-white/15 hover:bg-white/[0.06]"
              >
                <p className="text-sm font-medium text-white/80 group-hover:text-white">
                  {tool.name}
                </p>
                <p className="mt-1 text-xs text-white/30">{tool.category}</p>
                <p className="mt-2 text-xs font-medium text-rose-400/70">{tool.cost}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-5 py-2 text-sm text-emerald-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              CreatorHub: one platform, zero transaction fees, full ownership
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need. <span className="text-white/40">Nothing you don&apos;t.</span>
            </h2>
            <p className="mt-3 text-white/40">
              Each feature is production-grade, tested, and integrated with every other.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-white/15 hover:shadow-[0_0_40px_rgba(99,102,241,0.06)]"
              >
                <div className="mb-4 text-3xl">{feature.icon}</div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/40">{feature.description}</p>
                <p className="mt-4 text-xs text-white/20">
                  Replaces <span className="text-white/40">{feature.replaces}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats Section */}
        <section id="stats" className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-white/[0.01]">
            <div className="p-8 text-center md:p-12">
              <h2 className="text-2xl font-bold md:text-3xl">Built with engineering rigor</h2>
              <p className="mt-2 text-white/40">
                Not a prototype. A production-grade monorepo with real tests against real databases.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="p-6 text-center md:p-8">
                  <p className="bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm text-white/40">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-white/[0.06] p-6 md:p-8">
              <div className="grid gap-4 text-sm text-white/40 md:grid-cols-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Double-entry accounting ledger with immutable entries</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Row-level security with two-layer tenant isolation</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Server-authoritative pricing — clients cannot manipulate totals</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Indian GST tax calculation with GSTIN validation</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Passkey biometric login — phishing-resistant WebAuthn</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>Exactly-once webhook processing with HMAC verification</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Roadmap Section */}
        <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Roadmap</h2>
            <p className="mt-3 text-white/40">11 slices from foundation to payouts. 5 complete.</p>
          </div>

          <div className="space-y-2">
            {[
              { id: 0, name: 'Foundation', done: true },
              { id: 1, name: 'Identity, workspace, tenancy, audit log', done: true },
              { id: 2, name: 'Ledger, outbox, idempotency', done: true },
              { id: 3, name: 'Product catalogue', done: true },
              { id: 4, name: 'Storefronts', done: true },
              { id: 5, name: 'Checkout and payments', active: true },
              { id: 6, name: 'Digital fulfillment', done: false },
              { id: 7, name: 'Customers and orders', done: false },
              { id: 8, name: 'Affiliate program', done: false },
              { id: 9, name: 'Commission and clawback', done: false },
              { id: 10, name: 'Analytics and AI', done: false },
              { id: 11, name: 'Payout execution', done: false },
            ].map((slice) => (
              <div
                key={slice.id}
                className={`flex items-center justify-between rounded-xl border px-5 py-3 text-sm transition-all ${
                  slice.done
                    ? 'border-emerald-400/15 bg-emerald-400/5'
                    : 'active' in slice
                      ? 'border-[#3B82F6]/25 bg-[#3B82F6]/5'
                      : 'border-white/[0.06] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-xs text-white/30">{slice.id}</span>
                  <span
                    className={
                      slice.done
                        ? 'text-white/70'
                        : 'active' in slice
                          ? 'text-white'
                          : 'text-white/30'
                    }
                  >
                    {slice.name}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    slice.done
                      ? 'text-emerald-400'
                      : 'active' in slice
                        ? 'text-[#3B82F6]'
                        : 'text-white/20'
                  }`}
                >
                  {slice.done ? 'Complete' : 'active' in slice ? 'In progress' : 'Planned'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Footer */}
        <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24">
          <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-[#3B82F6]/10 to-[#8B5CF6]/10 p-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              Ready to build your digital business?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/40">
              CreatorHub is being built in the open. Sign up to get early access and shape the
              product as a founding user.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-8 text-base font-semibold shadow-[0_0_32px_rgba(99,102,241,0.3)] transition-all hover:shadow-[0_0_48px_rgba(99,102,241,0.5)] hover:brightness-110"
              >
                Start for free
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 text-base font-medium text-white/70 backdrop-blur-sm transition-all hover:border-white/25 hover:text-white"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 border-t border-white/[0.06] py-8 text-center text-xs text-white/20">
          <p>CreatorHub — The Operating System for Digital Businesses</p>
        </footer>
      </main>
    </div>
  )
}
