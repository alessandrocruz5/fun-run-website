---
type: prompt
plan: "[[2026-10-15-mvp-hardening]]"
id: 01
unit: FRW-15
status: done
model: opus
effort: high
depends_on: []
parallel_group: A
files:
  create: [".github/dependabot.yml"]
  modify: ["apps/admin/.env.example", ".github/workflows/ci.yml", "docs/runbook.md"]
  delete: []
---
# 01 · Remove the committed secret, add secret scanning and Dependabot

## Task
`apps/admin/.env.example` is tracked and, since commit `c5efb3f` (now on `origin/main` and `origin/develop`), its `BETTER_AUTH_SECRET=` line holds a real-looking non-empty value. Replace it with an empty value, add a gitleaks job to CI so a secret in a PR or push fails the build, add Dependabot, and document what to do when a secret is exposed.

## Context
- Repo root: `/home/apa/Documents/Code/portfolio/fun-run-website` (pnpm + Turborepo monorepo, `@rr/*`). You are on the unit's branch; never create, switch or rename branches, commit or push.
- **Never print the leaked value** (not in your output, the runbook, a commit message or a test). Check only its presence/shape, e.g. `grep -c '^BETTER_AUTH_SECRET=.' apps/admin/.env.example`. The owner rotates the real secret separately; the runbook should say to rotate, not rewrite history.
- Pattern for the example file: `apps/web/.env.example` (every secret key is `NAME=` with a comment above it). Keep the existing comment above `BETTER_AUTH_SECRET` (it already says `openssl rand -base64 32`, at least 32 characters, server only); leave every other line unchanged. `DEMO_VIEWER_EMAIL=`/`DEMO_VIEWER_PASSWORD=` are already empty.
- CI: `.github/workflows/ci.yml` has one job `verify` (checkout `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`). It triggers on `pull_request` and `push` to `main`. Leave `verify` byte-for-byte as is. Add a **separate job `secrets`**: `actions/checkout@v7` with `fetch-depth: 0`, then `gitleaks/gitleaks-action` using `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. Find the latest released major tag with `gh release list -R gitleaks/gitleaks-action --limit 3` (or `gh api repos/gitleaks/gitleaks-action/releases/latest --jq .tag_name`) and pin to that major (e.g. `@v2`); do not guess. Job `permissions: contents: read` (add `pull-requests: read` only if the action needs it for PR scans: check its README via `gh api`). This repo is on a personal GitHub account, so no `GITLEAKS_LICENSE` is needed; if the action's README says otherwise for this case, stop and report. The action scans the pushed/PR commit range, not full history, so the already-leaked commit does not fail every future run: confirm that from the README and say so in your final report.
- Dependabot: create `.github/dependabot.yml` (version 2) with `npm` (directory `/`, weekly, `groups` so minor/patch updates for the whole workspace arrive as one PR, `open-pull-requests-limit: 5`) and `github-actions` (directory `/`, weekly). pnpm workspaces are covered by the `npm` ecosystem.
- Runbook: `docs/runbook.md` has a `## Incidents` section at the end. Add a `### Secret exposure` subsection under it: (1) treat any secret committed to git as public: rotate it, don't just delete the line; (2) for `BETTER_AUTH_SECRET`: `openssl rand -base64 32`, set in the admin Vercel project (Production and Preview), redeploy; it signs every organizer out and needs no re-seed; (3) other secrets (`PAYMONGO_*`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, database passwords): roll in the provider's dashboard, update Vercel, redeploy; database logins via `ALTER ROLE ... PASSWORD` as the owner; (4) do not rewrite `main`'s history: rotation makes the old value dead; (5) the `secrets` CI job and GitHub's secret scanning/push protection catch the next one. Match the runbook's existing tone and bullet style.
- If the `secrets` job flags this PR itself (the removed line still contains the old value in the patch), stop and report instead of adding a `.gitleaksignore`: that file isn't in `files` and the owner decides how to handle it.
- Review constraints in play: "Secrets stay on the server" (this unit exists because of it), "`.github/workflows/**` is high-stakes" (keep the diff minimal and explain each step in a one-line YAML comment where non-obvious).
- Scope: edit only the four files listed.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.
- Change the `verify` job or add `pnpm audit` as a blocking step.
- Print, copy or paraphrase the leaked secret anywhere.

## Done when
```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
- `grep -nE '^BETTER_AUTH_SECRET=$' apps/admin/.env.example` prints one line.
- `grep -rn 'gitleaks' .github/workflows/ci.yml` shows the new job; `grep -c 'name: verify\|verify:' .github/workflows/ci.yml` still shows the original job unchanged.
- The YAML parses: `node -e "require('node:fs').readFileSync('.github/dependabot.yml','utf8')"` and a YAML check of both files if a parser is available (`pnpm dlx yaml-lint` is NOT to be added as a dependency; skip if none is installed).
