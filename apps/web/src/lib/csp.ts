/**
 * Content Security Policy, nonce-based.
 *
 * Responsibilities: generate a per-request nonce and build the header value.
 * Dependencies: Web Crypto, which the Edge runtime provides. No Node built-ins,
 * because middleware cannot use them.

 *
 * Kept separate from the middleware that applies it because a policy assembled
 * inline inside a request handler can only be checked by making a request. This
 * way the directives are a value, and the test asserts on the value.
 *
 * security.md §9 requires nonce-based, no `unsafe-inline` on scripts, and no
 * `unsafe-eval`. The point of the nonce is that a script tag the server did not
 * emit cannot execute, which is what makes an injected `<script>` inert rather
 * than merely unexpected. `style-src` is the one place `unsafe-inline` survives,
 * and the reason is stated on the directive itself.
 */

/**
 * 128 bits, base64. The CSP specification asks for at least 128 bits of entropy
 * and a value unguessable per response: a predictable nonce is the same as no
 * nonce, because an injected script can carry it.
 *
 * Two things here were found by running a real browser rather than by reading.
 *
 * `crypto.getRandomValues`, not `node:crypto`: middleware runs on the Edge
 * runtime, which has no Node built-ins. The `node:crypto` version passed every
 * unit test and then failed to boot the server, because Vitest runs in Node and
 * the real thing does not.
 *
 * Base64url, not standard base64. Next matches the nonce out of the header with
 * `/^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/`, and a standard base64 nonce containing
 * `+` or `/` mid-string fails that pattern. When it fails Next emits no nonce at
 * all, so the browser enforces a policy the framework's own inline bootstrap
 * scripts cannot satisfy and the page never hydrates. The header looked perfect
 * throughout. Roughly one nonce in three contains one of those characters, so
 * this failed intermittently, which is the worst way for it to fail.
 *
 * `Math.random` is not an option: it is not a cryptographic source, and a
 * predictable nonce defeats the whole policy.
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
}

export type CspOptions = {
  readonly nonce: string
  /**
   * Relaxes the policy for the dev server only. Next's development build injects
   * eval-based hot reloading, so `unsafe-eval` is unavoidable there. Never set in
   * production, which the test asserts by building both and comparing.
   */
  readonly development?: boolean
  /**
   * Extra origins the browser may send requests to, such as the storage
   * bucket a file is uploaded to directly. Each must be an exact origin.
   */
  readonly connectSources?: readonly string[]
}

/**
 * Razorpay Checkout. checkout.js is loaded by the app's own trusted bundle, so
 * `strict-dynamic` already admits it; the API calls and the payment iframe are
 * named here because those directives have no such propagation.
 */
export const PAYMENT_ORIGINS = {
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
} as const

/**
 * Build the header value.
 *
 * Ordered so the restrictive fallbacks come first and the exceptions follow,
 * because that is the order a reviewer needs to read them in to know what the
 * policy actually permits.
 */

export function buildCsp({ nonce, development = false, connectSources = [] }: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    /**
     * `strict-dynamic` lets a script this policy already trusts load another one,
     * which is how Next's own chunk loading works. Without it every chunk needs
     * its own nonce, which is not possible for scripts the framework injects at
     * runtime.
     *
     * It also causes conforming browsers to ignore host allowlists in this
     * directive, which is the point: an allowlist is the weak part of most real
     * policies, since one permissive CDN entry undoes it.
     */
    "'strict-dynamic'",
    // Browsers that do not support strict-dynamic fall back to these, so the
    // policy degrades to same-origin rather than to nothing.
    "'unsafe-inline'",
    'https:',
    ...(development ? ["'unsafe-eval'"] : []),
  ]

  const directives: readonly (readonly [string, readonly string[]])[] = [
    // Everything not named below falls back to same-origin.
    ['default-src', ["'self'"]],
    // No Flash, no Java, no `<embed>`. Nothing here needs a plugin.
    ['object-src', ["'none'"]],
    // A relative path cannot be rewritten to another origin.
    ['base-uri', ["'self'"]],
    ['script-src', scriptSrc],
    /**
     * Styles carry `unsafe-inline` and this is the one deliberate concession.
     *
     * Tailwind emits a stylesheet, but React inlines style attributes for
     * anything computed at runtime, and Radix positions its popups that way.
     * Removing it would break every dialog and select in the product.
     *
     * The exposure is bounded: CSS injection can restyle and can exfiltrate
     * through a background URL, which is why `default-src 'self'` stays and why
     * this concession is not extended to scripts. Revisit when `style-src-attr`
     * is supported widely enough to allow style attributes while still forbidding
     * inline `<style>` blocks.
     */

    ['style-src', ["'self'", "'unsafe-inline'"]],
    // data: for inlined icons, blob: for a client-side image preview before
    // upload. https: because a creator's storefront shows their own images.
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    // Same origin, the payment provider's API, and any storage bucket the
    // browser uploads to directly. Named origins only; never a scheme.
    ['connect-src', ["'self'", ...PAYMENT_ORIGINS.connect, ...connectSources]],
    // The provider's checkout iframe and nothing else.
    ['frame-src', [...PAYMENT_ORIGINS.frame]],
    // Nothing may frame us. X-Frame-Options says the same to older browsers.
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]],
    // Belt and braces with HSTS, and it covers a stray http:// asset URL that
    // HSTS alone would not.
    ['upgrade-insecure-requests', []],
  ]

  return directives
    .map(([name, values]) => (values.length === 0 ? name : `${name} ${values.join(' ')}`))
    .join('; ')
}
