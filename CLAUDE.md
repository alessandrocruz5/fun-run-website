# CLAUDE.md — Riverline Run

## Project

- Jira key: FRW
- Riverline Run is a **fictional** fun run by the fictional Clearwater Collective. It is a
  portfolio project: test data and PayMongo test mode only, never real payments.
- pnpm + Turborepo monorepo, package scope `@rr/*`. The layout mirrors `wedding-website`.
  - `apps/web` (`@rr/web`): Next.js runner site on Vercel, region `sin1`.
  - `packages/config` (`@rr/config`): shared tsconfig, ESLint flat config and Prettier config.
  - `packages/env` (`@rr/env`): `createEnv`, zod-validated fail-fast env loading.
  - Workspace packages ship TypeScript source, not builds.
- Plan and merge ledger: [TASKS.md](TASKS.md). Release history: [CHANGELOG.md](CHANGELOG.md).
  Operations: [docs/runbook.md](docs/runbook.md).

## Commands

Run from the repo root, in this order. All must pass before a PR, and CI runs the same steps.

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm format` fixes formatting. `pnpm --filter @rr/web dev` serves the site on
<http://localhost:3000>.

## Review constraints

Each of these is a merge Blocker when violated.

- **The build reads no env.** Read variables per request (or lazily) through `createEnv`, never at
  module top level in code that `next build` evaluates. CI and Vercel build with no variables set.
- **Test mode only.** The env rejects any PayMongo key that doesn't start with `sk_test_`, and the
  webhook rejects `livemode: true`. Every page shows "Fictional event · Test mode, no real
  payments".
- **Payment status comes only from the server.** It comes from a server-side checkout-session
  lookup or the signed webhook. Both call one idempotent `confirmPayment()`. URL parameters are
  never trusted. The price comes from `RACES` on the server, is snapshotted on the row and is
  checked against the paid amount.
- **Personal data (RA 10173).** No personal data in logs, error messages or PayMongo metadata.
  Consent is required and saved with a timestamp. The `/privacy` notice must match what is stored
  and how long it is kept.
- **Database roles.** The app connects only as its non-owner login role. Migrations run as the
  owner from a laptop, and `MIGRATE_DATABASE_URL` is never set in Vercel. Migrations are
  expand/contract, and an applied migration is never edited.
- **Email only after payment**, and the public form is behind Turnstile.
- **API responses are never cached.** `/api/*` sends `Cache-Control: no-store` (set in
  `apps/web/next.config.ts`).
- **Secrets stay on the server.** No secret gets a `NEXT_PUBLIC_` prefix or reaches a client
  component.
- **Scope.** Edit only the unit's files listed in TASKS.md, and don't refactor adjacent code.

## High-stakes paths

A diff touching any of these gets the code-guardian review before merge, on top of green CI.

- `packages/db/**` (schema, migrations, grants, race prices)
- `packages/payments/**`
- `packages/email/**`
- `apps/web/src/lib/registration/**`
- `apps/web/app/api/webhooks/**`
- `apps/web/app/register/**`
- `apps/web/app/privacy/**`
- `.github/workflows/**`
