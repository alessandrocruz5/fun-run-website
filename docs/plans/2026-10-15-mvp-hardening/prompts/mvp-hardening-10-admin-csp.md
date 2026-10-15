---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 10
unit: FRW-21
status: done
model: opus
effort: high
depends_on: [09]
parallel_group: A
files:
  create:
    - "apps/admin/src/lib/csp.ts"
    - "apps/admin/src/lib/__tests__/csp.test.ts"
  modify:
    - "apps/admin/proxy.ts"
    - "apps/admin/next.config.ts"
    - "apps/admin/src/lib/auth/__tests__/session.test.ts"
    - "docs/runbook.md"
  delete: []
---
# 10 · Organizer dashboard: nonce CSP and security headers on every response

## Task
Give `apps/admin` the same protection as the public site (prompt 09), with a stricter policy: the dashboard is the clickjacking-sensitive app and loads nothing third-party. `proxy.ts` currently only redirects visitors without a session cookie, and its matcher excludes `/login` and `/api/auth`, so those would get no CSP. Make the proxy set the CSP on every response while keeping the redirect behaviour for dashboard paths exactly as it is.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app `apps/admin`, Next 16.4.0. **High-stakes** (`apps/admin/proxy.ts`, the organizer access gate): read `apps/admin/AGENTS.md`, the CSP guide `apps/admin/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and the proxy convention docs. Prompt 09 just did the same for `apps/web`: read `apps/web/proxy.ts` and `apps/web/src/lib/csp.ts` and mirror their structure (nonce generation, request-header forwarding, `missing` prefetch matcher entries).
- Current `apps/admin/proxy.ts`:
  ```ts
  export function proxy(request: NextRequest) {
    if (getSessionCookie(request)) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }
  export const config = {
    matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
  };
  ```
  Its doc comment: it only redirects; the cookie isn't verified; layout and every data function call `requireSession()`. That stays true.
- New behaviour: (1) the matcher drops `login` and `api/auth` from the exclusion list (keep `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`, and add the guide's prefetch `missing` entries); (2) inside `proxy`: build a nonce and the CSP; if the path is `/login` or starts with `/api/auth`, continue (`NextResponse.next({ request: { headers } })`) with the CSP; otherwise keep the existing cookie check: no cookie → `NextResponse.redirect(new URL("/login", request.url))` (put the CSP on the redirect too, harmless), cookie present → continue with the CSP. Path logic must be exact (`pathname === "/login"` or `pathname === "/api/auth" || pathname.startsWith("/api/auth/")`), never a loose `includes`. The proxy stays pure: no DB, no env reads at import time.
- `apps/admin/src/lib/csp.ts`: `buildCsp(nonce: string, { isDev, upgradeInsecure }: { isDev: boolean; upgradeInsecure: boolean }): string`: `default-src 'self'`; `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` (+ `'unsafe-eval'` only when `isDev`); `style-src 'self' 'unsafe-inline'`; `img-src 'self' blob: data:`; `font-src 'self'`; `connect-src 'self'` (+ dev websockets only if needed); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` (sign-in and sign-out are same-origin server actions; there is no off-site redirect); `frame-ancestors 'none'`; `upgrade-insecure-requests` only when `upgradeInsecure` is true (`proxy.ts` passes `process.env.VERCEL_ENV === "production"`, so `next start` over `http://localhost` in e2e isn't upgraded to https). No third-party origins at all.
- `apps/admin/next.config.ts` (13 lines): keep the `/api/:path*` `no-store` rule exactly; add `{ source: "/:path*", headers: [...] }` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`. Registration reference numbers are in the URL path, so no referrer may leave the origin. **Not `no-referrer`**: a same-origin POST under `no-referrer` carries `Origin: null` (Fetch spec) and Next's Server Action CSRF check rejects it (`node_modules/next/dist/server/app-render/action-handler.js` ~lines 423-436: `originHeader === 'null'` becomes host `"null"`, which never matches the request host), which would break sign-in, the demo button and sign-out. `same-origin` keeps `Origin` on same-origin requests and sends nothing cross-origin. Add a one-line comment in `next.config.ts` saying this, and a test that asserts the value is `same-origin`.
- Tests:
  - New `apps/admin/src/lib/__tests__/csp.test.ts`: as in prompt 09's (nonce in `script-src`, no `unsafe-inline` for scripts, `frame-ancestors 'none'`, `form-action 'self'`, no `https://` origin in the policy, dev-only `unsafe-eval`), plus a `next.config.ts` `headers()` test (both rules).
  - Update `apps/admin/src/lib/auth/__tests__/session.test.ts` `describe("proxy")` (lines 200-218): the `it.each` redirect test for `/`, `/registrations`, `/registrations/RR-7K3QX9TD`, `/registrations/export` stays and must still pass, and now also assert the redirect response carries a CSP. **Replace** the test "leaves /login and the auth API out of its matcher" (it asserts the old exclusion): new assertions: the matcher still excludes `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`; it now matches `/login` and `/api/auth/sign-in/email`; and calling `proxy` on `/login` and on `/api/auth/get-session` **without a cookie returns a pass-through (`x-middleware-next: 1`, status 200), not a redirect**, with a CSP header. Add: with a (forged) session cookie a dashboard path passes through with a CSP (this is the existing "layout redirects a forged cookie" behaviour at line 165: the proxy is not the check). Add: a path such as `/login-evil` or `/api/authx` is **not** treated as public (still redirects without a cookie).
- **Verify in a real browser**: `pnpm --filter @rr/admin build`, then start with dummy env (`DATABASE_URL=postgres://u:p@localhost:5432/db BETTER_AUTH_SECRET=<32+ random chars generated now with openssl> BETTER_AUTH_URL=http://localhost:3001 pnpm --filter @rr/admin start`), open `/login`: the page renders styled with no CSP violations in the console, and `/registrations` redirects to `/login`. (Without a database the login page may error when it looks up a session: if so, note it and rely on `curl -sI` for headers and on prompt 15's smoke test.) Don't print the secret.
- Docs: in the `## Security headers` section prompt 09 added to `docs/runbook.md`, add a sentence for the dashboard (same mechanism in `apps/admin/proxy.ts`, stricter: no third-party origins, `Referrer-Policy: same-origin` and why not `no-referrer`, `form-action 'self'`).
- Review constraints: organizer access (the proxy only redirects; every page and data function still calls `requireSession()`: you must not rely on or weaken that), API responses never cached, secrets stay on the server.
- Scope: the listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Make the proxy verify sessions, touch the database, or change which paths redirect.
- Use `'unsafe-inline'`/`'unsafe-eval'` in production `script-src`.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/admin test
pnpm build
```
- If a database and seeded accounts are available (a local Neon `dev` branch), submit the sign-in form and the demo button in a real browser and confirm sign-in works with the new headers; if not, say it is unverified (owner checklist item 10 is the production gate).
- `curl -sI http://localhost:3001/login | grep -iE 'content-security-policy|referrer-policy'` shows the policy and `same-origin`; `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3001/registrations` prints `307 http://localhost:3001/login`; `curl -sI http://localhost:3001/api/auth/get-session | grep -iE 'cache-control|content-security-policy'` shows both.
