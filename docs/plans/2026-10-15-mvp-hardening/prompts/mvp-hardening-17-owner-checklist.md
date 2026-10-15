---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 17
unit: FRW-24
status: todo
model: haiku
effort: low
depends_on: [01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16]
parallel_group: A
files:
  create: []
  modify: ["docs/runbook.md"]
  delete: []
---
# 17 · Runbook: pre-release verification checklist for the owner

## Task
Add one section to `docs/runbook.md`, `## Pre-release verification`, placed after `## Browser smoke tests (CI)` and immediately before `## Roll back` (the order is Security headers → Browser smoke tests (CI) → Pre-release verification). It is a checklist of everything only the owner can check (real accounts, real browsers, Vercel and GitHub settings). Write it in the runbook's existing tone and bullet style (look at `## Organizer dashboard` and `## Email (Resend)` for how steps and SQL/shell blocks are formatted). Docs only: no code.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Riverline Run is a fictional fun run in PayMongo test mode; two Vercel projects (`apps/web`, `apps/admin`), Neon, Resend, Cloudflare Turnstile.
- Use exactly these checklist items (each a `- [ ]` line with a short how-to; keep each to 1–4 lines, link to the runbook sections named in brackets rather than repeating them):
  1. **Secret rotation**: `BETTER_AUTH_SECRET` was exposed in git on 2026-10-15 (commit `c5efb3f`); confirm it was rotated in the admin Vercel project (Production and Preview) and the dashboard redeployed [Incidents → Secret exposure]. Do not paste the value anywhere.
  2. **GitHub**: Settings → Code security → secret scanning and push protection are on; Dependabot version updates appear after the first week; the `secrets` and `verify` (with e2e) jobs are green on `main`.
  3. **Migration 0004** (`confirmation_claimed_at`) applied to Neon `dev` then `main` as the owner **before** deploying the web app that uses it [Migrations]; afterwards `\d registrations` shows the column.
  4. **Real email**: pay a test registration with an address you can read [Email → Check it]; exactly one email; the dashboard's detail page shows "email sent" with a time; reload `/register/success` and resend the webhook event: still one email.
  5. **Stuck-claim self-heal** (optional, on `dev`): as the owner set `confirmation_sent_at = NULL, confirmation_claimed_at = now() - interval '10 minutes'` on a paid test row, then reload that runner's `/register/success`: the email is re-sent once and `confirmation_sent_at` is set.
  6. **Webhook retries**: from the PayMongo dashboard resend an event more than 5 minutes after its first delivery and note whether it gets 401 `stale` (answers the open FRW-6 question; if so, widen `SIGNATURE_TOLERANCE_SECONDS`) [Webhook → End-to-end check].
  7. **Turnstile on a phone** against the Preview deploy: the widget renders and the form submits; and confirm production uses real Turnstile keys, not Cloudflare's `1x…` test keys (the site now refuses them in production: the form would show "registration is paused").
  8. **CSP console check**: open the public site (home, register section, `/privacy`) and the dashboard (`/login`, overview, a registration) in a desktop browser with the console open: no `Content Security Policy` errors; `curl -sI <url>` shows `content-security-policy`, `x-content-type-options` and, on `/api/*`, `cache-control: no-store`.
  9. **Rate limit the form**: Vercel → the web project → Firewall → add a rate-limit rule: `POST` to `/` (the registration server action posts to the page it is on), keyed by IP, about 10 requests per minute, action 429 (verify what the Hobby plan allows; the number of rate-limit rules is limited). Do not include `/api/webhooks/paymongo`.
  10. **Dashboard against Neon (FRW-10 owner op)**: sign in as owner and as the demo viewer on the production dashboard; the viewer sees masked data; `curl -s -o /dev/null -w '%{http_code}' -X POST <admin>/api/auth/sign-up/email` is 404.
  11. **Retention**: run the weekly reseed [Organizer dashboard → Demo data]; the owner's overview shows no "older than 7 days" notice afterwards.
  12. **Env**: `ADMIN_URL` is set in the web project (Production and Preview) [Organizer dashboard]; `/organizer` redirects to the dashboard.
- End the section with one sentence: when every box is ticked, tag the release (`develop` → `main` merge) per the Deploy section.
- Scope: `docs/runbook.md` only. Don't edit other sections except to fix a broken anchor you introduce.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Put any secret value, key or password in the text.

## Done when
```bash
pnpm format:check
```
- `grep -n '^## Pre-release verification' docs/runbook.md` prints one line, directly above `## Roll back`; all 12 items are present (`grep -c '^- \[ \]' docs/runbook.md` increased by 12).
