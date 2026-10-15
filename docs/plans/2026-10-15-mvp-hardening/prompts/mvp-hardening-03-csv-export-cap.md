---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 03
unit: FRW-17
status: done
model: sonnet
effort: high
depends_on: []
parallel_group: A
files:
  create: []
  modify:
    - "apps/admin/src/lib/csv.ts"
    - "apps/admin/src/lib/__tests__/csv.test.ts"
    - "apps/admin/app/(dashboard)/registrations/export/route.ts"
    - "apps/admin/app/(dashboard)/registrations/export/__tests__/route.test.ts"
  delete: []
---
# 03 · CSV: keep `+63…` phones readable, and fail loudly past the export cap

## Task
Two FRW-12 findings in the organizer CSV export:
1. The owner's CSV prefixes `'` to every mobile (`+639171234567` → `'+639171234567`) because `+` is a formula-start character. A cell that is a plus sign followed only by digits can't call a function, so it must be exempt. Everything else keeps the OWASP rule.
2. `GET /registrations/export` silently drops rows past `EXPORT_LIMIT` (10,000). It must refuse instead of returning a short file.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app `apps/admin` (Next 16.4, Vitest 5). Read `apps/admin/AGENTS.md` before touching Next code.
- `apps/admin/src/lib/csv.ts` (21 lines): `FORMULA_START = /^[=+\-@\t\r]/`; `csvCell(value)` prefixes `'` to text matching it, then quotes if it contains `"`, `,`, CR or LF. Numbers are written as-is.
  Change: add `const PLAIN_PHONE = /^\+\d+$/;` and skip the prefix when `PLAIN_PHONE.test(value)`. Mobiles are always stored `+63` + 10 digits (`apps/web/src/lib/registration/schema.ts:19-25`), so nothing with letters or parentheses matches. Update the module doc comment (it says any cell starting `+` gets `'`).
- `apps/admin/src/lib/__tests__/csv.test.ts` (49 lines): add cases: `+639171234567` unchanged; `+63 917` (space), `+1+1`, `+cmd|' /C calc'!A0`, `+HYPERLINK("x")`, `+` alone and `-639171234567` still get `'`; `=1+1`, `@x` unchanged behaviour.
- `apps/admin/app/(dashboard)/registrations/export/route.ts`: `EXPORT_LIMIT = 10_000` (line 171); `GET` calls `requireSession()` then `listRegistrations(getDb(), session.role, { ...params, page: 1, pageSize: EXPORT_LIMIT })` and destructures `{ rows }`. `listRegistrations` (`packages/db/src/admin/queries.ts:219-275`) also returns `total` (the count of every matching row).
  Change: destructure `total` too; if `total > EXPORT_LIMIT` return `new Response("Too many rows to export (…). Narrow the filters and try again.", { status: 413, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } })` with the numbers in the message (counts only, no data) and no `Content-Disposition` (so the browser shows the message instead of saving a file). Update the comment above `EXPORT_LIMIT`: it is a refusal threshold now, not a silent truncation.
  `requireSession()` stays the first statement of `GET` and the masked query stays the only source of rows.
- `.../export/__tests__/route.test.ts` (77 lines) mocks `@/lib/auth/session` and `@rr/db/admin`'s `listRegistrations` (`mocks.listRegistrations.mockResolvedValue({ rows: [row] })`). That default has no `total`: update it to `{ rows: [row], total: 1 }`. Add: `total: 10_001` → status 413, `Cache-Control: no-store`, no `Content-Disposition`, body mentions narrowing; `total: 10_000` → still 200 CSV; the owner's `+639…` mobile appears unprefixed in the CSV (use an owner session and a row with `mobile: "+639171234567"`); the viewer's masked mobile unchanged.
- Review constraints: organizer access (login checked on the route itself), the viewer's masking happens in the query layer, API responses never cached, no personal data in messages.
- Scope: only the four listed files.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Change `listRegistrations` or its arguments.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/admin test
pnpm build
```
- The csv test proves `+639171234567` is unprefixed and `+cmd|…` is prefixed; the route test proves 413 above the cap and 200 at it.
