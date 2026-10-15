---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 15
unit: FRW-23
status: done
model: sonnet
effort: high
depends_on: [14]
parallel_group: B
files:
  create: ["packages/e2e/tests/admin.spec.ts"]
  modify: ["packages/e2e/tests/smoke.spec.ts"]
  delete: []
---
# 15 · Admin smoke spec: access gate, headers and no sign-up, in a real browser

## Task
Write `packages/e2e/tests/admin.spec.ts` against the built organizer dashboard (`ADMIN` origin from `tests/origins.ts`, started by `playwright.config.ts` with dummy Better Auth env and a **dead** `DATABASE_URL`: the specs must never need a database). Then delete `tests/smoke.spec.ts` (its checks are now covered by `web.spec.ts` and this file).

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app: `apps/admin`. Read `apps/admin/proxy.ts` (after prompt 10: CSP on every response; paths `/login` and `/api/auth/*` pass through; every other path without a Better Auth session cookie redirects 307 to `/login`), `apps/admin/app/api/auth/[...all]/route.ts` (only `GET /get-session`, `POST /sign-in/email` and `POST /sign-out` are forwarded; everything else, including `/sign-up/email`, answers 404 `{ error: "not_found" }` **without touching the database**) and `apps/admin/app/login/page.tsx`.
- **Check first what works without a database.** `LoginPage` calls `getSession()` (`apps/admin/src/lib/auth/session.ts`), which asks Better Auth for a session from the request headers. With no cookie Better Auth should answer null without a query, but verify by running the built app with the config's env: if `/login` returns 500, do not paper over it: limit the browser-level login checks to what renders, report the finding, and keep the header/redirect/404 checks (they need no DB). Never add a DB service to CI for this prompt.
- Tests to write (same `watch(page)` CSP-violation helper idea as prompt 14's `web.spec.ts`: copy the few lines, don't import across spec files unless 14 already exported a helper to `tests/`):
  1. **Dashboard paths redirect when signed out**: `/`, `/registrations`, `/registrations/RR-7K3QX9TD`, `/registrations/export` with `maxRedirects: 0` via `request.get` → 307 and `location` ends with `/login`. A *forged* cookie (`better-auth.session_token=forged.token`) is let through by the proxy (it only checks the cookie's presence), so do **not** assert a redirect for it here: that's covered by the Vitest suite against a real DB.
  2. **Login page**: reachable signed out (status 200, no redirect), the banner text `Fictional event · Test mode, no real payments` is visible, the "Explore the organizer demo" button and the password form exist (names/labels: read `login/page.tsx`); CSP header present with a `nonce-`, `frame-ancestors 'none'`, `form-action 'self'`; no CSP violations or page errors on load (skip this one with a clear reason only if the DB-less check above forces it).
  3. **Headers**: `/login` and `/api/auth/get-session` carry `x-content-type-options: nosniff`, `referrer-policy: same-origin` (not `no-referrer`: that makes same-origin POSTs carry `Origin: null` and Next rejects the Server Actions); `/api/auth/*` responses have `cache-control` containing `no-store`.
  4. **No sign-up**: `POST /api/auth/sign-up/email` with a JSON body → 404 `{ error: "not_found" }`; also `POST /api/auth/admin/create-user` and `GET /api/auth/list-sessions` → 404.
  5. **Not framable**: the `login` response has `content-security-policy` containing `frame-ancestors 'none'` (test 2 covers the header; here, load `ADMIN/login` inside an `<iframe>` of a `data:`/`about:blank` page and assert the frame doesn't render the login form: `page.frameLocator` finds no "Sign in" heading within a short timeout).
  6. **Secrets stay server-side**: the HTML of `/login` does not contain the dummy `BETTER_AUTH_SECRET` value from the config, nor the substring `postgres://`.
- Review constraints being proven: organizer access (the proxy redirects, no sign-up endpoint, the auth route forwards only its allowlist), API responses never cached, secrets stay on the server, banner on every page.
- Scope: the listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Import app source into specs, or weaken an assertion to make it pass (report a real failure instead).

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm e2e
```
- `pnpm e2e` is green twice in a row; `tests/smoke.spec.ts` is gone; report which tests (if any) had to be limited because the login page needs a database.
