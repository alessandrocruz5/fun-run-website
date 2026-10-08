# Riverline Run

Registration site for **Riverline Run**, a fictional fun run organized by the fictional Clearwater
Collective. It is a portfolio project: payments run in PayMongo **test mode** only, and no real
event takes place.

> Fictional event · Test mode, no real payments

## Packages

| Package                                             | Role                                                       |
| --------------------------------------------------- | ---------------------------------------------------------- |
| [`apps/web`](apps/web) (`@rr/web`)                  | Next.js runner site: placeholder page and `/api/health`    |
| [`packages/env`](packages/env) (`@rr/env`)          | `createEnv`: zod-validated, fail-fast environment loading  |
| [`packages/config`](packages/config) (`@rr/config`) | Shared tsconfig, ESLint flat config and Prettier config    |

Stack: Next.js 16, React 19, Tailwind v4, Vitest, pnpm + Turborepo, Vercel (`sin1`).

## Run it locally

Requirements: Node 24 (`nvm use`) and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm --filter @rr/web dev   # http://localhost:3000
```

The build needs no environment variables.

## More

- [docs/runbook.md](docs/runbook.md): deploy, rollback, incidents
- [TASKS.md](TASKS.md) and [CHANGELOG.md](CHANGELOG.md): planning ledger and release history

## License

[MIT](LICENSE)
