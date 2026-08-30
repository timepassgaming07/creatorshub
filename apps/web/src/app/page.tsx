import Link from 'next/link'

/**
 * CreatorHub Landing Page.
 *
 * Modern, high-converting creator platform landing page with a vibrant,
 * clean aesthetic inspired by Stan.store, Lemon Squeezy, Linear, and Whop.
 */

const features = [
  {
    icon: '🏪',
    title: 'Link-in-Bio Storefront',
    description:
      'Your branded digital shop with custom domains, responsive mobile themes, and instant SEO.',
    tag: 'No Code Required',
    color: 'from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-200/60',
    replaces: 'Shopify, Stan.store, Linktree',
  },
  {
    icon: '⚡',
    title: '1-Click UPI & Card Checkout',
    description: 'Accept Google Pay, PhonePe, Paytm, cards, and netbanking. 0% platform lock-in.',
    tag: 'India First (INR)',
    color: 'from-indigo-500/10 to-blue-500/10 text-indigo-600 border-indigo-200/60',
    replaces: 'Razorpay / Stripe dashboards',
  },
  {
    icon: '📦',
    title: 'Digital Downloads & Courses',
    description:
      'Sell eBooks, templates, video masterclasses, and files with automated tamper-proof delivery.',
    tag: 'Instant Access',
    color: 'from-emerald-500/10 to-teal-500/10 text-emerald-600 border-emerald-200/60',
    replaces: 'Gumroad, Lemon Squeezy',
  },
  {
    icon: '📈',
    title: 'Real-Time Sales Analytics',
    description:
      'Track revenue, conversion rates, traffic sources, and UTM attribution without cookies.',
    tag: 'Privacy First',
    color: 'from-purple-500/10 to-pink-500/10 text-purple-600 border-purple-200/60',
    replaces: 'Google Analytics',
  },
  {
    icon: '👥',
    title: 'Audience & Customer CRM',
    description:
      'Manage buyer relationships, issue instant refunds, and track lifetime value in one unified view.',
    tag: 'Full Ownership',
    color: 'from-blue-500/10 to-cyan-500/10 text-blue-600 border-blue-200/60',
    replaces: 'HubSpot, Spreadsheets',
  },
  {
    icon: '🛡️',
    title: 'Enterprise-Grade Security',
    description:
      'Passkey biometric login (FaceID / TouchID), double-entry ledger, and malware-scanned assets.',
    tag: 'Bank Level',
    color: 'from-rose-500/10 to-red-500/10 text-rose-600 border-rose-200/60',
    replaces: 'Auth0, Clerk',
  },
] as const

const toolsReplaced = [
  { name: 'Shopify / Stan.store', cost: '₹2,500 - ₹7,500/mo', category: 'Storefront' },
  { name: 'Gumroad', cost: '10% of every sale', category: 'Digital Goods' },
  { name: 'Payment Gateway Dashboard', cost: 'Manual reconciliation', category: 'Payments' },
  { name: 'Auth0 / Clerk', cost: '₹2,000+/mo', category: 'User Auth' },
  { name: 'Google Drive / Dropbox', cost: '₹1,000/mo', category: 'File Delivery' },
  { name: 'Google Analytics', cost: 'Fragmented & complex', category: 'Analytics' },
  { name: 'FirstPromoter / Rewardful', cost: '₹4,000/mo', category: 'Affiliates' },
  { name: 'Accounting Tools', cost: 'Manual spreadsheets', category: 'Ledger' },
] as const

const creatorProfiles = [
  {
    name: 'Aarav Sharma',
    handle: '@aaravcodes',
    avatar: '👨‍💻',
    title: 'Full-Stack Web Engineering Guide',
    price: '₹1,499',
    sales: '1,240+ copies',
    tag: 'eBook + Code',
  },
  {
    name: 'Priya Mehta',
    handle: '@priyadesigns',
    avatar: '🎨',
    title: 'Figma Design System UI Kit Pro',
    price: '₹2,999',
    sales: '850+ sales',
    tag: 'Figma Assets',
  },
  {
    name: 'Rohan Verma',
    handle: '@rohanfitness',
    avatar: '🏋️‍♂️',
    title: '12-Week Home Workout & Diet Blueprint',
    price: '₹999',
    sales: '3,100+ members',
    tag: 'Video Course',
  },
] as const

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#FBFBFC] text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-2.5 text-center text-xs font-semibold text-white">
        🚀 Slice 5 is Live: Checkout, Dynamic GST Tax Calculation & Razorpay UPI Payments
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 text-base font-black text-white shadow-md shadow-indigo-200">
              C
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-slate-950">CreatorHub</span>
              <span className="text-[10px] font-semibold tracking-wider text-indigo-600 uppercase">
                OS for Creators
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#features" className="transition-colors hover:text-indigo-600">
              Features
            </a>
            <a href="#replaces" className="transition-colors hover:text-indigo-600">
              What It Replaces
            </a>
            <a href="#demo" className="transition-colors hover:text-indigo-600">
              Live Demo
            </a>
            <a href="#pricing" className="transition-colors hover:text-indigo-600">
              Rigor & Architecture
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 active:scale-98 transition-all"
            >
              <span>Get Started</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div className="h-[500px] w-[700px] rounded-full bg-gradient-to-tr from-indigo-200/40 via-purple-200/30 to-pink-200/30 blur-[130px]" />
          </div>

          <div className="mx-auto max-w-5xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              The All-In-One Operating System for Digital Creators
            </div>

            <h1 className="mt-8 text-5xl font-black tracking-tight text-slate-950 sm:text-6xl md:text-7xl leading-[1.08]">
              Turn your expertise into an{' '}
              <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                automated business.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 md:text-xl leading-relaxed">
              Sell eBooks, courses, templates, and digital files. Accept UPI & Cards with 1-click
              checkout, manage customers, and deliver files instantly without juggling 10 different
              tools.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/sign-up"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-98"
              >
                <span>Create Your Free Store</span>
                <span>&rarr;</span>
              </Link>
              <Link
                href="/workspaces/new"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-base font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
              >
                <span>Explore Workspace Dashboard</span>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>Zero Subscription Fees to Start</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>Instant UPI (GPay, PhonePe, Paytm)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>Built-in Indian GST Tax Compliance</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>100% Data & Customer Ownership</span>
              </div>
            </div>
          </div>
        </section>

        {/* Creator Showcase / Interactive Preview */}
        <section id="demo" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-xl shadow-slate-100 sm:p-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  Live Creator Storefronts
                </span>
                <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">
                  What your customers actually see
                </h2>
              </div>
              <p className="text-xs text-slate-500 max-w-xs">
                Ultra-fast, mobile-optimized link-in-bio storefronts engineered for high conversion.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {creatorProfiles.map((creator) => (
                <div
                  key={creator.handle}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition-all hover:-translate-y-1 hover:border-indigo-200 hover:bg-white hover:shadow-lg hover:shadow-indigo-50"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm border border-slate-100">
                        {creator.avatar}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{creator.name}</h3>
                        <p className="text-xs font-medium text-indigo-600">{creator.handle}</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-xl border border-slate-200/70 bg-white p-4">
                      <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase">
                        {creator.tag}
                      </span>
                      <h4 className="mt-2 text-sm font-bold text-slate-900 leading-snug">
                        {creator.title}
                      </h4>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-base font-extrabold text-slate-900">
                          {creator.price}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          {creator.sales}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <Link
                      href="/checkout?productId=018f9e2b-7c5e-7a2e-8c3b-000000000002"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white transition-all group-hover:bg-indigo-600"
                    >
                      <span>Test Live Checkout</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What It Replaces Comparison Table */}
        <section id="replaces" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Stop Paying For 10 Subscriptions
            </span>
            <h2 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
              Replace ₹15,000+/month in software
            </h2>
            <p className="mt-3 text-sm text-slate-600 max-w-xl mx-auto">
              Everything your digital business needs is built into CreatorHub as one unified engine.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {toolsReplaced.map((tool) => (
              <div
                key={tool.name}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-slate-300"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {tool.category}
                </span>
                <h3 className="mt-1 text-base font-bold text-slate-900">{tool.name}</h3>
                <p className="mt-3 text-xs font-semibold text-rose-600 bg-rose-50 rounded-lg px-2.5 py-1 inline-block">
                  {tool.cost}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-1">
            <div className="rounded-[15px] bg-white p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900">
                  CreatorHub Operating System
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  One workspace. One login. Unified double-entry ledger. Zero integration headaches.
                </p>
              </div>
              <Link
                href="/sign-up"
                className="shrink-0 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-600 transition-colors"
              >
                Start Free Today &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Platform Features
            </span>
            <h2 className="mt-2 text-3xl font-black text-slate-950 sm:text-4xl">
              Engineered for seamless digital sales
            </h2>
            <p className="mt-3 text-sm text-slate-600 max-w-xl mx-auto">
              Every component adheres strictly to production-grade domain invariants.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-100"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{feature.icon}</span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${feature.color}`}
                    >
                      {feature.tag}
                    </span>
                  </div>

                  <h3 className="mt-5 text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-400">
                    Replaces:{' '}
                    <span className="font-semibold text-slate-700">{feature.replaces}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Engineering Rigor & Architecture */}
        <section id="pricing" className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-8 text-white sm:p-12">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 border-b border-slate-800 pb-10">
              <div>
                <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Engineered With Rigor
                </span>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Not a prototype. Built for financial integrity.
                </h2>
                <p className="mt-2 text-sm text-slate-400 max-w-xl">
                  CreatorHub is designed from the database up with double-entry accounting, tenant
                  isolation, and strict state machines.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full lg:w-auto">
                <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4 text-center">
                  <p className="text-2xl font-black text-indigo-400">864+</p>
                  <p className="text-[11px] font-medium text-slate-400">Unit Tests</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4 text-center">
                  <p className="text-2xl font-black text-purple-400">302</p>
                  <p className="text-[11px] font-medium text-slate-400">Integration Tests</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4 text-center">
                  <p className="text-2xl font-black text-pink-400">20</p>
                  <p className="text-[11px] font-medium text-slate-400">DB Migrations</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-400">100%</p>
                  <p className="text-[11px] font-medium text-slate-400">Green Build</p>
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Immutable double-entry ledger with balance constraint triggers</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Two-layer multi-tenant isolation with Postgres Row-Level Security</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Indian GST calculation (CGST/SGST/IGST) with zero-float integer math</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Passkeys WebAuthn biometric login with Argon2id fallback</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Direct presigned S3/R2 storage with magic byte MIME inspection</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Transactional outbox event publishing with FOR UPDATE SKIP LOCKED</span>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-10 sm:p-16 shadow-lg shadow-slate-100">
            <h2 className="text-3xl font-black text-slate-950 sm:text-4xl">
              Ready to launch your digital store?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-slate-600 leading-relaxed">
              Create your account in 30 seconds. Publish your first digital product and start
              accepting payments today.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className="w-full sm:w-auto rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all"
              >
                Get Started Free
              </Link>
              <Link
                href="/sign-in"
                className="w-full sm:w-auto rounded-2xl border border-slate-200 bg-white px-7 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Sign In to Account
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            © {new Date().getFullYear()} CreatorHub. The Operating System for Digital Businesses.
          </p>
          <div className="flex items-center gap-6 font-medium">
            <Link href="/sign-in" className="hover:text-indigo-600">
              Sign In
            </Link>
            <Link href="/sign-up" className="hover:text-indigo-600">
              Sign Up
            </Link>
            <Link href="/workspaces/new" className="hover:text-indigo-600">
              Create Workspace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
