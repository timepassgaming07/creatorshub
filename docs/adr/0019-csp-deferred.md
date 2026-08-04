# ADR-0019 — Content Security Policy deferred until the real routes exist

**Status:** Accepted
**Date:** 2026-08-04
**Defers implementation-plan item 1.14. Supersedes nothing.**

## Context

security.md §9 requires a nonce-based Content Security Policy with no `unsafe-inline` and
no `unsafe-eval`. Item 1.14 was to deliver it in middleware. The policy builder and the
middleware were written with 21 unit tests, all green, and then the browser gate failed.

Next 16.2.12 does not put a nonce on the inline bootstrap scripts it emits. Eight inline
`<script>` blocks arrive in the HTML and none carries the nonce from the policy.

That matters more than it first sounds. Under `'strict-dynamic'`, conforming browsers
ignore `'self'` and host allowlists in `script-src` entirely. A strict nonce policy
therefore blocks the framework's own scripts: the page renders, because the server-rendered
markup is intact, and then never hydrates. Every header-level assertion passes while the
application is dead.

## What was verified

Each hypothesis was tested against a production build and a real browser rather than
reasoned about. Two were defects in our own code and are fixed. The rest eliminated a
cause.

| Hypothesis | Method | Result |
|---|---|---|
| `node:crypto` works in middleware | `pnpm start` | **Our defect.** Middleware runs on Edge, which has no Node built-ins, so the server would not boot. Fixed with `crypto.getRandomValues` |
| Standard base64 is an acceptable nonce | Read Next's `get-script-nonce-from-header.js` | **Our defect.** Its pattern is `/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/`. A nonce containing `+` or `/` mid-string is rejected, and Next then emits no nonce at all. Fixed with base64url. Affected about one request in three, so it presented as intermittent |
| The policy must reach the request, not only the response | Unit test on the forwarded header | Correct, and now asserted |
| A static route cannot carry a per-request nonce | `curl` against `○ /` | Confirmed: zero nonces |
| A dynamic route can | `force-dynamic`, rebuilt to `ƒ /` | Still zero nonces |
| Turbopack is the cause | `next build --webpack` | Still zero nonces |
| `unsafe-inline` in `script-src` suppresses injection | Removed it and rebuilt | Still zero nonces |

Both of our own defects were invisible to unit tests: the first because Vitest runs in Node
and middleware does not, the second because it depended on random bytes.

## Decision

**Defer 1.14 until 1.11 has shipped the authentication screens.** The policy builder, the
middleware, and their tests stay in the tree, unwired, with both defects fixed.

**The security bar is not negotiable.** Shipping the `unsafe-inline` fallback would
complete the checklist while giving up the property the nonce exists to provide. A control
that looks like protection and is not is worse than a documented gap, because the gap gets
fixed and the illusion does not.

**A hash pipeline is premature.** Hashing the inline bootstrap satisfies §9 with no
`unsafe-inline`, but the hashes change on every build and every Next upgrade. That is a
real build step with real ongoing maintenance, and committing to it before the rendering
model is settled means building it twice.

**The rendering model is not settled.** Today the only page is a placeholder that
prerenders statically. 1.11 adds authenticated routes, which are dynamic by necessity, and
slice 4 adds the storefront, where caching is a performance requirement rather than a
default. Which routes are static is a decision those slices make. Solving CSP against a
placeholder answers a question nobody asked.

## Consequences

**Accepted, and the cost is real**

- No CSP ships until 1.14 closes. Technical debt item 1 stays open, and this record is now
  the reason rather than an oversight.
- The other security headers in `next.config.ts` continue to apply. They are not a
  substitute: none of them stops an injected script.
- `apps/web/src/lib/csp.ts` and `middleware.ts` exist and are tested but are not applied.
  Unreferenced code is normally a smell. Here it is the evidence, and deleting it would
  mean rediscovering both defects later.

**Gained**

- The nonce generator is correct on the runtime that actually runs it, and the regression
  test carries Next's own pattern verbatim, so the base64url requirement cannot be quietly
  undone.
- The policy is a pure function over its directives, so 1.14 resumes at the question that
  is genuinely open rather than at the plumbing.

## When 1.14 resumes

Immediately after 1.11. Re-run the evidence table above against the real authenticated
routes, then choose between the hash pipeline and a bounded, documented concession. The one
outcome ruled out is completing the item by quietly relaxing the requirement.

`Content-Security-Policy-Report-Only` becomes available as an intermediate step once a
route can receive reports, which 1.11 provides. Report-only offers no protection, so it is
a measurement tool rather than a resolution.
