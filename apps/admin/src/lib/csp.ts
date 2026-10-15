/**
 * The dashboard's Content-Security-Policy, built per request by `proxy.ts` with a fresh nonce.
 * Next reads the nonce from the request's copy of this header and puts it on its own scripts, and
 * `'strict-dynamic'` lets those scripts load the rest. Stricter than the public site's: the
 * dashboard loads nothing third-party, so no other origin appears anywhere, and `form-action` is
 * `'self'` because sign-in and sign-out are same-origin server actions that redirect within the app.
 */
export function buildCsp(
  nonce: string,
  { isDev, upgradeInsecure }: { isDev: boolean; upgradeInsecure: boolean },
): string {
  const directives = [
    "default-src 'self'",
    // React's dev build uses eval for its debugging tools; production never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes from React/Next. Scripts are the high-value part of the policy.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Only on Vercel production: `next start` over http://localhost (e2e, CI) must stay on http.
  if (upgradeInsecure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
