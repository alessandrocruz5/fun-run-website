---
type: plan
kind: feature
status: in-progress
repo: fun-run-website
delivery: pr
base: develop
sprint: 3
epic:
created: 2026-10-15
risk: high
prompts: 17
graph_built: none
tags: [plan]
---
# MVP hardening

## Request
> mvp hardening

Scope pinned with the user on 2026-10-15 (one batched round): all four areas (carry-over fixes, web
security hardening, reliability and observability, test and CI safety net), base branch `develop`,
and a final owner-verification checklist unit.

| # | Requirement |
|---|---|
| R1 | Remove the committed auth secret from `apps/admin/.env.example`, stop it recurring (CI secret scan, Dependabot) and document the rotation. |
| R2 | Close the open code-guardian findings in TASKS.md: Turnstile always-pass keys in production (FRW-7), the honeypot field name shared in one place (FRW-7), silent CSV truncation, the `+63` CSV prefix, reference-link prefetch, the detail page's back link (FRW-12), and a test that the pages pass `session.role` to the masked query (FRW-11/12). |
| R3 | A confirmation email that was claimed but never sent (function killed mid-send) recovers by itself, and "email sent" in the dashboard means delivered. |
| R4 | Make the manual 7-day retention visible: the owner's overview says when visitor registrations are past the retention period. |
| R5 | Security headers and a nonce-based Content-Security-Policy on both apps (none exist today). |
| R6 | A failing page shows a safe error screen (no internals, banner still present) instead of Next's default. |
| R7 | A browser smoke suite in CI (Playwright, both apps built with no DB or secrets) that proves the review constraints at runtime. |
| R8 | A pre-release owner checklist in the runbook for everything code can't do (rotation, Vercel rate-limit rule, GitHub secret scanning, live checks). |

## Context used
- Note: `TASKS.md` Sprint 1–2 blocks: Locked decisions (test mode only, build reads no env, roles, masking in the query layer, weekly reseed deletes all registrations) and the `Open:` code-guardian items in the FRW-6/7/8/11/12 Downstream notes. They are the carry-over backlog (R2, R3).
- Note: `CLAUDE.md` Review constraints and High-stakes paths: used to pick models and gates; `apps/admin/proxy.ts`, `.github/workflows/**`, `apps/web/src/lib/registration/**`, `apps/admin/src/lib/auth/**` and `packages/db/**` are all touched.
- Note: `docs/runbook.md` (Email → Stuck claim at 243, Incidents at 374): the manual fix R3 replaces; where the new sections go.
- Note: `apps/web/app/privacy/page.tsx:100-120`: the 7-day promise rests on `seed:registrations` run by hand (R4).
- Code: `git show` on `apps/admin/.env.example` at `c5efb3f` (reached `origin/main` and `origin/develop`): `BETTER_AUTH_SECRET=` holds a non-empty value. Value not printed here. Drives R1.
- Code: `apps/web/src/lib/registration/turnstile.ts:130-210` and `actions.ts:26-58`: where the Turnstile secret is read and the honeypot is checked; `registration-form.tsx:12,396` holds a second literal `fax_number` and imports only types from `schema.ts` (line 10 comment: keep zod out of the browser), so the shared constant needs its own dependency-free module.
- Code: `packages/db/src/registrations.ts:152-180` + `schema/registrations.ts:247`: `claimConfirmation` stamps `confirmation_sent_at` before sending, so "claimed" and "sent" are one column and a killed function leaves a permanent false "sent". Callers: `confirm.ts:116-138` only.
- Code: `apps/admin/app/(dashboard)/registrations/export/route.ts:170-211` (`EXPORT_LIMIT`, `pageSize`, `total` is returned by `listRegistrations` at `queries.ts:275`), `lib/csv.ts:249` (`FORMULA_START` includes `+`), `registrations-table.tsx:36-40` (`ReferenceLink`), `[reference]/page.tsx:71` (back link `LIST_PATH`).
- Code: `packages/db/src/schema/registrations.ts` mobile is always stored `+63` + 10 digits (`schema.ts:19-25`), so `^\+\d+$` can never carry a formula.
- Code: `packages/db/src/seed-registrations.ts:155,189`: demo rows are created across 60 days with mobiles `+63900000dddd`, so a retention check on `created_at` must exclude that pattern (R4).
- Code: `apps/admin/proxy.ts`, `apps/admin/src/lib/auth/__tests__/session.test.ts:200-218`: the proxy matcher excludes `/login` and `/api/auth`, and a test asserts it; the CSP must apply there too (R5).
- Code: `apps/web/app/layout.tsx` (`connection()` in `generateMetadata`) and `sections/register.tsx`: every public page is already dynamic, so a nonce CSP costs no static rendering.
- Docs: `apps/web/node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (Next 16.4.0): nonce via proxy, `strict-dynamic`, dynamic rendering requirement. `apps/admin/AGENTS.md` (untracked): read the bundled Next docs before writing Next code.
- Web: Vercel docs (searched 2026-10-15): Hobby cron runs once a day with loose timing; firewall rate limiting on Hobby is limited (one rule is reported, unconfirmed). Drives the retention and rate-limit decisions.
- Graph: none (`graphify-out/` absent); grep used. Offer to build one with `/graphify` if you want it for later sprints.

## Options
Three decisions had real tradeoffs. The user picked the recommended option each time (2026-10-15).

| Decision | Options | Cost | Risk | Compliance | Chosen |
|---|---|---|---|---|---|
| Retention | A manual + overdue notice · B manual only · C daily Vercel cron purge | A: 1 query + banner · B: 0 · C: new DB role/secret/route | A low · B a missed reseed is silent · C widens DELETE blast radius | A/B rely on you; C removes the human | **A** |
| Stuck email claim | A leave (runbook fix) · B claimed/delivered split + reclaim | A: 0 · B: migration + 3 files + tests | A: a paid runner can get no email, silently · B: touches the payment confirmation path | neither stores new personal data | **B** |
| CSP | A nonce + strict-dynamic · B static `unsafe-inline` | A: proxy + tests · B: one line | A: a wrong policy breaks Turnstile/checkout · B: weak, inline script injection still allowed | n/a | **A** |
| Tests | A Playwright smoke · B fetch script | A: browser in CI (~1 min) · B: none | B can't see CSP violations | n/a | **A** |

**Recommendation:** A, B, A, A, because each is the smallest option that actually closes the risk. **Chosen:** as recommended.

## Decisions
- **Secret leak: rotate, don't rewrite history.** The value is on public-facing branches already; rotation kills it, a force-push on `main` is destructive and doesn't unpublish forks or caches. The rotation is an owner op (see Owner ops below) and must happen before or alongside FRW-15.
- **Claimed vs delivered, new column `confirmation_claimed_at`.** `confirmation_sent_at` keeps its name but now means *delivered* (set only after Resend accepts the send); the new nullable `confirmation_claimed_at` is the claim. A claim older than 5 minutes may be re-claimed while the row is unsent and `paid_at` is under 23 hours old, inside Resend's 24 h idempotency window, so a re-send answers `duplicate` (already handled as sent) and can't double-email. Chosen over a `delivered_at` column because every existing reader of `confirmation_sent_at` (dashboard detail, CSV, seed) becomes correct with no change. Expand-only migration; old stuck rows stay as they are (unknowable) and keep the runbook fix.
- **Reclaim never runs after 23 h.** Past Resend's idempotency window a re-send could double-email; those rows keep the manual fix.
- **Retention check = visitor rows only.** Count `created_at < now() - 7 days` where `mobile !~ '^\+63900000[0-9]{4}$'` (the seed's visibly fake pattern), returned from `getOverview` as an aggregate (`pastRetention`), shown to the owner only. A visitor who types exactly that fake mobile is invisible to it: accepted.
- **CSV export fails loudly past the cap.** `total > EXPORT_LIMIT` returns `413` with a plain-text message instead of a silently short file.
- **CSV phone carve-out.** A cell matching `^\+\d+$` is not given the `'` prefix: it has no letters, so it can't call a function. Everything else keeps the OWASP rule.
- **Turnstile test keys in production.** Any secret or site key matching `^[123]x0{10}` (Cloudflare's dummy keys; real ones start `0x4`) is refused when `VERCEL_ENV === "production"`: the secret reads as `unavailable` (logged by key name only), the site key reads as unset so the form says "paused".
- **Honeypot and Turnstile field names move to `apps/web/src/lib/registration/fields.ts`** (no imports) so the client form and the server action share one literal; `turnstile.ts` re-exports so existing imports keep working.
- **CSP**: `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`. Web also allows `https://challenges.cloudflare.com` in `script-src`, `connect-src` and `frame-src`. `form-action` is left out on the web app because the checkout redirect leaves the origin. Per-app `buildCsp()` (no shared package: the policies differ). Static headers (`nosniff`, `Referrer-Policy`, `Permissions-Policy`) go in each `next.config.ts`.
- **Rate limiting the public form is an owner op** (Vercel Firewall rule on `POST /`, verify the Hobby limit), not code: a Postgres limiter would add a table, grants and a Neon wake-up per request.
- **E2E runs on `next start` of the CI build with dummy env and no database**, the same posture as `pnpm build`. Checks that need a real DB, PayMongo, Resend or Cloudflare stay in the owner checklist.
- **Admin `Referrer-Policy: same-origin`, not `no-referrer`** (audit BLOCK). A same-origin POST under `no-referrer` carries `Origin: null`, which Next's Server Action CSRF check rejects (`action-handler.js:423-436`), breaking sign-in, the demo button and sign-out. `same-origin` still keeps reference numbers in the URL path from leaving the origin. The web app keeps `strict-origin-when-cross-origin`.
- **`upgrade-insecure-requests` only in production** (`VERCEL_ENV === "production"`), so `next start` over http in e2e and CI isn't upgraded.
- **Privacy notice unchanged for `confirmation_claimed_at`**: it is an operational timestamp inside what `/privacy` already lists ("When your confirmation email was sent"). Reviewed in the audit.
- **Migration `0004` must reach Neon `dev` before FRW-18's preview is checked, and `main` before the release** (owner ops below): Preview deploys use `dev`.
- **Units merge in order, one at a time** (FRW-15 → FRW-24): several touch `docs/runbook.md`, `ci.yml` or `session.test.ts`, each in its own section.
- **Opus is used for production code in a high-stakes glob and for CI workflow files; test-only additions in such a glob use Sonnet** (prompt 05).

**Non-goals:**
- Rewriting git history, or a pre-commit hook.
- Automated retention purge, a cron route, or any new DELETE grant.
- A readiness/deep-health endpoint (public, would wake Neon, and leaks which integrations are unset).
- A Postgres rate limiter, `pnpm audit` as a blocking CI step (new advisories would fail unrelated PRs; Dependabot covers it).
- Deleting expired `auth_sessions` outside the weekly reseed.
- A full register→paid browser test (the DB driver is HTTP-only; PGlite integration tests already cover the flow).
- Fixing already-stuck rows, a persistent log sink, Sentry or any new SaaS.
- Anything in `TASKS.md` Owner ops that isn't in the R8 checklist.

## Change list
| File | Action | Why | Req | Prompt |
|---|---|---|---|---|
| `apps/admin/.env.example` | M | Blank the committed secret, say how to generate one | R1 | 01 |
| `.github/workflows/ci.yml` | M | Add a `secrets` job (gitleaks) | R1 | 01 |
| `.github/dependabot.yml` | C | Weekly grouped npm + actions updates | R1 | 01 |
| `docs/runbook.md` | M | Secret exposure runbook (01); admin/web headers (09, 10); overdue notice (08); delivered/claimed email (07); e2e (16); checklist (17) | R1,R3,R4,R5,R7,R8 | 01,07,08,09,10,16,17 |
| `apps/web/src/lib/registration/fields.ts` | C | One home for `HONEYPOT_FIELD` and `TURNSTILE_FIELD` | R2 | 02 |
| `apps/web/src/lib/registration/turnstile.ts` | M | Re-export fields; refuse test keys in production | R2 | 02 |
| `apps/web/src/lib/registration/__tests__/turnstile.test.ts` | M | Cover the production guard | R2 | 02 |
| `apps/web/src/components/registration-form.tsx` | M | Import the shared honeypot name | R2 | 02 |
| `apps/web/src/components/__tests__/registration-form.test.tsx` | C | The rendered form carries the server's honeypot name | R2 | 02 |
| `apps/web/.env.example`, `docs/runbook.md` (Bot protection) | M | One sentence each: production now refuses Cloudflare's test keys | R2 | 02 |
| `apps/admin/src/lib/csv.ts` + `__tests__/csv.test.ts` | M | `+63…` phones keep no `'` | R2 | 03 |
| `apps/admin/app/(dashboard)/registrations/export/route.ts` + its test | M | 413 past `EXPORT_LIMIT` | R2 | 03 |
| `apps/admin/src/lib/search-params.ts` + `__tests__/search-params.test.ts` | M | `detailHref(params, reference)` | R2 | 04 |
| `apps/admin/src/components/registrations-table.tsx` | M | Links carry the list state, `prefetch={false}` | R2 | 04 |
| `apps/admin/app/(dashboard)/registrations/[reference]/page.tsx` | M | Back link restores the list state | R2 | 04 |
| `apps/admin/src/lib/auth/__tests__/role-passthrough.test.ts` | C | Pages pass `session.role`, not a literal | R2 | 05 |
| `packages/db/drizzle/0004_confirmation_claim.sql`, `meta/_journal.json`, `meta/0004_snapshot.json` | C/M | Add `confirmation_claimed_at` (expand only) | R3 | 06 |
| `packages/db/src/schema/registrations.ts` | M | The new column | R3 | 06 |
| `packages/db/src/registrations.ts` | M | `claimConfirmation` reclaim rule, `markConfirmationSent`, `releaseConfirmation` | R3 | 06 |
| `packages/db/src/__tests__/registrations.test.ts` | M | Claim, reclaim, release, delivered tests | R3 | 06 |
| `packages/db/src/__tests__/grants.test.ts` | M | Applied-migration count 4 → 5 (added at build, user-approved; FRW-10 bumped the same line for `0003`) | R3 | 06 |
| `apps/web/src/lib/registration/__tests__/confirm.test.ts`, `apps/web/app/api/webhooks/paymongo/__tests__/route.test.ts`, `apps/web/src/lib/registration/__tests__/actions.test.ts` | M | Fixtures typed `Registration` need `confirmationClaimedAt: null` so typecheck stays green after 06 (07 edits the same files for behaviour) | R3 | 06, 07 |
| `apps/web/src/lib/registration/confirm.ts` + `__tests__/confirm.test.ts` | M | Mark delivered after the send; keep one-email guarantee | R3 | 07 |
| `apps/web/app/api/webhooks/paymongo/__tests__/route.test.ts`, `apps/web/src/lib/registration/__tests__/actions.test.ts`, `packages/db/README.md` | M | Both tests mock `@rr/db`'s claim functions and need `markConfirmationSent`; README documents the functions | R3 | 07 |
| `packages/db/src/admin/queries.ts` + `__tests__/queries.test.ts` | M | `RETENTION_DAYS`, `pastRetention` in `getOverview` | R4 | 08 |
| `apps/admin/app/(dashboard)/page.tsx` | M | Owner-only overdue notice | R4 | 08 |
| `apps/web/src/lib/csp.ts` + `__tests__/csp.test.ts` | C | `buildCsp(nonce, isDev)` | R5 | 09 |
| `apps/web/proxy.ts` | C | Nonce + CSP on page responses | R5 | 09 |
| `apps/web/next.config.ts` | M | Static security headers | R5 | 09 |
| `apps/admin/src/lib/csp.ts` + `__tests__/csp.test.ts` | C | `buildCsp(nonce, isDev)` | R5 | 10 |
| `apps/admin/proxy.ts` | M | CSP on every response; redirect logic unchanged; matcher now includes `/login` and `/api/auth` | R5 | 10 |
| `apps/admin/next.config.ts` | M | Static security headers | R5 | 10 |
| `apps/admin/src/lib/auth/__tests__/session.test.ts` | M | Update the proxy matcher test | R5 | 10 |
| `apps/web/app/{error,global-error}.tsx` + `app/__tests__/error.test.tsx` | C | Safe error screens | R6 | 11 |
| `apps/admin/app/{error,global-error}.tsx` + `app/__tests__/error.test.tsx` | C | Safe error screens | R6 | 12 |
| `packages/e2e/{package.json,tsconfig.json,eslint.config.js,playwright.config.ts,tests/origins.ts,tests/smoke.spec.ts}`, root `package.json`, `.gitignore`, `pnpm-lock.yaml` | C/M | New `@rr/e2e` workspace and `pnpm e2e` (smoke.spec.ts is a wiring check that 14/15 delete) | R7 | 13 |
| `packages/e2e/tests/web.spec.ts`, `tests/smoke.spec.ts` | C/M | Web smoke; drop the web half of the wiring check | R7 | 14 |
| `packages/e2e/tests/admin.spec.ts`, `tests/smoke.spec.ts` | C/D | Admin smoke; remove the wiring check | R7 | 15 |
| `.github/workflows/ci.yml`, `CLAUDE.md` | M | `e2e` step after build; `pnpm e2e` in Commands | R7 | 16 |

Every row traces to an R# or the `Open:` notes. Review constraints checked: build reads no env (all new env reads are per request or per test; the CSP proxy reads nothing), test mode only (FRW-16 strengthens it; the error pages carry the banner), payment status and price untouched (FRW-18 changes only the email claim), personal data (no new fields; error pages and logs show no messages; the overdue notice is a count), database roles (no new grant: the new column rides `rr_app`'s table-level `UPDATE`; `rr_admin` stays read-only; migration is additive, `0000`–`0003` untouched), organizer access (every page and data function still starts with `requireSession()`; proxy still only redirects), email only after payment (unchanged), `/api/*` no-store (unchanged: the new headers rule doesn't set `Cache-Control`), secrets on the server (FRW-15 removes one).

## Blast radius
**Risk:** high. It touches five high-stakes globs (`packages/db/**`, `apps/web/src/lib/registration/**`, `apps/admin/src/lib/auth/**`, `apps/admin/proxy.ts`, `.github/workflows/**`), a migration, the payment-confirmation email path, and a CSP that can break the checkout form if wrong.

| Affected | Kind | Via | Breaks? | Mitigation |
|---|---|---|---|---|
| `claimConfirmation` / `releaseConfirmation` | direct | `confirm.ts:116-138` is the only caller | Semantics change; old tests assume claim = `confirmation_sent_at` | 06 and 07 rewrite those tests; the one-email concurrency test must stay and pass |
| `confirmation_sent_at` readers | non-graph | `queries.ts` (detail, list), export route, `[reference]/page.tsx`, `seed-registrations.ts`, `docs/runbook.md`, `packages/db/README.md` | No: it now means delivered, which is what they display | 07 updates the runbook/README wording; no admin code change |
| Rolling deploy of 07 on a DB already at 0004 | non-graph | Old code sets `sent_at` at claim | No: old behaviour on a superset schema | Migration is additive; run it before deploying (runbook Migrations) |
| `Registration` type fixtures in web tests | direct | `confirm.test.ts:35`, `route.test.ts:36`, `actions.test.ts:62` list every column | Yes: `pnpm typecheck` fails in `apps/web` after the column is added | 06 adds `confirmationClaimedAt: null` to all three (audit FIX) |
| Server Actions' CSRF origin check | non-graph | Admin sign-in, demo button, sign-out; `Origin` header vs host | Yes if `Referrer-Policy: no-referrer`: `Origin: null` is rejected | 10 uses `same-origin` (audit BLOCK) |
| Neon `dev` database | non-graph | Preview deploys of later PRs run the confirm path on `dev` | Yes until `0004` is applied there | Owner op right after 06 is built (audit FIX) |
| `registrations` schema snapshot | non-graph | `meta/0003_snapshot.json`, drizzle journal | Generated, not hand-edited | 06 uses `pnpm --filter @rr/db db:generate`, never edits `0000`–`0003` |
| `HONEYPOT_FIELD` importers | direct | `actions.ts:10`, `turnstile.ts`, form | No, `turnstile.ts` re-exports | 02 test asserts the rendered input name |
| `getTurnstileSiteKey` | direct | `sections/register.tsx`, `turnstile.test.ts` | Returns null for test keys in production only | 02 tests with `VERCEL_ENV` stubbed |
| `proxy` (admin) and its matcher | direct | `session.test.ts:200-218`; Next runs it on every matched request | Matcher change means `/login` and `/api/auth` now pass through the proxy | 10 keeps the redirect branch for dashboard paths only and rewrites the matcher test |
| `apps/web/proxy.ts` (new) | transitive | Every page response | A wrong CSP breaks Turnstile or Next scripts | 09 verifies in a real browser; 15/14 smoke asserts no CSP violation; Turnstile checked on a phone (17) |
| `next.config.ts` `headers()` (both) | non-graph | The existing `/api/:path*` `Cache-Control` rule | No: new rule sets other header keys only | 09/10 tests assert both rules are present |
| `getOverview` return shape | direct | `(dashboard)/page.tsx`, `queries.test.ts` | Additive field | 08 |
| `ReferenceLink` / `listHref` consumers | direct | `registrations-table.tsx`, `[reference]/page.tsx` | URL gains list query params; `parseListParams` whitelists them | 04 test: a hostile query string falls back to defaults |
| Export route | direct | `exportHref`, the Export CSV button | New 413 branch | 03 test; button still works under the cap |
| `ci.yml` | non-graph | `verify` job is the merge gate | A new job could block merges if flaky | `secrets` and `e2e` are added as separate steps/jobs with the browser cached by version; e2e runs after `pnpm build` and must pass |
| Root `pnpm test` / turbo | non-graph | `@rr/e2e` package | Playwright must not run under `pnpm test` | 13: the package has no `test` script; its script is `e2e` |
| `pnpm-lock.yaml` | non-graph | New dev dependency (Playwright) | `--frozen-lockfile` fails if not committed | 13 commits the lockfile |
| Global error screens | direct | Next renders `global-error.tsx` in place of the root layout | The banner constraint ("every page") is lost unless it's re-added | 11/12 render the banner and a test asserts it |

**Known risks in the touched area:**
- FRW-6: PayMongo may not re-sign webhook retries, so retries after 5 min could 401 `stale`. Code untouched here; the live check is in 17.
- FRW-7: the widget has never been checked on a real phone; CSP on the web app raises the stakes (17).
- FRW-8: stuck claim (fixed by 06/07 going forward only).
- FRW-10: dashboard not yet signed in against Neon from a real deploy (17).
- The untracked `apps/admin/AGENTS.md` (written by `next dev`) is not part of this plan; commit it in whichever unit's PR you choose or ignore it.

## Units
Model line format: model · effort · thinking. Opus 5.5 can't turn thinking off, so it reads "on".

| Unit | Title | Category | Prompts | Depends | High-stakes | Acceptance criteria |
|---|---|---|---|---|---|---|
| FRW-15 | Remove the committed secret and add secret scanning | Fixed | 01 | — | yes (`.github/workflows/**`) | R1: `apps/admin/.env.example` holds no secret value; CI has a gitleaks job that runs on PRs and pushes; Dependabot config exists; the runbook has a "Secret exposure" section. Model: Opus 5.5 · effort high · thinking on |
| FRW-16 | Turnstile test keys refused in production; one honeypot name | Fixed | 02 | — | yes (`apps/web/src/lib/registration/**`) | R2: with `VERCEL_ENV=production` a `1x…`/`2x…`/`3x…` secret yields `unavailable` and a site key of that shape yields null; the form's honeypot input name is the server's constant, asserted by a test. Model: Opus 5.5 · effort high · thinking on |
| FRW-17 | Admin carry-over fixes | Fixed | 03, 04, 05 | — | yes (`apps/admin/src/lib/auth/**`, test-only) | R2: owner CSV keeps `+63…` mobiles as digits-with-plus without `'`, formula cells still escaped; an export over the cap answers 413; reference links don't prefetch and carry the list filters, and the detail page's back link restores them; a test fails if the list or detail page passes anything but `session.role` to the query. Model: Sonnet 5.5 · effort high · thinking on |
| FRW-18 | Self-healing confirmation email claim | Fixed | 06, 07 | — | yes (`packages/db/**`, `apps/web/src/lib/registration/**`) | R3: migration `0004` adds nullable `confirmation_claimed_at`; a claim older than 5 min on an unsent paid row under 23 h old can be re-claimed; `confirmation_sent_at` is set only after a successful send; concurrent deliveries still send once; dashboard "email sent" reflects delivery; the owner has applied `0004` to Neon `dev` before the preview is checked. Model: Opus 5.5 · effort xhigh · thinking on |
| FRW-19 | Retention overdue notice | Added | 08 | — | yes (`packages/db/**`) | R4: `getOverview` returns `pastRetention` (visitor rows older than 7 days, demo rows excluded); the owner's overview shows a notice when it's above 0; the viewer sees none. Model: Opus 5.5 · effort high · thinking on |
| FRW-20 | Web security headers and CSP | Added | 09 | — | no, but it guards checkout: run code-guardian anyway (audit note) | R5: every page on `apps/web` carries a nonce CSP and the static security headers; `/api/*` keeps `no-store`; the page and the Turnstile widget work with no CSP violation in a real browser. Model: Opus 5.5 · effort high · thinking on |
| FRW-21 | Admin security headers and CSP | Added | 10 | FRW-20 | yes (`apps/admin/proxy.ts`) | R5: every admin response, including `/login` and `/api/auth/*`, carries the CSP and static headers (`Referrer-Policy: same-origin`); unauthenticated dashboard paths still redirect to `/login`; no CSP violation on `/login`. Model: Opus 5.5 · effort high · thinking on |
| FRW-22 | Safe error screens | Added | 11, 12 | — | no | R6: each app has `error.tsx` and `global-error.tsx`; neither shows the error message; `global-error` still shows the test-mode banner. Model: Sonnet 5.5 · effort medium · thinking on |
| FRW-23 | Browser smoke tests in CI | Added | 13, 14, 15, 16 | FRW-20, FRW-21, FRW-22 | yes (`.github/workflows/ci.yml`) | R7: `pnpm e2e` builds nothing itself, starts both apps on the CI build with dummy env, and passes; CI runs it after `pnpm build`; it asserts the banner on every page, `no-store` on `/api/*`, the security headers, no CSP violations, a bad webhook signature → 401, and admin redirects. Model: Opus 5.5 · effort high · thinking on (prompt 16; 13–15 are Sonnet) |
| FRW-24 | Pre-release owner checklist | Added | 17 | FRW-15–FRW-23 | no | R8: `docs/runbook.md` has a "Pre-release verification" section covering every owner-only item below. Model: Haiku 4.5 · effort low · thinking off |

## Prompts
| # | Title | Unit | Model | Effort | Depends | Group | Files |
|---|---|---|---|---|---|---|---|
| 01 | Secret example, gitleaks job, Dependabot, runbook | FRW-15 | opus | high | — | A | `.env.example`, `ci.yml`, `dependabot.yml`, `runbook.md` |
| 02 | Test-key guard and shared field names | FRW-16 | opus | high | — | A | `fields.ts`, `turnstile.ts`, its test, `registration-form.tsx`, form test, `apps/web/.env.example`, `runbook.md` |
| 03 | CSV phone carve-out and export cap | FRW-17 | sonnet | high | — | A | `csv.ts`, test, `export/route.ts`, test |
| 04 | List state in detail links, no prefetch | FRW-17 | sonnet | high | 03 | B | `search-params.ts`, test, `registrations-table.tsx`, `[reference]/page.tsx` |
| 05 | `session.role` pass-through test | FRW-17 | sonnet | high | 04 | C | `role-passthrough.test.ts` |
| 06 | Migration 0004 and claim functions | FRW-18 | opus | xhigh | — | A | migration + meta, schema, `registrations.ts`, test, three web test fixtures |
| 07 | confirm.ts marks delivered | FRW-18 | opus | xhigh | 06 | B | `confirm.ts`, `confirm.test.ts`, webhook `route.test.ts`, `actions.test.ts`, `runbook.md`, `packages/db/README.md` |
| 08 | `pastRetention` query and owner notice | FRW-19 | opus | high | — | A | `queries.ts`, test, `(dashboard)/page.tsx`, `runbook.md` |
| 09 | Web CSP and headers | FRW-20 | opus | high | — | A | `csp.ts`, test, `proxy.ts`, `next.config.ts`, `runbook.md` |
| 10 | Admin CSP and headers | FRW-21 | opus | high | 09 | A | `csp.ts`, test, `proxy.ts`, `next.config.ts`, `session.test.ts`, `runbook.md` |
| 11 | Web error screens | FRW-22 | sonnet | medium | — | A | `error.tsx`, `global-error.tsx`, test |
| 12 | Admin error screens | FRW-22 | sonnet | medium | 11 | B | `error.tsx`, `global-error.tsx`, test |
| 13 | `@rr/e2e` scaffold | FRW-23 | sonnet | medium | 09, 10, 11, 12 | A | package files, `tests/origins.ts`, `tests/smoke.spec.ts`, root `package.json`, `.gitignore`, lockfile |
| 14 | Web smoke spec | FRW-23 | sonnet | high | 13 | A | `web.spec.ts`, `smoke.spec.ts` |
| 15 | Admin smoke spec | FRW-23 | sonnet | high | 14 | B | `admin.spec.ts`, `smoke.spec.ts` |
| 16 | CI e2e step and Commands | FRW-23 | opus | high | 15 | A | `ci.yml`, `CLAUDE.md`, `runbook.md` |
| 17 | Pre-release checklist | FRW-24 | haiku | low | all | A | `runbook.md` |

Groups are sequential within a unit because every prompt in a unit shares a package and a working tree (workflow §5); no two prompts run in parallel.

**Why each Opus prompt:**
- 01: `.github/workflows/**` runs with repo permissions; a mistaken scan config silently turns the guard off.
- 02: `apps/web/src/lib/registration/**` is the public form's bot check; a wrong guard blocks all registrations in production.
- 06: a migration on a table holding personal data, plus concurrency rules for the one-email guarantee.
- 07: the payment-confirmation path; the one-email test must keep holding under concurrent webhooks and page loads.
- 08: `packages/db/**` high-stakes glob, read-only change.
- 09: a wrong CSP breaks Turnstile and therefore all registrations, on the money path.
- 10: `apps/admin/proxy.ts` is the organizer access gate; the matcher change must not weaken the redirect.
- 16: edits the merge-gate workflow.

## End-to-end verification
```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# after FRW-23 (also added to CLAUDE.md Commands by prompt 16)
pnpm e2e

# R1: no secret value in the example; the scan job exists
grep -nE '^BETTER_AUTH_SECRET=$' apps/admin/.env.example
grep -n 'gitleaks' .github/workflows/ci.yml
# R2/R3: unit tests named in prompts 02–07 pass as part of pnpm test
# R4: pnpm --filter @rr/db test -- queries (pastRetention cases)
# R5: against `pnpm --filter @rr/web start` and `pnpm --filter @rr/admin start`
curl -sI http://localhost:3000/ | grep -iE 'content-security-policy|x-content-type-options|referrer-policy'
curl -sI http://localhost:3000/api/health | grep -i cache-control        # still no-store
curl -sI http://localhost:3001/login | grep -iE 'content-security-policy|x-content-type-options'
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3001/registrations   # 307 → /login
# R6/R7: pnpm e2e passes; error screens covered by the app tests
```

## Rollback
- Every unit is its own PR: revert the merge commit. App rollback is Vercel Instant Rollback (runbook → Roll back).
- FRW-18: the migration is additive (nullable column). Roll the app back first; the column can stay unused. Never edit or down-migrate `0004`; fix forward.
- FRW-20/FRW-21: if a CSP breaks a page in production, roll back the deploy; both apps' headers live in `proxy.ts` and `next.config.ts` only, so a one-line revert of the proxy is also enough.
- FRW-15: nothing to roll back; the leaked value stays dead once rotated.

## Owner ops (no PR; copy into TASKS.md after the audit)
- [ ] **Now, before anything else:** rotate `BETTER_AUTH_SECRET` in the admin Vercel project (Production and Preview) if the value committed at `c5efb3f` was ever used there; `openssl rand -base64 32`, redeploy. It signs everyone out; no re-seed needed. Do not paste the new value anywhere.
- [ ] Turn on GitHub secret scanning and push protection for the repository (Settings → Code security).
- [ ] **As soon as prompt 06 is built:** apply migration `0004` to Neon `dev` as the owner (runbook → Migrations), before checking FRW-18's preview deploy and before FRW-19's branch. Apply it to `main` before the `develop` → `main` release.
- [ ] After FRW-23: confirm the CI `e2e` job is green on a PR before merging FRW-24.
- [ ] FRW-24 lists the remaining live checks (rate-limit rule, Neon sign-in, webhook retry, real email, Turnstile on a phone, CSP console check).

## Log
- 2026-10-15: FRW-23 merged (PR #22 as `cdff5ad`, gate CI + code-guardian, then CI only after fixes).
- 2026-10-15: FRW-23 code-guardian: REQUEST CHANGES, 0 Blockers, 3 Should-fix + 9 nits; fixed in `d9e9a43` (PR #22 green, CI e2e 41/41, 0 flaky). Applied: (1) the framing test was vacuous (Chromium never loads a localhost frame into an `about:blank`/public parent, CSP or not): the parent is now a `node:http` server on `127.0.0.1:0`, the test asserts the `frame-ancestors 'none'` console report, plus a positive control framing a permissive page; (2) admin `/_not-found` IS reachable signed out with any cookie (proxy checks presence only; verified: 404, banner, 0/14 scripts nonced, no DB): new known-gap test pins the blocked scripts and fails once a dynamic `not-found.tsx` lands, runbook corrected; (3) `reuseExistingServer: false` (a `next dev` with real `.env.local` could stand in; busy port now fails at once, checked). Nits applied: `VERCEL_ENV: ""` on both servers, dead-DB comment (Neon driver yields an unparsable host), `blob-report/` unanchored, pinned web `referrer-policy`/`permissions-policy` values, comment that the `/api` rule is unit-tested in `csp.test.ts`, runbook claims narrowed (which secrets are checked) and absolute report path. Not applied: `.env.example` drift guard (speculative), eslint ignores for reports (no traces configured), `networkidle` on the banner tests (the CSP describe covers `/` and `/privacy`). Out of scope, reported to the user: `apps/admin/app/api/auth/[...all]/route.ts` lets `handler()` errors escape, so Next logs the Drizzle error with `params: <ip>|/get-session` (client IP from `x-forwarded-for` in production: personal data in logs, RA 10173).
- 2026-10-15: FRW-23 PR #22: first CI run had `verify` green (e2e 39/39) but `secrets` red: gitleaks `generic-api-key` flagged the fake `whsk_e2e_dummy_secret` (config line 24, `web.spec.ts` line 9). The PR scan covers every PR commit, so a follow-up commit can't clear it: with the user's approval, added `// gitleaks:allow` to both lines, amended to `e5545a6` (gitleaks 8.24.3 in Docker: 0 leaks on the amend, 2 on the old commit) and force-pushed with lease. CI green.
- 2026-10-15: 16 done (opus, 0 retries): `verify` gains, after `pnpm build`, `actions/cache@v6` on `~/.cache/ms-playwright` (lockfile key), `playwright install --with-deps chromium` (unconditional: Playwright's CI docs have no install-deps/hit split and say OS packages can't be cached), `pnpm e2e`, and `actions/upload-artifact@v7` on failure (report + test-results, 7 days). `CLAUDE.md` Commands ends with `pnpm e2e` plus one sentence; runbook → Browser smoke tests (CI). Full Commands green locally (e2e 39/39); CI unverified until the PR.
- 2026-10-15: 15 done (sonnet, 0 retries): `tests/admin.spec.ts`, 17 tests (signed-out 307 on 4 dashboard paths + unknown path + `Next-Router-Prefetch`, `/login` 200 with banner, disabled demo button, password form, nonce CSP with `frame-ancestors`/`form-action`, 0 violations; nosniff + `same-origin`; `no-store` on `/api/auth/*`; sign-up/create-user/list-sessions 404; not framable (frame ends on `chrome-error://`); no secret or `postgres://` in HTML); `smoke.spec.ts` deleted. `/login` needs no DB; `GET /api/auth/get-session` is 500 without one (router rate limiter has `storage: "database"`), so headers only. Admin `/_not-found` unreachable signed out (307), so not covered. Plain `pnpm e2e` 39/39 twice (3.6s).
- 2026-10-15: 14 done (sonnet, 0 retries): `tests/web.spec.ts`, 23 tests (banner on 5 pages incl. 404, nonce CSP + fresh nonce, static headers, `no-store`, webhook 401 before DB, GET 405, paused form, own-origin only, privacy 7 days, forged success-page params, dummy secret absent from HTML/RSC/API); web half of `smoke.spec.ts` removed. Agent found `next start` loads `apps/*/.env.local` (real DB URL, Turnstile test key) so a local run wasn't dummy-env: fixed here in `playwright.config.ts` by passing every `.env.example` key not set by the config as `""` (empty fails each schema like unset; process env wins over `.env.local`). Plain `pnpm e2e` 23/23 twice (3.0s). Negative control: Chromium's console text for a CSP block contains "Content Security Policy", so `watch()` isn't vacuous.
- 2026-10-15: 13 done (sonnet, 0 retries): `@rr/e2e` (Playwright `^1.64.1`, chromium only, no `test` script), `webServer` starts both built apps by port with dummy env and a dead `DATABASE_URL`; root `pnpm e2e`; `.gitignore` playwright block; placeholder `smoke.spec.ts` (2 tests) green. Lockfile also re-keys `next` (optional peer `@playwright/test`).
- 2026-10-15: FRW-23 started on branch `FRW-23`; rollback point `c33da23cf25c5a3389857df1a190e804711c6dc7`.
- 2026-10-15: FRW-22 merged (PR #21, gate CI only).
- 2026-10-15: FRW-22 started on branch `FRW-22`; rollback point `12c07feaa36fa61a357aad6c8c3a4681097e5433`.
- 2026-10-15: 12 done (sonnet, 0 retries): admin `error.tsx` + `global-error.tsx` + test; banner markup repeated verbatim, digest only, plain-anchor exit. 122 admin tests green.
- 2026-10-15: 11 done (sonnet, 0 retries): web `error.tsx` + `global-error.tsx` + test. Next 16.4 passes `retry` (not `reset`). Digest only; no message/stack; global-error has own html, banner, plain-anchor exit. 154 web tests green.
- 2026-10-15: FRW-21 code-guardian: APPROVE WITH NITS, 0 Blockers, 1 Should-fix + 4 nits; fixed in `41b21e7` (PR #20 green). Reviewer confirmed on a fresh `next start`: `next.config` headers also land on the proxy's 307; `/LOGIN`, `/%6Cogin` fail closed (307); `/login/`, `/api/auth/` get Next's 308 before the proxy; forwarded request headers don't affect `signIn()` (own Request, `forwardedFor`), the auth allowlist or the server-action origin check; `form-action 'self'` breaks no form (filters GET, export is an anchor); the no-`missing` deviation is right (old matcher had none). Applied: `/api/auth` added to the pass-through `it.each` (exact clause now mutation-checked); runbook wording ("every page and API response the proxy matches"; trailing-slash 308s and static-asset 404s go out without it). Should-fix deferred to Downstream: prerendered `/_not-found` has no nonce (13/13 scripts blocked, signed-in only); fix is a dynamic `apps/admin/app/not-found.tsx` (FRW-22) and FRW-23 must expect or cover it. Not applied: anchoring matcher exclusions (predates the unit, same as web, no auth gap), dropping unread `x-nonce` (mirrors web).
- 2026-10-15: 10 done (opus, 0 retries): `buildCsp()` in new `apps/admin/src/lib/csp.ts` (nonce + `'strict-dynamic'`, no third-party origin, `form-action 'self'`, `frame-ancestors 'none'`, `'unsafe-eval'` only in dev, `upgrade-insecure-requests` only when `VERCEL_ENV=production`). `apps/admin/proxy.ts` sets the CSP on every response; `/login` and `/api/auth` (exact, or `/api/auth/…`) pass through without a cookie, everything else keeps the cookie redirect (CSP on the 307 too). Matcher `/((?!_next/static|_next/image|favicon.ico|robots.txt).*)`. **Deviation (lead engineer):** no `missing` prefetch entry, because skipping a router prefetch would also skip its redirect; a test pins it and curl confirms a prefetch still gets 307. `next.config.ts` adds nosniff, `Referrer-Policy: same-origin` (comment: why not `no-referrer`) and `Permissions-Policy`; `/api` `no-store` unchanged. 7 csp tests + proxy block rewritten in `session.test.ts` (public pass-through, forged cookie passes, `/login-evil`, `/login/x`, `/loginx`, `/api/authx`, `/api/auth-evil` still 307, fresh nonce); path logic mutation-checked (loose `startsWith` fails 5). Runbook → Security headers → Dashboard. Verified independently: curl on `next start` (headers, 307s, prefetch 307, `/api/auth/get-session` no-store + CSP, 15/15 scripts nonced on `/login`); agent's headless Firefox: 0 violations on `/login`, both sign-in server actions passed Next's origin check and failed only on the missing DB. Auth route allowlist keys on method + path only, so forwarded request headers don't affect it. Not verified: a real sign-in (no DB; owner checklist). Gotcha: prerendered `/_not-found` has no nonce, so its scripts are blocked (only reachable with a cookie); same issue as web `_global-error`, for FRW-22/23. `apps/admin/.env.local` exists and `next start` loads it (dummy CLI env wins).
- 2026-10-15: FRW-21 started on branch `FRW-21`; rollback point `661909ca1f761d386853aec6c0dfc4ed944f5846`.
- 2026-10-15: FRW-20 code-guardian: APPROVE WITH NITS, 0 Blockers, 3 Should-fix + 4 nits; fixed in `7a4e05d` (PR #19 green). Applied: matcher test pins `missing` and the `api/` slash (`/api`, `/apiary` matched; mutation-checked both); runbook bullet on the Vercel Toolbar's `vercel.live` violation on Preview; dropped the guide's `purpose: prefetch` exclusion (a browser HTML prefetch may be reused, so it keeps its CSP; App Router `next-router-prefetch` still skipped; curl-checked); `form-action` wording (the 303 is the no-JS path). Deferred to Downstream: prerendered `_global-error` / `pages/500.html` has no nonce, so its scripts are blocked (FRW-22/FRW-23). Not applied: tightening the matcher exclusions (`favicon\.ico$`, `_next/static/`; no favicon shipped, cosmetic), `report-to` (post-MVP). Verified: fetch-action redirect is a client navigation (no `connect-src` impact), `next/script` gets the nonce via preload.
- 2026-10-15: 09 done (opus, 0 retries): `buildCsp()` in `apps/web/src/lib/csp.ts` (nonce + `'strict-dynamic'`, Turnstile in script/connect/frame, `object-src`/`frame-ancestors 'none'`, no `form-action`, `'unsafe-eval'` only in dev, `upgrade-insecure-requests` only when `VERCEL_ENV=production`); new `apps/web/proxy.ts` (guide pattern, pages-only matcher excluding `/api/`, `_next/static`, `_next/image`, `favicon.ico`, prefetches); `next.config.ts` adds nosniff, `strict-origin-when-cross-origin` and `Permissions-Policy` on `/:path*`, `/api` `no-store` rule unchanged. 10 tests (incl. a matcher test). Runbook → Security headers. Verified independently: headers via curl on `next start`, every `<script>` nonced (29/18/17), headless Firefox over BiDi shows 0 violations on `/`, `/privacy`, `/register/success`, Turnstile test key issues a token, negative control (`example.com` iframe) is reported. Dev: HMR works under `connect-src 'self'`, no ws: entries needed. Gotchas: `next dev` generates `apps/web/AGENTS.md` (deleted, untracked); Firefox from the VS Code snap shell needs `env -i` (snap `libpthread` crash). Not checked: Chromium/WebKit (none installed; FRW-23 adds them), the real PayMongo redirect.
- 2026-10-15: FRW-20 started on branch `FRW-20`; rollback point `7229a2e97b1520efeb6443e68adac212aeaa998b`.
- 2026-10-15: FRW-19 code-guardian: APPROVE WITH NITS, 0 Blockers, 1 Should-fix + 5 nits; fixed in `f37fc5d` (PR #18 green). Should-fix: tests didn't pin the pattern's strictness; now 9 near-miss mobiles each assert `pastRetention` equals `!DEMO_MOBILE_PATTERN.test(m)` (dropping `^` or `$` fails CI, mutation-checked). Nits applied: `[+]` instead of `\+` (no dependence on `standard_conforming_strings`), 0900-range assumption in the `pastRetention` doc comment. Not applied: the `RETENTION_DAYS` ↔ `SITE.retentionDays` link stays a comment (no cross-package test), the runbook's 7/60 days are prose, no page render test for the viewer gate (admin has no page tests). Verified: Drizzle `sql` uses cooked strings; `mobile` is NOT NULL.
- 2026-10-15: 08 done (opus, 0 retries): `RETENTION_DAYS = 7` and `Overview.pastRetention` (a `count()` in the existing `Promise.all`: `created_at < now − 7 d` and `mobile !~ '^\+63900000[0-9]{4}$'`, every status). 8 PGlite tests as `rr_admin` (empty, 8 d × 3 statuses, 6 d, exact 7 d boundary, 300 demo rows at 40 d, mixed set → 3), mutation-checked four ways (demo exclusion removed, `lte`, 6 d, 9 d). Owner-only `role="status"` callout under the intro reuses the login page's `bg-error-bg` classes; runbook Demo data bullet. Integration: `mobile` is NOT NULL; other `Overview` users only index sub-fields; pattern matches `DEMO_MOBILE_PATTERN`. Gap: no render test for the notice (would need a file outside the unit). 490 tests green.
- 2026-10-15: FRW-19 started on branch `FRW-19`; rollback point `3895a3b7aa0125f9616c7078ac2b09234c07b2c9`.
- 2026-10-15: FRW-18 code-guardian: REQUEST CHANGES, 1 Blocker + 2 Should-fix + 4 nits; fixed in `c441061` (PR #17 green). Blocker: the runbook and `confirm.ts` claimed PayMongo retries heal a stale claim, but a held claim answers 200 (ends retries) and `SIGNATURE_TOLERANCE_SECONDS` = 5 min makes an un-re-signed retry `stale`; now says a success-page load or a dashboard webhook resend heals it, with a detection query and an immediate fix for rows paid < 23 h. Should-fix: deploy order (`42703` takes the whole site down without `0004`); 22 h / 23 h 05 m tests pin `RECLAIM_WITHIN_HOURS` (mutation-checked with 24 and 1). Nits applied: stale-threshold comment (300 s Fluid default, no margin), post-`0004` manual SQL clears only an unsent claim, duplicate test title. Skipped nit: scoping `releaseConfirmation` to the caller's own claim (needs a sender alive past 5 min, impossible at ≤ 300 s, and the idempotency key still holds one email). Verified independently: `make_interval` params infer int4 on Neon HTTP; admin readers unchanged.
- 2026-10-15: 07 done (opus, 0 retries): `sendConfirmation()` calls `markConfirmationSent()` after the send's try/catch (success and `duplicate`); a mark failure logs `email.mark_sent_failed` (ID, error name, code) and doesn't rethrow or release; a failed send is unchanged. `confirm.test.ts` emulates claim vs delivered on a fake clock; the one-email test is unchanged and green; 5 new tests (mark after accept, duplicate marks, failed send doesn't mark, mark failure resolves `paid`, stale reclaim sends once under 3 concurrent callers). Mutation-checked four ways. Runbook Email: deploy order, self-heal, `mark_sent_failed`, Stuck claim SQL clears both columns; db README rows. Deviation: `actions.test.ts` needed no mock (its `@rr/db` mock has no claim functions and `actions.ts` never reaches `sendConfirmation`), so its only diff is 06's fixture line. 481 tests green.
- 2026-10-15: 06 done (opus, 0 retries): `0004_confirmation_claim.sql` generated (`db:generate --name confirmation_claim`), exactly one nullable `ADD COLUMN`, no grant; `0000`–`0003` untouched; re-generate reports no drift. `claimConfirmation` sets `confirmation_claimed_at` (stale reclaim via `CLAIM_STALE_AFTER_MINUTES = 5` / `RECLAIM_WITHIN_HOURS = 23`, `make_interval` from the constants), new `markConfirmationSent`, `releaseConfirmation` clears only an unsent claim; 33 claim/schema tests incl. 5-way concurrency. Approved scope extra: `grants.test.ts:88` migration count 4 → 5 (the audit's "unchanged" missed it). 476 tests green. Integration: admin readers keep `confirmationSentAt`; both role grants are table-level and admin queries name columns, so the new column breaks no reader.
- 2026-10-15: FRW-18 started on branch `FRW-18`; rollback point `5b3ed285c8eadd37b5bb5a16a79d2380456a1300`.
- 2026-10-15: FRW-17 code-guardian: APPROVE WITH NITS, 0 Blockers, 0 Should-fix. Not applied: csv tests for `"+63917\n"` / non-ASCII digits (regex verified safe in node), `PLAIN_PHONE` exempts any `+digits` cell (per spec, no security impact), export loads up to 10k rows before the 413 (accepted in audit), no render test for `prefetch={false}` / back link. PR #16 green (`secrets`, `verify`, Vercel).
- 2026-10-15: 05 done (sonnet, 0 retries): `role-passthrough.test.ts` (7 tests) asserts the list and detail pages pass `session.role` to `listRegistrations` / `getRegistration` for owner and viewer, and query nothing when signed out. Mutation-checked on both pages (literal `"owner"` fails the viewer cases), pages restored byte-for-byte. Gotcha: `cp` is interactive in this shell, so restore with `cat > file`.
- 2026-10-15: 04 done (sonnet, 0 retries): `detailHref(params, reference)` in `search-params.ts`; `ReferenceLink` takes `params`, links with `detailHref` and `prefetch={false}`; detail page parses `searchParams` and the back link is `listHref(list)`. 96 admin tests green.
- 2026-10-15: 03 done (sonnet, 0 retries): `PLAIN_PHONE = /^\+\d+$/` exempts `+63…` mobiles from the `'` prefix; export route answers 413 (text/plain, no-store, counts only) when `total > EXPORT_LIMIT`; `toCsv` has one caller. 91 admin tests green.
- 2026-10-15: FRW-17 started on branch `FRW-17`; rollback point `45dc68f4c84c9e43bc8113c0da6f8792f49c8d4e`.
- 2026-10-15: FRW-16 code-guardian: 0 Blockers; Should-fix 1–2 + 3 nits applied in `e962acb` (docs cover both refusal paths and the Vercel "expose System Environment Variables" dependency, site-key no-value log assertion, form comment placement, dated "now"). Skipped nits: secret-only test key also pausing the form (beyond AC), per-request log volume (no action). PR #15 green.
- 2026-10-15: 02 done (opus, 0 retries): `fields.ts` holds both field names (no imports), `turnstile.ts` re-exports them; `isTurnstileTestKey` + `VERCEL_ENV=production` guard in `verifyTurnstile` (no fetch) and `getTurnstileSiteKey` (null); form honeypot test verified by mutation; one sentence each in `.env.example` and runbook.
- 2026-10-15: FRW-16 started on branch `FRW-16`; rollback point `7766ce03b4fd22ffb03c82d05e1aaf5bb767c14b`.
- 2026-10-15: FRW-15 code-guardian: 0 Blockers; Should-fix 1–4 + 3 nits applied in `d59c654` (scan develop pushes, no cancel on push, SHA pin, PR comments off, Dependabot → develop, runbook login secrets). Skipped nits: Dependabot cooldown, explicit GITLEAKS_VERSION, PayMongo webhook rotation wording. PR #14 green.
- 2026-10-15: 01 done (opus, 0 retries): `.env.example` blanked (identical to pre-`c5efb3f`), `secrets` job on `gitleaks/gitleaks-action@v3` (`pull-requests: read` needed for PR range; scans only PR/push commits), Dependabot npm grouped + actions, runbook Secret exposure.
- 2026-10-15: FRW-15 started on branch `FRW-15`; rollback point `c5efb3f4c40a26933e963022825bda39f8acd9f2`.
- 2026-10-15: audited, 1 BLOCK + 4 FIX applied, 10 NOTEs (see `2026-10-15-mvp-hardening.audit.md`); 6 of the NOTEs were folded in (gitleaks fallback in 01, docs files in 02, `upgrade-insecure-requests` gate in 09/10, runbook section order in 09/16/17, privacy decision and code-guardian-on-FRW-20 in this plan). Not applied by design: export cap loading rows before the 413, R1 proof that the scan fires, model downgrades.
- 2026-10-15: planned. Scope and four design choices agreed with the user. Working tree had only the untracked `apps/admin/AGENTS.md`; `develop` and `main` trees identical at planning time (planned from `main`, units branch from `develop`).
