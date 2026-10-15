---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 08
unit: FRW-19
status: done
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create: []
  modify:
    - "packages/db/src/admin/queries.ts"
    - "packages/db/src/admin/__tests__/queries.test.ts"
    - "apps/admin/app/(dashboard)/page.tsx"
    - "docs/runbook.md"
  delete: []
---
# 08 · Owner overview: warn when visitor registrations are past the 7-day retention

## Task
`/privacy` promises registrations are deleted within 7 days, but that depends on the owner running `seed:registrations` by hand. Add a read-only count of visitor registrations older than 7 days to `getOverview()` and show the owner a notice on the overview when it is above zero. The demo viewer sees nothing.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. `packages/db/src/admin/queries.ts` is a **high-stakes** file (`packages/db/**`): read-only queries for the dashboard, run as `rr_admin` (SELECT on `registrations`; no new grant needed).
- `getOverview(db, { now })` is at `queries.ts:90`; its return type `Overview` (line 48) documents each field; constants `ABANDONED_AFTER_HOURS` (31) and `DAILY_WINDOW_DAYS` (34) sit above it; `r` is the `registrations` alias used in the queries. Read the function end to end and follow how `abandoned` is counted (a `count()` with a `where` using `now` for time, so tests can pass a fixed `now`).
- Add `export const RETENTION_DAYS = 7;` with a comment "Keep in step with `SITE.retentionDays` (apps/web/src/content/site.ts) and /privacy: the weekly reseed is what enforces it", and add to `Overview` and the return value: `/** Visitor registrations older than RETENTION_DAYS: the weekly reseed is overdue when this is above 0. Demo rows (visibly fake +63900000xxxx mobiles, seeded across 60 days) are excluded. */ pastRetention: number;`.
  Query: `count()` of rows where `created_at < now - RETENTION_DAYS days` **and** `mobile !~ '^\+63900000[0-9]{4}$'` (`sql` template, pattern as a literal: the same shape as `DEMO_MOBILE_PATTERN` in `packages/db/src/seed-registrations.ts:155`; do not import that file, it is a CLI script). Counts every status (pending and cancelled rows hold personal data too). Aggregate only: the overview holds no personal data for either role.
- Tests: `packages/db/src/admin/__tests__/queries.test.ts` (497 lines, PGlite, runs as `rr_admin`; see how the `getOverview` tests insert rows and pass `now`). Add: no rows → 0; a visitor row 8 days old (any status) → 1; a visitor row 6 days old → 0; 300-ish demo-pattern rows 40 days old → 0; a mixed set counts only the old visitor rows.
- Page: `apps/admin/app/(dashboard)/page.tsx`. It already has `const session = await requireSession();` then `const overview = await getOverview(getDb());` and uses `canSeePersonalData(session.role)` (imported from `@/lib/auth/roles`) for the intro text. Render, directly under the intro paragraph and **only when `canSeePersonalData(session.role) && overview.pastRetention > 0`**, a notice (role `status`, using the existing Tailwind tokens/classes of that page: look at how other callouts are styled in `apps/admin/src/components/` and `globals.css`; don't add CSS files): "{n} visitor registration(s) are older than 7 days. /privacy promises deletion within 7 days: run the weekly reseed (runbook → Organizer dashboard → Demo data)." Use `formatCount` from `@/components/stat-card` and `RETENTION_DAYS` from `@rr/db/admin`. No personal data in the text, only the count.
- Docs: `docs/runbook.md` → `## Organizer dashboard (apps/admin)` → the "Demo data" bullet: say the owner's overview now shows this notice when the reseed is overdue and that the check ignores the seed's fake rows.
- Review constraints: personal data (RA 10173: retention is a privacy-notice promise), organizer access (`requireSession()` already first), database roles (no new grant).
- Scope: the listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Show the notice to the viewer, or add any DELETE, cron or write path.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
- New `queries.test.ts` cases pass as `rr_admin`; `grep -rn "pastRetention" apps packages --include=*.ts --include=*.tsx -l` lists queries, its test and the page.
