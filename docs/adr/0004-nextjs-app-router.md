# ADR-0004 — Next.js App Router as the web framework

**Status:** Accepted
**Date:** 2026-07-27

## Context

CreatorHub serves four distinct surfaces from one codebase:

| Surface | Dominant requirement |
|---|---|
| Creator dashboard | Rich interactivity, authenticated, latency-sensitive |
| Buyer storefront | **SEO and first-paint speed**, public, multi-tenant, cache-friendly |
| Affiliate portal | Moderate interactivity, authenticated |
| Marketing site | Static, fast, SEO |

The storefront requirement dominates. A creator's product page is how they get discovered and how
they convert; the manifesto explicitly lists SEO improvements as an AI responsibility, which
presupposes that SEO is a product concern. A client-rendered storefront would undermine the core
value proposition.

## Options considered

### Single-page app + separate API

Clean separation, framework-agnostic API. Rejected: it makes the storefront client-rendered by
default, which is exactly wrong for the surface that matters most. Server-rendering it later means
either a second application or a rewrite.

### Remix / React Router 7

Genuinely good: excellent nested-routing and data-loading model, strong web-standards alignment,
progressive enhancement by default. Rejected narrowly — no React Server Components equivalent, so
more JavaScript ships to the client for equivalent pages, and the surrounding ecosystem for the
things we need (image optimisation, streaming, incremental caching, AI SDK integration) is smaller.
This was the closest call in the stack.

### SvelteKit

Better runtime performance and a smaller bundle, genuinely pleasant. Rejected on ecosystem depth:
we are building a large design system with complex accessible primitives (comboboxes, date
pickers, data tables, command palette). The unstyled accessible primitive ecosystem in React is
substantially more mature, and reimplementing accessible primitives from scratch would consume
budget that belongs to product work. Hiring pool is also materially smaller.

### Astro + separate dashboard app

Best-in-class for the storefront and marketing site. Rejected: it optimises the easy surface and
leaves the dashboard needing a second application, giving us two codebases, two design system
integrations, and two deploys — for a storefront gain that Next.js largely matches.

### Next.js App Router

React Server Components, streaming SSR, per-route caching, one application serving all four
surfaces, mature ecosystem, first-class AI SDK support.

## Decision

**Next.js (App Router)**, one application, four route groups, with hard rules:

1. **Route handlers and Server Actions contain no business logic.** They parse and validate input,
   resolve the tenant, call a domain service, and map the result to a response. If a route file
   contains a business rule, that is a review failure.
2. **Two API styles, one implementation.** Server Actions for dashboard mutations, versioned REST
   under `/api/v1` for webhooks and the future public platform. Both call the same domain service.
   Neither reimplements the other.
3. **No Vercel-proprietary runtime primitives** in application code. See ADR-0014.

## Consequences

**Good**

- Storefronts server-render with minimal client JavaScript, which serves both SEO and the
  manifesto's performance mandate.
- One deploy, one design system instance, one auth integration for all surfaces.
- Server Components remove most client-side data fetching, which removes most client-side state —
  a large source of complexity in dashboards.
- Streaming lets slow panels (analytics) not block fast ones.

**Bad, and accepted**

- The App Router's caching semantics are subtle and have changed across releases. Mitigated by
  being explicit about caching at every boundary rather than relying on defaults, and by
  documenting the caching posture per route group.
- Server Actions are convenient enough to invite business logic. Countered by rule 1 above,
  enforced in review and by a lint rule restricting imports in route files.
- Coupling to a framework with an opinionated release cadence. Mitigated by keeping business logic
  in framework-free packages — `domain` has no Next.js import, so a framework migration touches
  the delivery layer only.
- Vendor gravity toward Vercel. Explicitly addressed in ADR-0014.

## Revisit when

React Server Components ship in a competing framework with a materially better model, or the
framework's release cadence begins costing us more in upgrade work than it returns. The
containment strategy — no framework imports in `domain` — is what keeps this reversible.
