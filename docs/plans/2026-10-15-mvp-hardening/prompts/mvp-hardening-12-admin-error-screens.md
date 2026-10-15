---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 12
unit: FRW-22
status: done
model: sonnet
effort: medium
depends_on: [11]
parallel_group: B
files:
  create:
    - "apps/admin/app/error.tsx"
    - "apps/admin/app/global-error.tsx"
    - "apps/admin/app/__tests__/error.test.tsx"
  modify: []
  delete: []
---
# 12 · Organizer dashboard: safe error screens

## Task
Same as prompt 11 for `apps/admin`: add `app/error.tsx` and `app/global-error.tsx`. Neither shows the error's message or stack; `global-error` still shows the test-mode banner. Mirror the web app's files for structure and tests.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Admin app `apps/admin` (Next 16.4.0, read `apps/admin/AGENTS.md`). First read what prompt 11 created: `apps/web/app/error.tsx`, `apps/web/app/global-error.tsx`, `apps/web/app/__tests__/error.test.tsx`, and the same Next docs (`apps/admin/node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`) for the props Next 16.4 passes.
- Admin differences: the banner is inline markup in `apps/admin/app/layout.tsx:36-44` (`<aside aria-label="Test mode" className="banner mono"><p className="m-0 leading-[1.4]"><span aria-hidden="true">● </span>Fictional event · Test mode, no real payments</p></aside>`); there is no shared banner component and you must not extract one (out of scope). `global-error.tsx` repeats that markup verbatim and imports `./globals.css` (`apps/admin/app/globals.css`, Tailwind v4 + `@rr/ui` tokens).
- `app/error.tsx` sits at the root `app/` so it covers `app/(dashboard)` and `/login` (the dashboard layout, which calls `requireSession()`, is inside it: an auth redirect is not an error and isn't affected: Next redirects with a special thrown value that error boundaries don't catch). Copy: eyebrow "SOMETHING WENT WRONG", h1 "Something went wrong.", "Nothing was changed: the dashboard only reads registrations. Try again, or sign in again.", a "Try again" button (the reset/retry from the docs) and a link to `/` (which redirects to `/login` when signed out). Show `Reference: <digest>` when present. **Never render the message or stack.** Use `Button`/`ButtonLink` from `@rr/ui` as `apps/admin/app/login/page.tsx` does.
- Test `apps/admin/app/__tests__/error.test.tsx` as in prompt 11 (a message containing an email must not appear; `GlobalError` contains `<html`, "Fictional event · Test mode, no real payments" and not the message). `apps/admin/vitest.config.ts` has the automatic JSX runtime; mock `../globals.css` if needed.
- Review constraints: every page shows "Fictional event · Test mode, no real payments"; no personal data in error messages; organizer access untouched (no data function or session check is added or bypassed here).
- Scope: the three listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Edit `app/layout.tsx` or the dashboard layout.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/admin test
pnpm build
```
- The tests prove no message leak and the banner on `global-error`.
