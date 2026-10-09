# Riverline Run — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

> Acceptance criteria live in the Jira tickets; `/build-unit` asks for them. Each unit line ends
> with the recommended `model / effort / thinking`; `/build-unit` checks it before starting.

## Sprint 2 — Clearwater organizer dashboard   (planned 2026-10-08) · v0.2.0
Epic: FRW-9 · Branch base: `develop`

**Locked decisions** (approved 2026-10-08 — do not re-litigate)
- Separate `apps/admin`: its own Vercel project (`sin1`) and `*.vercel.app` URL. The public app holds no login secret.
- Login: Better Auth (Drizzle adapter, admin plugin), email + password, no sign-up. A seed script creates two accounts: `owner` (full data) and `viewer` (read-only, masked). The "Explore the organizer demo" button signs in as viewer without showing a password.
- Masking by role happens in the database query layer (`@rr/db/admin`), never only in the UI. Viewer masks email, phone, birthdate and emergency contact.
- Session checked in the admin layout and in every data function; middleware only redirects.
- `rr_admin` database role: SELECT on `registrations`, DML on the auth tables only, no DDL.
- `registrations` is unchanged in this sprint (Sprint 1 already saves method, fee and net). Only additive auth tables.
- Out of scope: refunds / `payment.refunded`, resending email, race-day check-in, slot caps, runner self-service lookup.
- Ships v0.2.0 (MINOR) when all 3 units merge.

**Risks → mitigations** (Architect audit, 2026-10-08)
- Demo viewer sees visitors' real emails → mask in the query result, by role (tested on the returned data, not the HTML).
- Auth checked only in middleware (2025 Next.js middleware bypass) → check in layout + data functions.
- Demo account changes data → viewer is read-only in code; `rr_admin` can only read `registrations` (tested).
- Brute force on the owner login → Better Auth rate limiting, no sign-up endpoint, password-manager password.
- CSV export leaks data or injects formulas → same masked query, login checked on the route itself, cells starting `= + - @` escaped, `no-store`.

**Owner ops (no PR)**
- [ ] Before FRW-10: second Vercel project (root `apps/admin`, `sin1`). After migration `0003`, create `rr_admin_login` in `rr_admin`. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and the demo viewer credentials in that project only. Run `seed:organizers`.
- [ ] Before FRW-11: `ALLOW_DEMO_SEED=1 pnpm --filter @rr/db seed:registrations` against prod (owner URL). Reseed weekly by hand; it also deletes visitor rows.
- [ ] Optional: admin mockups in `docs/design/admin/`; otherwise the dashboard uses the public site's tokens.

- [ ] FRW-10 — Admin app and organizer login · Added · files: apps/admin/{package.json,next.config.ts,tsconfig.json,eslint.config.js,postcss.config.mjs,vercel.json,vitest.config.ts,.env.example,middleware.ts}, apps/admin/app/{layout.tsx,page.tsx,globals.css,login/page.tsx,api/auth/[...all]/route.ts}, apps/admin/src/lib/auth/{server.ts,session.ts,roles.ts,demo-login.ts,__tests__/session.test.ts}, packages/db/src/schema/{auth.ts,index.ts}, packages/db/drizzle/{0002_auth.sql,0003_admin_role.sql,meta/*}, packages/db/src/seed-organizers.ts, packages/db/src/__tests__/grants.test.ts, packages/db/package.json, CLAUDE.md, docs/runbook.md, README.md · depends: FRW-8 (Sprint 1 complete) · model: Opus 5.5 / xhigh / thinking on
- [ ] FRW-11 — Dashboard overview and registrations list · Added · files: packages/db/src/admin/{queries.ts,mask.ts,__tests__/queries.test.ts,__tests__/mask.test.ts}, packages/db/src/seed-registrations.ts, packages/db/package.json, apps/admin/app/{page.tsx,registrations/page.tsx}, apps/admin/src/components/{stat-card,race-breakdown,shirt-sizes,daily-chart,registrations-table,filters,pagination}.tsx, apps/admin/src/lib/{search-params.ts,__tests__/search-params.test.ts} · depends: FRW-10 · model: Opus 5.5 / high / thinking on
- [ ] FRW-12 — Registration detail, CSV export and demo links · Added · files: apps/admin/app/registrations/[reference]/page.tsx, apps/admin/app/registrations/export/route.ts, apps/admin/src/lib/{csv.ts,__tests__/csv.test.ts}, packages/db/src/admin/queries.ts, apps/web/app/register/success/page.tsx, apps/web/src/components/sections/footer.tsx, apps/web/.env.example · depends: FRW-11 · model: Sonnet 5.5 / high / thinking on

## Sprint 1 — Runner site, registration and test payments   (planned 2026-10-08) · v0.1.0
Epic: FRW-1 · Branch base: `develop`

**Locked decisions** (approved 2026-10-08 — do not re-litigate)
- Portfolio only: Riverline Run and Clearwater Collective are fictional. Test data and PayMongo test mode only; every page shows "Fictional event · Test mode, no real payments".
- Stack: pnpm + Turborepo, Next.js (current stable; re-verify, don't copy wedding-website's 15.5 pin), Neon `ap-southeast-1` + Drizzle, PayMongo Hosted Checkout, Resend + React Email, Cloudflare Turnstile, Vercel Hobby `sin1`. Package scope `@rr/*`; layout mirrors wedding-website.
- Packages: `config`, `env`, `db`, `payments`, `email`, `ui` (tokens + Button/Badge, shared with the Sprint 2 admin app). Page sections stay in `apps/web`.
- Races are the `RACES` constant in `@rr/db/races` (5K/10K/21K/42K, price in centavos, gun time). No races table; a price change is a deploy.
- Payment is confirmed only by a server-side checkout-session lookup on the success page or by the signed webhook. Both call one idempotent `confirmPayment()`; URL parameters are never trusted.
- `registrations` saves payment method, fee and net now, so Sprint 2 needs no change to it.
- No slot caps. Form fields: name, email, mobile, birthdate, sex, shirt size, emergency contact name + mobile, consent (mockups override).
- Privacy (RA 10173): `/privacy` notice, required consent with timestamp, no personal data in logs or PayMongo metadata. Weekly reseed deletes all registrations; the notice says data is deleted within 7 days.
- Migrations run as the Neon owner from the laptop; `MIGRATE_DATABASE_URL` is never in Vercel. The build needs no env (WW-21 lesson): `SITE_URL` and secrets are read per request.
- Turnstile ships before email (FRW-7 before FRW-8).
- Ships v0.1.0 (MINOR) when all 7 units merge.

**Risks → mitigations** (Architect audit, 2026-10-08)
- Spoofed `/register/success?ref=…` → status only from the server-side lookup or the signed webhook.
- Vercel protects preview deploys, so PayMongo webhooks to previews get 401 → register the test webhook against the production URL; local dev relies on the success-page lookup.
- Duplicate emails (webhook retries + success page racing) → one-shot claim column, released on send failure, plus Resend idempotency key = registration id.
- Live key deployed → env rejects any PayMongo key not starting `sk_test_`; webhook rejects `livemode: true`.
- Price tampering → server-side price from `RACES`, snapshotted on the row; webhook and lookup check the amount.
- Public form used to email strangers → Turnstile before email; email only after payment.
- Site mistaken for a real event → banner on every page + footer disclaimer.
- Build-time env reads → none; CI builds with no secrets.

**Owner ops (no PR)**
- [ ] Before FRW-2: Vercel project (root `apps/web`, `sin1`) linked to the repo.
- [ ] Before FRW-3: Neon project in `ap-southeast-1` with `main` + `dev` branches. After migration `0001`, create `rr_app_login` in `rr_app`. `DATABASE_URL` (pooled, app role) in Vercel; `MIGRATE_DATABASE_URL` on the laptop only.
- [ ] Before FRW-4: mockup exports in `docs/design/` (or share the Claude Design link).
- [ ] Before FRW-5: PayMongo account → test secret key; `SITE_URL` in Vercel.
- [x] Before FRW-6: PayMongo test-mode webhook → `https://<prod>/api/webhooks/paymongo`, event `checkout_session.payment.paid`; secret in Vercel.
- [ ] Before FRW-7: Turnstile widget → site + secret keys.
- [ ] Before FRW-8: Resend account + verified (sub)domain (SPF/DKIM); `RESEND_API_KEY`, `EMAIL_FROM`.

- [x] FRW-2 — Monorepo scaffold, CI and repo guardrails · Added · files: package.json, pnpm-workspace.yaml, pnpm-lock.yaml, turbo.json, .nvmrc, .npmrc, .editorconfig, eslint.config.mjs, .gitignore, README.md, CLAUDE.md, .github/workflows/ci.yml, docs/runbook.md, packages/config/{package.json,eslint.config.js,prettier.config.js,tsconfig/base.json}, packages/env/{package.json,tsconfig.json,eslint.config.js,src/index.ts,src/__tests__/create-env.test.ts}, apps/web/{package.json,next.config.ts,tsconfig.json,eslint.config.js,postcss.config.mjs,vercel.json,vitest.config.ts,.env.example}, apps/web/app/{layout.tsx,page.tsx,globals.css,api/health/route.ts} · depends: — · model: Sonnet 5.5 / medium / thinking off
  - CLAUDE.md must have `## Project` (`Jira key: FRW`), `## Commands`, `## Review constraints` and `## High-stakes paths`: `/plan-feature` and `/build-unit` read them. `build-unit` and `code-guardian` are global; don't copy them in.
- [x] FRW-3 — Race list, registrations table and payment states · Added · files: packages/db/{package.json,tsconfig.json,eslint.config.js,vitest.config.ts,drizzle.config.ts,.env.example,README.md}, packages/db/src/{index.ts,client.ts,env.ts,races.ts,registrations.ts,schema/index.ts,schema/registrations.ts}, packages/db/drizzle/{0000_init.sql,0001_app_role.sql,meta/*}, packages/db/src/__tests__/{registrations.test.ts,grants.test.ts}, turbo.json, docs/runbook.md · depends: FRW-2 · model: Opus 5.5 / high / thinking on
- [x] FRW-4 — One-page site from the mockups · Added · files: docs/design/*, packages/ui/{package.json,tsconfig.json,eslint.config.js,src/index.ts,src/tokens.css,src/components/*}, apps/web/app/{layout.tsx,page.tsx,globals.css,privacy/page.tsx,opengraph-image.tsx,robots.ts,sitemap.ts,not-found.tsx}, apps/web/src/components/{test-mode-banner.tsx,sections/*.tsx}, apps/web/src/content/site.ts, apps/web/public/**, apps/web/{package.json,next.config.ts} · depends: FRW-3 · model: Opus 5.5 / high / thinking on (merged 2026-10-09) — Landing page, `@rr/ui` (tokens + Button/ButtonLink/Badge), banner on every page, `/privacy` (7-day deletion) and SEO, all reading `RACES` and `SITE_URL` per request; Lighthouse a11y 100, no horizontal scroll at 375/768/1440 (PR #3).
  - Downstream: `SITE_URL` is required from FRW-4 on, not FRW-5. Read it with `getSiteUrl()` in `apps/web/src/content/site.ts`, which is server only: a client component must take its data as props. `#register` (`apps/web/src/components/sections/register.tsx`) is the placeholder FRW-5 replaces with the form. `@rr/ui` tokens are a Tailwind v4 `@theme` with `@source` for its components: the admin app (FRW-10) imports `@rr/ui/tokens.css` after `tailwindcss` and sets the next/font variables `--font-archivo`, `--font-instrument-sans` and `--font-jetbrains-mono`. Sprint 2's demo viewer (masked data) isn't in `/privacy` yet; FRW-11/12 should update the notice. Footer is `apps/web/src/components/sections/footer.tsx` (FRW-12 adds demo links there).
- [x] FRW-5 — Registration form → PayMongo hosted checkout · Added · files: packages/payments/{package.json,tsconfig.json,eslint.config.js,src/index.ts,src/env.ts,src/checkout.ts,src/__tests__/checkout.test.ts,src/__tests__/env.test.ts}, apps/web/src/lib/registration/{schema.ts,actions.ts,confirm.ts,__tests__/actions.test.ts,__tests__/confirm.test.ts}, apps/web/src/components/registration-form.tsx, apps/web/app/page.tsx, apps/web/app/register/{success,cancelled}/page.tsx, apps/web/{package.json,next.config.ts,.env.example}, docs/runbook.md · depends: FRW-3, FRW-4 · model: Opus 5.5 / xhigh / thinking on (merged 2026-10-09) — `@rr/payments` (test keys only), registration form → pending row → PayMongo checkout (metadata `registration_id` only), `/register/success` confirms via `confirmPayment()` from an httpOnly cookie, never the URL; verified in a headless browser on Neon `dev` as `rr_app_login` with card 4343… (PR #4). Production card check waits for the `develop` → `main` release.
  - Downstream: approved scope additions were `sections/register.tsx` (form replaces the placeholder), `globals.css` (form styles) and `privacy/page.tsx` (cookie sentence); `page.tsx` needed no change. FRW-6: after verifying the signature, call `confirmPayment(db, parseCheckoutSession(event.data.attributes.data))` (`apps/web/src/lib/registration/confirm.ts`, `@rr/payments`) and log with `logError()`; add the webhook secret to `paymentsEnvSchema` in `packages/payments/src/env.ts`. The webhook also closes the gap where the `rr_checkout` cookie holds only the latest checkout. FRW-7: `register()` in `actions.ts` is the public endpoint; check Turnstile before `startCheckout()`, and return failures as `RegisterState` (the form wraps the action in `registerOrRetry`, so submitting needs JS). FRW-8: send only when `confirmPayment()` returns `paid`, via `claimConfirmation()`. FRW-12: `register/success/page.tsx` must keep reading no URL parameters.
- [x] FRW-6 — PayMongo webhook · Added · files: packages/payments/src/{webhook.ts,env.ts,__tests__/webhook.test.ts}, apps/web/app/api/webhooks/paymongo/{route.ts,__tests__/route.test.ts}, apps/web/.env.example, docs/runbook.md · depends: FRW-5 · model: Opus 5.5 / xhigh / thinking on (merged 2026-10-09) — `POST /api/webhooks/paymongo` (Node, `no-store`) verifies `Paymongo-Signature` on the raw body before any DB access (hex HMAC-SHA256 of `t.body`, `te` only, `timingSafeEqual`, ±5 min), rejects `livemode`, ignores other events and confirms `checkout_session.payment.paid` through `confirmPayment()`; 63 new tests, local smoke test on `next start` (PR #5). The production check with the tab closed waits for the `develop` → `main` release (runbook → Webhook → End-to-end check).
  - Downstream: approved scope addition was `packages/payments/src/index.ts` (re-exports only). The secret is `PAYMONGO_WEBHOOK_SECRET`, read by `getWebhookEnv()` and kept out of `paymentsEnvSchema` so the form works without it; Vercel Production only. Responses: 401 bad signature, 400 live-mode or unreadable event, 200 `paid`/`ignored`/`rejected`/`unpaid`, 500 env or DB failure (PayMongo retries). `unknown_session` from local/Preview checkouts gets 200 by design. Open: PayMongo doesn't document whether retries are re-signed with a new `t`; if not, retries more than 5 min after the first attempt get 401 `stale`. The production check's resend step answers this, and `SIGNATURE_TOLERANCE_SECONDS` is the one constant to change. FRW-8: the route already holds `confirmPayment()`'s result. Send only on `paid` via `claimConfirmation()`, within PayMongo's 30 s webhook timeout, and decide whether a failed send returns 500 (PayMongo retries) or 200 (success page retries).
- [ ] FRW-7 — Bot protection on the registration form · Added · files: apps/web/src/lib/registration/{turnstile.ts,actions.ts,__tests__/turnstile.test.ts}, apps/web/src/components/registration-form.tsx, apps/web/{.env.example,next.config.ts}, docs/runbook.md · depends: FRW-5 · model: Sonnet 5.5 / high / thinking on
- [ ] FRW-8 — Registration confirmation email · Added · files: packages/email/{package.json,tsconfig.json,eslint.config.js,src/index.ts,src/env.ts,src/send.ts,src/templates/registration-confirmed.tsx,src/__tests__/registration-confirmed.test.tsx,src/__tests__/send.test.ts}, apps/web/src/lib/registration/{confirm.ts,__tests__/confirm.test.ts}, apps/web/{package.json,next.config.ts,.env.example}, docs/runbook.md, README.md · depends: FRW-6, FRW-7 · model: Opus 5.5 / high / thinking on

## Hotfixes
