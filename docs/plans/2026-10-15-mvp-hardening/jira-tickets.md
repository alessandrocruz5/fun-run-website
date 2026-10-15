# Jira tickets: Sprint 3 — MVP hardening (project FRW)

Create the Epic first, then the 10 child Tasks under it, in this order. Paste the keys back into the chat
(Epic key, then FRW-15–FRW-24 in order) and `/plan-feature`'s ticket step will write them into the plan, the
prompts and `TASKS.md`.

Plan: `docs/plans/2026-10-15-mvp-hardening/2026-10-15-mvp-hardening.md`. Branch base for every unit: `develop`.
Units merge one at a time, in order.

---

## Epic: Sprint 3 — MVP hardening

Close the committed-secret leak, the open code-guardian findings (FRW-6/7/8/11/12), the stuck confirmation
email, and the missing security headers and error screens. Add a browser smoke suite to CI and a pre-release
checklist for the owner. Ships v0.3.0 when all 10 units merge.

---

## FRW-15 — Remove the committed secret and add secret scanning
**Type:** Task · **Category:** Fixed

`apps/admin/.env.example` holds a non-empty `BETTER_AUTH_SECRET` (commit `c5efb3f`, on `main` and `develop`).
Blank it, add a gitleaks job to CI, add Dependabot, and add a "Secret exposure" section to the runbook.
Owner op, separate from this ticket: rotate `BETTER_AUTH_SECRET` in the admin Vercel project and redeploy.

**Acceptance criteria**
- `apps/admin/.env.example` contains `BETTER_AUTH_SECRET=` with no value.
- `.github/workflows/ci.yml` has a separate `secrets` job (gitleaks) that runs on pull requests and pushes; the `verify` job is unchanged.
- `.github/dependabot.yml` exists (npm and github-actions, weekly).
- `docs/runbook.md` has Incidents → Secret exposure.
- High-stakes: yes (`.github/workflows/**`), so code-guardian review.

**Model: Opus 5.5 · effort high · thinking on**

---

## FRW-16 — Refuse Turnstile test keys in production; one honeypot name
**Type:** Task · **Category:** Fixed

Cloudflare's always-pass dummy keys must not work in production. The honeypot field name `fax_number` moves to
one shared module used by both the form and the server action.

**Acceptance criteria**
- With `VERCEL_ENV=production`, a Turnstile secret matching `^[123]x0{10}` verifies as `unavailable` with no network call, and a site key of that shape reads as unset ("registration is paused"). Outside production they still work.
- `apps/web/src/lib/registration/fields.ts` is the only place the `fax_number` literal lives (apart from tests); a test fails if the form's input name and the server's constant differ.
- `.env.example` and the runbook's Bot protection section say production refuses the test keys.
- High-stakes: yes (`apps/web/src/lib/registration/**`), so code-guardian review.

**Model: Opus 5.5 · effort high · thinking on**

---

## FRW-17 — Admin carry-over fixes
**Type:** Task · **Category:** Fixed

Closes the open FRW-11/12 code-guardian findings in the organizer dashboard.

**Acceptance criteria**
- The owner's CSV writes `+63…` mobiles without a leading `'`; cells starting `= + - @`, tab or CR (other than a plus followed only by digits) are still escaped.
- `GET /registrations/export` answers `413` (plain text, `no-store`, no download) when more than 10,000 rows match, instead of silently truncating.
- Reference links in the list don't prefetch and carry the list's search, filters, sort and page; the detail page's "← Registrations" link restores them.
- A new test fails if the list page or the detail page passes anything other than `session.role` to the masked query.
- High-stakes: yes (a test-only change under `apps/admin/src/lib/auth/**`).

**Model: Sonnet 5.5 · effort high · thinking on**

---

## FRW-18 — Self-healing confirmation email claim
**Type:** Task · **Category:** Fixed

A function killed mid-send leaves a registration marked "sent" with no email. Split the claim from delivery:
migration `0004` adds nullable `confirmation_claimed_at`; `confirmation_sent_at` now means delivered.

**Acceptance criteria**
- Migration `0004` is additive only (`0000`–`0003` untouched); no new grants.
- A claim older than 5 minutes on an unsent paid row whose `paid_at` is under 23 hours old can be re-claimed exactly once; fresh claims and delivered rows can't.
- `confirmation_sent_at` is set only after Resend accepts the send (or reports it already sent).
- The one-email test still passes: concurrent webhook deliveries and success-page loads send once. A failed send still releases the claim and rethrows.
- Dashboard and CSV "email sent" reflect delivery with no admin code change.
- Owner has applied `0004` to Neon `dev` before the preview is checked (and to `main` before the release).
- High-stakes: yes (`packages/db/**`, `apps/web/src/lib/registration/**`), so code-guardian review.

**Model: Opus 5.5 · effort xhigh · thinking on**

---

## FRW-19 — Retention overdue notice
**Type:** Task · **Category:** Added

`/privacy` promises deletion within 7 days, but the weekly reseed is manual. Make a missed reseed visible.

**Acceptance criteria**
- `getOverview` returns `pastRetention`: visitor registrations (any status) older than 7 days, excluding the seed's `+63900000xxxx` demo rows.
- The owner's overview shows a notice when it is above 0; the demo viewer sees nothing.
- No new grant, no write path; the runbook's Demo data section mentions the notice.
- High-stakes: yes (`packages/db/**`), so code-guardian review.

**Model: Opus 5.5 · effort high · thinking on**

---

## FRW-20 — Web security headers and CSP
**Type:** Task · **Category:** Added

New `apps/web/proxy.ts` sets a per-request nonce CSP; `next.config.ts` adds the static security headers.

**Acceptance criteria**
- Every page response has a CSP with a nonce and `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, and Cloudflare Turnstile allowed in script, connect and frame; no `form-action`; `upgrade-insecure-requests` only in production.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` are sent; `/api/*` still sends `Cache-Control: no-store`.
- In a real browser the home page, `/privacy`, `/register/success` and the Turnstile widget load with no CSP violation.
- Runbook has a Security headers section.
- Not a high-stakes glob, but it guards the checkout form: run code-guardian anyway.

**Model: Opus 5.5 · effort high · thinking on**

---

## FRW-21 — Admin security headers and CSP
**Type:** Task · **Category:** Added

Same mechanism for the organizer dashboard, stricter, and applied to `/login` and `/api/auth/*` too.

**Acceptance criteria**
- Every admin response, including `/login` and `/api/auth/*`, carries the nonce CSP (no third-party origins, `form-action 'self'`, `frame-ancestors 'none'`) and `Referrer-Policy: same-origin` (not `no-referrer`: that breaks Server Actions).
- Dashboard paths without a session cookie still redirect (307) to `/login`; the proxy still only redirects, and every page and data function still calls `requireSession()`.
- The proxy matcher test is updated; paths like `/login-evil` are not treated as public.
- No CSP violation on `/login`; sign-in still works in a real browser (or is checked in the owner checklist).
- High-stakes: yes (`apps/admin/proxy.ts`), so code-guardian review.

**Model: Opus 5.5 · effort high · thinking on**

---

## FRW-22 — Safe error screens
**Type:** Task · **Category:** Added

`error.tsx` and `global-error.tsx` for both apps.

**Acceptance criteria**
- Each app has `app/error.tsx` and `app/global-error.tsx`.
- Neither renders the error message or stack (a test uses a message containing an email address); only a digest reference may be shown.
- `global-error` (which replaces the root layout) still shows "Fictional event · Test mode, no real payments".

**Model: Sonnet 5.5 · effort medium · thinking on**

---

## FRW-23 — Browser smoke tests in CI
**Type:** Task · **Category:** Added

New `@rr/e2e` workspace (Playwright, chromium only) that starts both built apps with dummy env and no database.
Depends on FRW-20, FRW-21 and FRW-22.

**Acceptance criteria**
- `pnpm e2e` passes locally after `pnpm build`, twice in a row; `pnpm test` is unaffected (the package has no `test` script).
- Web checks: banner on every page including 404; nonce CSP and static headers; no CSP violations; `/api/health` and the webhook answer with `no-store`; a bad `Paymongo-Signature` returns 401 before any database access; form paused without a Turnstile key; no third-party requests on load.
- Admin checks: dashboard paths redirect to `/login` when signed out; `/login` reachable with banner and CSP; no sign-up or admin endpoints (404); security headers.
- CI `verify` job installs Chromium and runs `pnpm e2e` after `pnpm build`; failure uploads the report; `CLAUDE.md` Commands lists `pnpm e2e`.
- New dev dependency: `@playwright/test` only.
- High-stakes: yes (`.github/workflows/**`), so code-guardian review.

**Model: Opus 5.5 · effort high · thinking on** (the CI prompt; the three test prompts are Sonnet 5.5)

---

## FRW-24 — Pre-release owner checklist
**Type:** Task · **Category:** Added

Docs only: a "Pre-release verification" section in `docs/runbook.md`, between Browser smoke tests and Roll back.

**Acceptance criteria**
- 12 checklist items: secret rotation, GitHub secret scanning and push protection, migration `0004` on Neon, real email, stuck-claim self-heal on `dev`, webhook retry staleness (FRW-6), Turnstile on a phone and real prod keys, CSP console check, Vercel rate-limit rule on `POST /`, dashboard sign-in against Neon (FRW-10), weekly reseed, `ADMIN_URL`.
- No secret values anywhere in the text.

**Model: Haiku 4.5 · effort low · thinking off**
