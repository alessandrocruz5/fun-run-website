---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 11
unit: FRW-22
status: done
model: sonnet
effort: medium
depends_on: []
parallel_group: A
files:
  create:
    - "apps/web/app/error.tsx"
    - "apps/web/app/global-error.tsx"
    - "apps/web/app/__tests__/error.test.tsx"
  modify: []
  delete: []
---
# 11 · Public site: safe error screens

## Task
`apps/web` has no `error.tsx` or `global-error.tsx`, so an uncaught server error shows Next's default. Add both. Neither may show the error's message or stack, and `global-error` (which replaces the root layout) must still show the "Fictional event · Test mode, no real payments" banner: it is a project-wide constraint that every page shows it.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. Web app `apps/web` (Next 16.4.0). **Read first**: `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` and the `error.js` / `global-error.js` file-convention references in the same docs tree (check the exact props Next 16.4 passes: `error` with `digest`, and `reset` and/or a newer retry prop; use what the docs say, not memory).
- Both files are client components (`"use client"`). Existing look: `apps/web/app/not-found.tsx` (16 lines) is the pattern: `<main className="wrap prose">`, `<p className="mono">…eyebrow…</p>`, `<h1 className="disp">…</h1>`, `ButtonLink` from `@rr/ui` for actions. Styles are in `apps/web/app/globals.css` (class names `wrap`, `prose`, `mono`, `disp`, `row`). `TestModeBanner` is `apps/web/src/components/test-mode-banner.tsx` (it reads `SITE.testModeNotice` from `@/content/site`, safe on the client).
- `app/error.tsx`: renders inside the root layout (banner, header and footer are already there). Content: eyebrow "SOMETHING WENT WRONG", h1 "We hit a snag.", one sentence ("Nothing was charged. If you were paying, your payment is safe: open the confirmation page again in a minute, or start over."), a "Try again" button that calls the reset/retry function, and a link back to `/`. If `error.digest` exists show it as a small mono "Reference: <digest>" (a hash that matches the Vercel log line, not personal data). **Never render `error.message`/`stack`.**
- `app/global-error.tsx`: must render its own `<html lang="en"><body>`; import `./globals.css` so it is styled; render `<TestModeBanner />` first, then the same copy without relying on the header/footer. No fonts from `next/font` needed (falls back to system fonts), keep it dependency-light.
- Logging: Next already logs server errors with the digest on the server; do not add `console.error` of the error object on the client (it could carry a message with personal data). No new libraries.
- Test `apps/web/app/__tests__/error.test.tsx` (Vitest; render with `renderToStaticMarkup` from `react-dom/server`; pattern for component tests: `packages/ui/src/components/components.test.tsx`; `apps/web/vitest.config.ts` already sets the automatic JSX runtime): with `new Error("boom: juana@example.test")` (give it `digest: "abc123"`): `Error` page markup contains "We hit a snag" and "abc123" and **not** `boom` or `juana@example.test`; `GlobalError` markup contains `<html`, the banner text `SITE.testModeNotice` and not the message. If importing `globals.css` breaks Vitest, check how other tests deal with CSS imports (they usually don't import pages that import CSS) and mock it with `vi.mock("../globals.css", () => ({}))`.
- Review constraints: every page shows "Fictional event · Test mode, no real payments"; no personal data in error messages; build reads no env.
- Scope: the three listed files only.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @rr/web test
pnpm build
```
- The test proves neither screen leaks the message and `global-error` includes the banner. Optional but preferred: in `pnpm --filter @rr/web dev`, temporarily throw in a page to see the screen, then revert it (report that you did, or that you didn't).
