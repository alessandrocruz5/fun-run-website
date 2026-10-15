---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 09
unit: FRW-20
status: done
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create:
    - "apps/web/src/lib/csp.ts"
    - "apps/web/src/lib/__tests__/csp.test.ts"
    - "apps/web/proxy.ts"
  modify:
    - "apps/web/next.config.ts"
    - "docs/runbook.md"
  delete: []
---
# 09 · Public site: nonce-based Content-Security-Policy and security headers

## Task
`apps/web` sends no CSP and no security headers. Add a per-request nonce CSP (through a new `proxy.ts`) and static security headers (through `next.config.ts`), without breaking the Turnstile widget, the registration form, PayMongo's checkout redirect or `/api/*`'s `no-store`.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Web app `apps/web`, Next **16.4.0** (breaking changes vs. older Next: `middleware` is now `proxy`; `apps/admin/proxy.ts` is the existing example). **Read first:** `apps/web/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (nonces via proxy, `strict-dynamic`, the matcher with `missing` prefetch headers, reading `x-nonce`) and the proxy file-convention doc in the same docs tree. Follow the guide's proxy example for generating the nonce and passing it through the *request* headers (`Content-Security-Policy` and `x-nonce`) so Next applies it to its own scripts, and set the CSP on the *response* too.
- Every public page is already dynamic (`app/layout.tsx` awaits `connection()` in `generateMetadata`; `sections/register.tsx` awaits `connection()`), so nonces cost no static rendering. Do not add `export const dynamic` anywhere.
- Third parties the site uses: Cloudflare Turnstile only (`registration-form.tsx:162` loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` through `next/script`, and the widget renders an iframe and talks to challenges.cloudflare.com). Fonts are `next/font/google` (self-hosted at build time, so `font-src 'self'` is enough). PayMongo is a full-page redirect, not an embed. Images are local (`apps/web/public`, `opengraph-image.tsx`).
- `apps/web/src/lib/csp.ts`: `export function buildCsp(nonce: string, { isDev, upgradeInsecure }: { isDev: boolean; upgradeInsecure: boolean }): string` returning the policy as one line joined with `; `:
  `default-src 'self'`; `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com` (+ `'unsafe-eval'` only when `isDev`); `style-src 'self' 'unsafe-inline'` (React/Next inline style attributes and the widget's host styles; scripts are the high-value part); `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self' https://challenges.cloudflare.com` (+ `ws:`/`wss:` localhost only when `isDev` if Next dev needs them: check by running dev); `frame-src https://challenges.cloudflare.com`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` only when `upgradeInsecure` is true (`proxy.ts` passes `process.env.VERCEL_ENV === "production"`): `next start` over `http://localhost` in e2e and CI must not be upgraded to https. **Do not add `form-action`**: the register action redirects to PayMongo's origin and CSP `form-action` also restricts redirects after a form submit in some browsers.
- `apps/web/proxy.ts`: export `proxy(request: NextRequest)` and `config`. Nonce: `Buffer.from(crypto.randomUUID()).toString("base64")` as in the guide. `isDev = process.env.NODE_ENV === "development"` (this is a per-request read inside the function, not top-level). Matcher: pages only, **not** `/api/*` (those answer JSON; `no-store` is set elsewhere) nor `_next/static`, `_next/image`, `favicon.ico`: `"/((?!api/|_next/static|_next/image|favicon.ico).*)"` plus the guide's `missing` entries for prefetch requests. It must not redirect, rewrite or read cookies.
- `apps/web/next.config.ts` (13 lines): `async headers()` currently returns one rule `{ source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }` with a comment that a header set there overrides the route's own. **Keep that rule exactly.** Add a second rule `{ source: "/:path*", headers: [...] }` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`. Do not set `Cache-Control` or CSP there. (Vercel already sends HSTS on `*.vercel.app`; don't add it.)
- Tests (`apps/web/src/lib/__tests__/csp.test.ts`, Vitest; pattern: `apps/web/src/lib/registration/__tests__/turnstile.test.ts`): `buildCsp` contains the nonce once in `script-src`, has no `unsafe-inline` in `script-src`, no `unsafe-eval` unless `isDev`, `object-src 'none'`, `frame-ancestors 'none'`, Turnstile origin in `script-src`, `connect-src` and `frame-src`, no `form-action`, and `upgrade-insecure-requests` only when `upgradeInsecure` is true. Also test that `next.config.ts`'s `headers()` still returns the `/api/:path*` `no-store` rule and the new security headers (import the config and `await` `headers()`). Test `proxy` with `new NextRequest("http://localhost:3000/")`: the response carries a CSP whose nonce matches the `x-nonce` request header it forwarded (inspect `response.headers` for `x-middleware-request-*` entries, as the admin test does at `apps/admin/src/lib/auth/__tests__/session.test.ts:165`), and two calls get different nonces.
- **Verify in a real browser** (the previous units used headless Firefox; use whatever browser tool you have): `pnpm --filter @rr/web build && SITE_URL=http://localhost:3000 TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm --filter @rr/web start`, open `/`, `/privacy`, `/register/success` and check the console shows **no CSP violation** and the page is interactive (menu, scroll effects, race selector). With the Cloudflare test site key the widget loads from challenges.cloudflare.com: confirm it renders without violations. If no browser is available say so explicitly in your report and list it under what was not checked; prompt 14 adds an automated CSP-violation check.
- Docs: add a short `## Security headers` section to `docs/runbook.md`, after `## Organizer dashboard (apps/admin)` and before `## Roll back` (prompts 10, 16 and 17 add their sections after it, in this order: Security headers → Browser smoke tests (CI) → Pre-release verification): what is sent, that the nonce comes from `apps/web/proxy.ts`, how to read a violation (browser console → `Refused to …`), and that a new third-party script/frame/connect origin must be added to `apps/web/src/lib/csp.ts` (and the tests). Mention the always-pass Turnstile site key `1x…` works only outside production (prompt 02).
- Review constraints: build reads no env (the proxy and `buildCsp` read none at import time), every page still shows the test-mode banner (untouched), `/api/*` sends `no-store` (untouched), secrets stay on the server (nothing added).
- Scope: the listed files only. Do not change any component to add `nonce` props by hand (Next does it from the CSP header).

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Use `'unsafe-inline'` or `'unsafe-eval'` in production `script-src`, or set the CSP in `next.config.ts`.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/web test
pnpm build
```
- With the app started as above: `curl -sI http://localhost:3000/ | grep -i content-security-policy` shows one policy with a nonce; `curl -sI http://localhost:3000/api/health | grep -i cache-control` still prints `no-store` and has no CSP; `curl -sI http://localhost:3000/privacy | grep -iE 'x-content-type-options|referrer-policy|permissions-policy'` prints all three.
- Browser console on `/` has no `Content Security Policy` errors (state how you checked).
