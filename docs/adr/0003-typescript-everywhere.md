# ADR-0003 — TypeScript across the whole stack

**Status:** Accepted
**Date:** 2026-07-27

## Context

The manifesto forbids choosing technology for popularity and requires evaluation against
maintainability, scalability, performance, security, developer experience, documentation,
community maturity, upgrade path, lock-in, cost, and suitability for an AI-native SaaS.

CreatorHub's workload is: server-rendered public pages, an interactive dashboard, transactional
business logic over a relational database, third-party API orchestration, background jobs, and
LLM API calls. Notably it is **not** numerical computing, not ML training, and not
latency-critical systems programming.

## Options considered

### Python backend + TypeScript frontend

The strongest challenger. Excellent for data work and the richest ecosystem for anything AI-shaped.

Rejected because the AI work here is **calling** models, not training them — an HTTP client
concern, which TypeScript serves equally well. The cost is concrete and permanent: two toolchains,
two dependency managers, two CI paths, two idioms, and — the decisive one — **no shared types
across the network boundary**. Every API response becomes a contract maintained by hand in two
places, or a code-generation pipeline maintained forever. On a system where the types describe
money, that duplication is a defect source.

### Go backend + TypeScript frontend

Better raw performance and excellent concurrency. Rejected for the same shared-types cost, plus
more verbose business logic in a domain that is heavily rule-shaped rather than throughput-shaped.
Our bottleneck will be Postgres and third-party APIs, not application CPU. Go would buy
performance we do not need at the price of type-safety we do need.

### Rust backend

Rejected: development velocity cost is not justified. Nothing here is performance-critical or
memory-constrained enough to warrant it, and the hiring pool for a product engineering team is
thin.

### TypeScript everywhere

One language, shared types from database schema through domain to UI props.

## Decision

**TypeScript, everywhere, in strict mode**, with the strictest practical compiler settings:
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.

Runtime is Node.js LTS. Zod provides validation at every trust boundary, with types inferred from
schemas so runtime validation and static types cannot disagree.

## Consequences

**Good**

- A single type flows from the Drizzle schema through the domain to the React component. A money
  field that changes shape produces a compile error at every affected call site.
- One toolchain, one test runner, one lint configuration, one CI pipeline.
- Server Components let the same language and types render on both sides of the boundary with no
  serialisation contract to maintain.
- Large hiring pool for product engineering.

**Bad, and accepted**

- Node is slower than Go or Rust for CPU-bound work. Irrelevant for this workload; if a genuinely
  CPU-bound need appears, it becomes an isolated service.
- The npm ecosystem has real supply-chain risk. Mitigated by a lockfile, `pnpm` strictness,
  automated dependency review, and a conservative policy on new dependencies (see engineering
  standards).
- TypeScript's type system is unsound at the edges (`any`, assertions). Mitigated by lint rules
  banning both outside explicitly reviewed escape hatches.
- Numeric handling requires discipline. Money is `bigint` minor units throughout, never `number`.
  Enforced by a branded `Money` type in `contracts` that cannot be constructed from a float.

## Amendment, 2026-07-29 — compiler and linter versions

Recorded during slice 0 because the obvious choice is not the right one, and someone will ask.

At scaffold time the latest releases were **TypeScript 7.0.2** (published three weeks earlier, the
native Go port, roughly ten times faster) and **ESLint 10.8.0**. We pinned neither.

| Tool | Latest | Pinned | Reason |
|---|---|---|---|
| TypeScript | 7.0.2 | **6.0.3** | `typescript-eslint@8.65.0` declares `typescript >=4.8.4 <6.1.0`. No release supports TS 7. |
| ESLint | 10.8.0 | **9.39.5** | `eslint-plugin-jsx-a11y@6.10.2` supports ESLint `<=9`. No release supports ESLint 10. |

The reasoning is the same in both cases. This ADR and the coding standards make **typed lint rules
load-bearing**: the bans on `any`, on non-null assertions, on floating promises, and on `enum` are
what turn written standards into a merge gate. Adopting a compiler the linter cannot parse would
trade an enforcement mechanism for a compile-speed improvement on a codebase that is currently one
package. That is a bad trade at any size and an absurd one at this size.

Accessibility makes the ESLint case sharper still. `jsx-a11y` is a gate the definition of done
depends on, and dropping it to run a three-week-old linter major would weaken a commitment the
manifesto treats as mandatory.

Both pins are temporary and cheap to unwind: a version bump plus a lint-config run once the plugins
publish support. TypeScript 7 is a port of the same compiler, not a new language.

**Revisit:** when `typescript-eslint` ships TypeScript 7 support, and when `eslint-plugin-jsx-a11y`
ships ESLint 10 support. Upgrade each independently as it unblocks; neither is coupled to the other.

## Revisit when

A workload appears that is genuinely CPU-bound or requires libraries with no viable JavaScript
equivalent — for example, in-house model inference. The answer then is a separate service in the
right language behind a clear interface, not a rewrite.
