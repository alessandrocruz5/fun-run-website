---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 14
unit: FRW-23
status: done
model: sonnet
effort: high
depends_on: [13]
parallel_group: A
files:
  create: ["packages/e2e/tests/web.spec.ts"]
  modify: ["packages/e2e/tests/smoke.spec.ts"]
  delete: []
---
# 14 · Web smoke spec: the review constraints, proven in a real browser

## Task
Write `packages/e2e/tests/web.spec.ts`: Playwright tests against the built public site (`WEB` origin from `tests/origins.ts`, started by `playwright.config.ts` with `SITE_URL` and a dummy webhook secret, **no database, no PayMongo/Turnstile/Resend keys**). Delete `tests/smoke.spec.ts` once `web.spec.ts` covers its two checks (the admin 404 check moves to prompt 15's spec: keep that one assertion alive by leaving the admin half of `smoke.spec.ts` if prompt 15 hasn't run: simplest is to remove only the web half and rename nothing; report what you did).

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Everything it asserts is a Review constraint or a Sprint 3 requirement; each test name should say which. The site: `apps/web/app` (pages `/`, `/privacy`, `/register/success`, `/register/cancelled`, `not-found.tsx`, `api/health`, `api/webhooks/paymongo`), banner text `Fictional event · Test mode, no real payments` (`SITE.testModeNotice`, rendered by `apps/web/src/components/test-mode-banner.tsx` as `<aside aria-label="Test mode">`).
- Without `TURNSTILE_SITE_KEY` the form shows registration as paused (`apps/web/src/components/sections/register.tsx`, `registration-form.tsx`): assert a "paused" message is visible on `/#register` and the pay button is disabled; find the exact copy by reading `registration-form.tsx` (grep `paused`).
- `/register/success` without the `rr_checkout` cookie renders the `not_found` copy: "We can't find your checkout." (`apps/web/app/register/success/page.tsx`), with no DB access (`isCheckoutSessionId(undefined)` is false).
- The webhook route (`apps/web/app/api/webhooks/paymongo/route.ts`): with `PAYMONGO_WEBHOOK_SECRET` set (config sets it) and a missing/bad `Paymongo-Signature`, it answers **401** `{ error: "invalid_signature" }` **before any database access** (no `DATABASE_URL` exists in this run, so a DB touch would be a 500).
- Tests to write (use `@playwright/test`'s `test`, `expect`; one `describe` per concern; a shared `watch(page)` helper inside the file that records `page.on("console")` messages containing `Content Security Policy`/`Refused to` and `page.on("pageerror")`, and asserts both lists are empty at the end of each page test):
  1. **Banner on every page** (`/`, `/privacy`, `/register/success`, `/register/cancelled`, a path that 404s such as `/no-such-page` (status 404)): the banner text is visible.
  2. **CSP**: for each of `/`, `/privacy`: the document response has a `content-security-policy` header with a `nonce-` source and `frame-ancestors 'none'`; no CSP violations or page errors while the page loads and the page is scrolled to the bottom; the nonce differs between two requests.
  3. **Static headers**: `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy` present on `/` and `/privacy`.
  4. **API never cached**: `/api/health` → 200, body `{ status: "ok" }`, `cache-control` contains `no-store`; the webhook POST (no signature) → 401 with `cache-control` containing `no-store` and no CSP requirement.
  5. **Webhook fails closed**: POST with a bogus `Paymongo-Signature: t=1,te=deadbeef` and body `{}` → 401 `{ error: "invalid_signature" }`; GET → 405 or the route's behaviour (assert only what the route does: read the file).
  6. **Form is paused without a Turnstile key**, as above.
  7. **No third-party requests on load** except fonts-free: record `page.on("request")` origins during `/` load and assert every origin is `WEB` (with no `TURNSTILE_SITE_KEY`, the widget script must not load).
  8. **Privacy notice**: `/privacy` shows "Your data is deleted within 7 days" (`SITE.retentionDays` = 7: take the number from the page copy, not from an import of app code: e2e must not import app source).
- Run against a headless Chromium. Don't use `waitForTimeout` (use web-first assertions). Keep each test independent; no ordering.
- Review constraints being proven: banner on every page; `/api/*` never cached; webhook signature checked before the database; secrets stay on the server (the page source and `__NEXT_DATA__`/RSC payload on `/` must not contain `whsk_e2e_dummy_secret`: add that assertion to test 4 or its own test using `page.content()` and a `fetch` of the RSC payload if easy).
- Scope: the listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Import from `apps/*` or `packages/*` source into the specs.
- Weaken an assertion to make it pass: if the app really fails one (a CSP violation, a missing header), stop and report it as a finding for the owning unit.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm e2e
```
- `pnpm e2e` is green; run it twice to check it is not flaky. Report test count and runtime.
