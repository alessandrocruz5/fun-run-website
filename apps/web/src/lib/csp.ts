/** Cloudflare Turnstile: its script, the iframe it renders and the calls it makes. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The public site's Content-Security-Policy, built per request by `proxy.ts` with a fresh nonce.
 * Next reads the nonce from the request's copy of this header and puts it on its own scripts, and
 * `'strict-dynamic'` lets those scripts load the rest (Turnstile included). A new third-party
 * script, frame or connect origin goes here, with a test.
 *
 * There is no `form-action`: the register action redirects to PayMongo's checkout, and some
 * browsers apply `form-action` to the redirect after a submit too.
 */
export function buildCsp(
  nonce: string,
  { isDev, upgradeInsecure }: { isDev: boolean; upgradeInsecure: boolean },
): string {
  const directives = [
    "default-src 'self'",
    // React's dev build uses eval for its debugging tools; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes from React/Next and the widget's host styles. Scripts are the
    // high-value part of the policy.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${TURNSTILE_ORIGIN}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];
  // Only on Vercel production: `next start` over http://localhost (e2e, CI) must stay on http.
  if (upgradeInsecure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
