# Runbook

Operational procedures for Riverline Run. CLI commands assume `cd apps/web` with the project
linked (`vercel link`). Sections marked _TBD_ are filled in by the unit named.

## Vercel project (once)

- Root directory `apps/web`, framework Next.js, production branch `main`. Keep "Include files
  outside the root directory" on: the build runs from the monorepo root.
- `apps/web/vercel.json` sets the build command (`turbo run build --filter=@rr/web`) and pins
  functions to `sin1` (Singapore), next to the Neon `ap-southeast-1` database.
- The build needs no environment variables. Variables added later are runtime-only.

## Deploy

1. Push a branch or open a PR. CI runs format check, lint, typecheck, tests and build. Vercel
   builds a **Preview**, which needs a Vercel login (Deployment Protection).
2. Merge to `main`. Vercel builds and promotes **Production**.
3. Smoke-test production:
   ```sh
   curl -si https://<prod-domain>/api/health | grep -iE '^HTTP|^cache-control'
   # HTTP/2 200 and cache-control: no-store; the body is {"status":"ok"}
   curl -s https://<prod-domain>/ | grep -c 'Test mode, no real payments'   # at least 1
   ```

## Migrations

_TBD (FRW-3)._

## Payments (PayMongo test mode)

_TBD (FRW-5, FRW-6)._

## Bot protection (Turnstile)

_TBD (FRW-7)._

## Email (Resend)

_TBD (FRW-8)._

## Roll back

- **App:** Vercel dashboard → Deployments → the last good production deploy → **Instant
  Rollback**, or `vercel rollback <deployment-url>`. It takes effect at once, with no rebuild.
- **Schema / data:** _TBD (FRW-3)._

## Env var changes

Env changes apply only to **new** deployments. After editing a variable, redeploy: Deployments →
latest → **Redeploy**, or push a commit.

## Incidents

- **Liveness:** `GET /api/health` returns `200 {"status":"ok"}` with `Cache-Control: no-store`. It
  touches no database, so it stays up when Neon is down or asleep.
- **Logs:** `vercel logs <deployment-url>`, or the dashboard's Logs tab. Env validation failures
  fail fast with `Invalid environment variables:` and list the offending keys, never their values.
