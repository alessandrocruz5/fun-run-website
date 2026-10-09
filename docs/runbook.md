# Runbook

Operational procedures for Riverline Run. CLI commands assume `cd apps/web` with the project
linked (`vercel link`). Sections marked _TBD_ are filled in by the unit named.

## Vercel project (once)

- Root directory `apps/web`, framework Next.js, production branch `main`. Keep "Include files
  outside the root directory" on: the build runs from the monorepo root.
- `apps/web/vercel.json` sets the build command (`turbo run build --filter=@rr/web`) and pins
  functions to `sin1` (Singapore), next to the Neon `ap-southeast-1` database.
- The build needs no environment variables. Variables added later are runtime-only.

## Site URL

- `SITE_URL` is the public origin with no trailing slash, e.g. `https://<prod-domain>`. It is
  read per request for page metadata, `robots.txt`, `sitemap.xml` and the share image. If it is
  missing, `robots.txt`, `sitemap.xml`, the share image and link-preview crawlers (Facebook, X)
  get a 500. Browsers still get the page, without its metadata. The logs name `SITE_URL`.
- Set it in Vercel for **Production** and **Preview**. Previews can use the production URL. Then
  redeploy. Locally, copy `apps/web/.env.example` to `apps/web/.env.local`.
- Check it:
  ```sh
  curl -s https://<prod-domain>/robots.txt | grep -i '^sitemap'   # Sitemap: https://<prod-domain>/sitemap.xml
  ```

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

Neon project in `ap-southeast-1` with branches `main` (production) and `dev`. Migrations run as
the owner, from a laptop, and never from CI or Vercel.

1. Put the branch's **direct** (non-pooled) owner URL in `packages/db/.env` as
   `MIGRATE_DATABASE_URL` (see `packages/db/.env.example`). Never add it to Vercel.
2. Apply to `dev` first, then `main`:
   ```sh
   pnpm --filter @rr/db db:migrate
   ```
3. **Once per Neon branch, after migration `0001`:** create the app's login role. Use SQL
   (`psql` or the Neon SQL editor, as the owner), **not** the Neon Console: Console roles join
   `neon_superuser` and would bypass the least-privilege grants.
   ```sql
   -- password: openssl rand -base64 32
   CREATE ROLE rr_app_login LOGIN PASSWORD '<password>' IN ROLE rr_app;
   ```
4. `DATABASE_URL` = the **pooled** URL (`-pooler` host) with `rr_app_login`. Set it in Vercel
   (Production → `main` branch; Preview → `dev` branch) and in `apps/web/.env.local`, then
   redeploy.
5. Check the role is least-privilege:
   ```sh
   psql "$DATABASE_URL" -c "DELETE FROM registrations WHERE false"
   # ERROR:  permission denied for table registrations
   ```

New schema changes: edit `packages/db/src/schema/`, then
`pnpm --filter @rr/db db:generate --name <name>` and commit the SQL and `meta/`. Changes are
expand/contract: add first, deploy the code that uses it, and remove the old shape in a later
migration. An applied migration is never edited. A new table needs its own `GRANT` to `rr_app`
in the migration.

## Payments (PayMongo test mode)

- **Key.** PayMongo Dashboard → Developers → API keys, in **test mode**. Only the secret key is
  used: Hosted Checkout needs no public key. Set `PAYMONGO_SECRET_KEY` in Vercel (Production and
  Preview) and in `apps/web/.env.local`, then redeploy. Anything not starting `sk_test_` fails
  validation: the form shows its retry message and the logs show `registration.checkout_failed`
  naming `PAYMONGO_SECRET_KEY`. Never use a live key or a `NEXT_PUBLIC_` prefix.
- **Flow.** The form's server action saves a `pending` row (price from `RACES`), creates a
  checkout session whose only metadata is `registration_id`, saves the `cs_…` ID on the row, sets
  the httpOnly `rr_checkout` cookie (path `/register`, 24 hours) and redirects to
  `checkout.paymongo.com`. Card, GCash, Maya and GrabPay are offered; all are simulated in test
  mode. PayMongo sends the runner back to `SITE_URL/register/success`, or `/register/cancelled`
  from its back link.
- **Confirmation.** `/register/success` ignores its URL. It takes the session ID from the cookie,
  finds the row, reads the session from PayMongo and calls `confirmPayment()`. The row becomes
  `paid`, with payment ID, method, fee, net and `paid_at`, only when a payment is `paid`, not live
  mode, in PHP and equal to the row's `amount_centavos`. Reloading the page is safe.
- **End-to-end check (production).** Register on the production site and pay with card
  `4343 4343 4343 4345`, any future expiry and any CVC. The success page must say **Confirmed**.
  Then, in the Neon SQL editor on `main`:
  ```sql
  SELECT reference, status, amount_centavos, payment_method, fee_centavos, net_centavos, paid_at
  FROM registrations ORDER BY created_at DESC LIMIT 1;
  -- status paid, payment_method card, fee/net/paid_at filled in
  ```
- **Previews.** When Preview's `SITE_URL` is the production URL, PayMongo returns the runner to
  production, which doesn't have the preview's cookie: the success page says it can't find the
  checkout. Test payments on production, or locally with `DATABASE_URL` on the `dev` branch.
- **Logs** carry IDs, reasons and PayMongo error codes, never personal data:
  - `registration.checkout_failed`: PayMongo refused or didn't answer, or the database or env
    failed. The row (if any) was set `cancelled`, and the runner saw a retry message.
  - `payment.check_failed`: the success page couldn't reach PayMongo or the database. The runner
    is told to check again.
  - `payment.rejected` with a `reason`. `amount_mismatch` means the paid amount differs from the
    snapshot: investigate, and never set a row to `paid` by hand. The others are `livemode`,
    `metadata_mismatch`, `unknown_session` and `not_recorded`.
- **Paid but still `pending`:** the runner didn't get back to the success page. Opening
  `/register/success` in the same browser within 24 hours records it.
- **Webhook:** _TBD (FRW-6)._

## Bot protection (Turnstile)

_TBD (FRW-7)._

## Email (Resend)

_TBD (FRW-8)._

## Roll back

- **App:** Vercel dashboard → Deployments → the last good production deploy → **Instant
  Rollback**, or `vercel rollback <deployment-url>`. It takes effect at once, with no rebuild.
- **Schema:** never down-migrate or edit an applied migration. Because migrations are
  expand/contract, the previous app deploy still runs on the newer schema: roll back the app
  first, then fix forward with a new migration.
- **Data:** Neon Console → the branch → **Restore** to a point in time inside the plan's history
  window. Restore `dev` first to check the result. A restore also rewinds the roles, so re-check
  `rr_app_login` afterwards.

## Env var changes

Env changes apply only to **new** deployments. After editing a variable, redeploy: Deployments →
latest → **Redeploy**, or push a commit.

## Incidents

- **Liveness:** `GET /api/health` returns `200 {"status":"ok"}` with `Cache-Control: no-store`. It
  touches no database, so it stays up when Neon is down or asleep.
- **Logs:** `vercel logs <deployment-url>`, or the dashboard's Logs tab. Env validation failures
  fail fast with `Invalid environment variables:` and list the offending keys, never their values.
