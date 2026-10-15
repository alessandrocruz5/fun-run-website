---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 13
unit: FRW-23
status: done
model: sonnet
effort: medium
depends_on: [09, 10, 11, 12]
parallel_group: A
files:
  create:
    - "packages/e2e/package.json"
    - "packages/e2e/tsconfig.json"
    - "packages/e2e/eslint.config.js"
    - "packages/e2e/playwright.config.ts"
    - "packages/e2e/tests/origins.ts"
    - "packages/e2e/tests/smoke.spec.ts"
  modify:
    - "package.json"
    - ".gitignore"
    - "pnpm-lock.yaml"
  delete: []
---
# 13 · `@rr/e2e`: Playwright workspace that starts both built apps with dummy env

## Task
Create a new workspace package `packages/e2e` (`@rr/e2e`) holding a Playwright setup that, after `pnpm build`, starts the built web app (port 3000) and admin app (port 3001) with **dummy env and no database**, and runs the specs prompts 14 and 15 add. Add a root `pnpm e2e` script. The suite is deliberately outside `pnpm test` (which stays Vitest-only and fast). Prompt 16 wires it into CI.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`; pnpm 10 workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), Node 24 (`.nvmrc`), Turborepo (`turbo.json` tasks `build`, `lint`, `typecheck`, `test`).
- Copy the package shape of `packages/env`: `package.json` (`"private": true`, `"type": "module"`, `lint`/`typecheck` scripts, `@rr/config` workspace devDependency, `eslint`, `typescript`, `@types/node` at the same versions), `tsconfig.json` (`packages/db/tsconfig.json` is 4 lines: `{ "extends": "@rr/config/tsconfig/base.json", "include": [...] }` with include `["tests", "playwright.config.ts"]`), `eslint.config.js` (`export { default } from "@rr/config/eslint";`).
- **No `test` script** in `@rr/e2e` (so turbo's `test` skips it); its script is `"e2e": "playwright test"`. Add `"e2e": "pnpm --filter @rr/e2e e2e"` to the root `package.json` scripts.
- New dev dependency (justified: the browser-level CSP and header checks can't be done any other way): `@playwright/test`. Add with `pnpm --filter @rr/e2e add -D @playwright/test` and keep the resulting caret range; commit the lockfile change (`pnpm install --frozen-lockfile` must pass afterwards). Then install the browser once locally: `pnpm --filter @rr/e2e exec playwright install chromium`.
- `playwright.config.ts`:
  - `testDir: "./tests"`, chromium project only, `fullyParallel: true`, `retries: process.env.CI ? 1 : 0`, `reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list"`, `use.baseURL` unset (specs use the two origins below, exported as constants `WEB = "http://localhost:3000"` and `ADMIN = "http://localhost:3001"` from `tests/origins.ts`: create that tiny file too; add it to your files and report it).
  - `webServer` array with two entries, each `reuseExistingServer: !process.env.CI`, `timeout: 120_000` and readiness by **`port`** (web `port: 3000`, admin `port: 3001`), not `url`: the admin app has no health route, and a 404 may not count as ready for `url`:
    - web: `command: "pnpm --filter @rr/web start"`, `env`: `SITE_URL=http://localhost:3000`, `PAYMONGO_WEBHOOK_SECRET=whsk_e2e_dummy_secret`, `NODE_ENV=production`. **No `DATABASE_URL`, no `PAYMONGO_SECRET_KEY`, no `TURNSTILE_*`, no `RESEND_*`.**
    - admin: `command: "pnpm --filter @rr/admin start"` (it already passes `--port 3001`), `env`: `BETTER_AUTH_URL=http://localhost:3001`, `BETTER_AUTH_SECRET=e2e-dummy-secret-not-for-real-use-0000` (exactly this literal; 38 characters, the app needs at least 32; it is not a secret), `DATABASE_URL=postgres://e2e:e2e@127.0.0.1:1/e2e` (a dead address: the specs must never reach a database), `NODE_ENV=production`.
  - `stdout: "pipe"` is not needed. The specs may not depend on seed data or a live DB.
  - Do not start `next build`: `pnpm build` ran earlier (locally and in CI); say so in a comment. If `.next` is missing the server won't start: that is the intended failure.
- `.gitignore`: add `playwright-report/`, `test-results/` and `/blob-report/` under a `# playwright` heading, matching the file's existing comment style.
- `playwright test` with zero tests exits 1; to prove the wiring add `packages/e2e/tests/smoke.spec.ts` with one test that GETs `${WEB}/api/health` through Playwright's `request` fixture, expects 200, `{ status: "ok" }` and `cache-control: no-store`, and GETs `${ADMIN}/api/auth/sign-up/email` expecting 404 (prompts 14 and 15 remove it). Prompts 14 and 15 add the real specs; this file may be deleted by them if they cover it (leave that to 14). Add the file to your report.
- Review constraints: the build reads no env (nothing here builds), secrets stay on the server (only obviously fake values; no real keys anywhere; never put anything secret-looking in the repo), test mode only.
- Scope: the listed files.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies other than `@playwright/test`, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Add a `test` script to `@rr/e2e` or change `turbo.json`.

## Done when
```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```
- `pnpm e2e` starts both apps from the build, passes the smoke test and leaves no server running (`ss -ltn | grep -E ':3000|:3001'` is empty afterwards).
- `pnpm test` still runs only Vitest suites (the new package is absent from its output).
