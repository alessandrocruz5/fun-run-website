---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 16
unit: FRW-23
status: done
model: opus
effort: high
depends_on: [15]
parallel_group: A
files:
  create: []
  modify: [".github/workflows/ci.yml", "CLAUDE.md", "docs/runbook.md"]
  delete: []
---
# 16 · Run `pnpm e2e` in CI after the build, and add it to Commands

## Task
Make the Playwright smoke suite part of the merge gate: install Chromium in the `verify` job and run `pnpm e2e` right after `pnpm build`. Record `pnpm e2e` in `CLAUDE.md` Commands and document the suite in the runbook.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website`. `.github/workflows/ci.yml` is a **high-stakes** file: job `verify` (checkout `actions/checkout@v7`, optional Turborepo remote cache, `pnpm/action-setup@v6`, `actions/setup-node@v7` with `node-version-file: .nvmrc` and `cache: pnpm`, then `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` with the comment "Same build Vercel runs, with no env…"). Prompt 01 added a separate `secrets` job: leave it alone.
- Add after `pnpm build` (inside `verify`, so the build output exists):
  1. `- run: pnpm --filter @rr/e2e exec playwright install --with-deps chromium`, preceded by an `actions/cache@<current major>` step for `~/.cache/ms-playwright` keyed on the Playwright version (`key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}`; with `--with-deps` still run on cache hit since it also installs OS packages: `playwright install-deps chromium` on hit and `install --with-deps chromium` on miss is the documented split: verify in Playwright's CI docs and keep it as simple as is correct; check the latest `actions/cache` major with `gh release list -R actions/cache --limit 3`, don't guess).
  2. `- run: pnpm e2e`.
  3. An `actions/upload-artifact@<current major>` step with `if: failure()` uploading `packages/e2e/playwright-report` and `packages/e2e/test-results` (retention 7 days; the reports contain only dummy-env pages).
  Comment each non-obvious step in one line (e.g. "No DB or secrets: the apps start from the build above with dummy env, like `pnpm build`.").
- Keep `permissions` as they are (`contents: read`, `id-token: write`); adding no secrets. Don't touch the Turborepo cache steps.
- `CLAUDE.md` `## Commands`: the list is "Run from the repo root, in this order. All must pass before a PR, and CI runs the same steps." with a fenced block ending `pnpm build`. Add `pnpm e2e` after `pnpm build` and one sentence that it needs the browser once (`pnpm --filter @rr/e2e exec playwright install chromium`) and runs the built apps with dummy env. Change nothing else in `CLAUDE.md`.
- `docs/runbook.md`: add a `## Browser smoke tests (CI)` section after `## Security headers` (prompt 09) and before `## Roll back` (prompt 17's `## Pre-release verification` goes after yours): what `pnpm e2e` checks (banner on every page, `no-store` on `/api/*`, CSP and security headers, webhook rejects a bad signature before the database, admin redirects and no sign-up), that it starts both built apps with dummy env and no database, what it cannot check (real DB, PayMongo, Resend, Turnstile: see Pre-release verification), how to run it locally (`pnpm build && pnpm e2e`), how to open the HTML report from a failed CI run, and that a new third-party origin must be added to the CSP and then these specs.
- Review constraints: the build reads no env (e2e runs *after* the build with its own dummy env), secrets stay out of the repo (no real secret anywhere), CI runs the same steps as the Commands list.
- Scope: the three listed files.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Change the `verify` steps before `pnpm build`, the `secrets` job, or `permissions`.

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
- The workflow file parses as YAML and `grep -n 'pnpm e2e' .github/workflows/ci.yml CLAUDE.md` shows both. State clearly that the CI run itself can only be confirmed on the PR (report the green/red result once the PR's CI finishes, if you can see it with `gh run list`; otherwise say it is unverified).
